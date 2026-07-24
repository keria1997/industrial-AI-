import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { buildProductionApp } from "../src/app.js";
import { InMemoryProductionRepository } from "../src/memory-store.js";

type App = ReturnType<typeof buildProductionApp>;

describe("Production P0 API", () => {
  let app: App;
  let repository: InMemoryProductionRepository;

  beforeEach(() => {
    repository = new InMemoryProductionRepository();
    app = buildProductionApp(repository);
  });
  afterEach(async () => { await app.close(); });

  const headers = (actor = "user-a", key = randomUUID(), tenant = "tenant-a", extra: Record<string, string> = {}) => ({
    "x-tenant-id": tenant,
    "x-actor-id": actor,
    "x-permissions": "*",
    "x-permission-version": "pv-1",
    "x-idempotency-key": key,
    "x-trace-id": randomUUID(),
    ...extra,
  });

  async function createDemand(tenant = "tenant-a", key = randomUUID()) {
    return app.inject({ method: "POST", url: "/api/v1/production/demands", headers: headers("planner", key, tenant), payload: {
      sourceType: "MANUAL", productId: "FG-001", productName: "成品 A", qty: "100", uom: "PCS",
      dueDate: "2026-08-01", factoryResourceId: "factory-1",
    } });
  }

  async function createReleasedOrder(quantity = "100") {
    const create = await app.inject({ method: "POST", url: "/api/v1/production/work-orders", headers: headers("planner"), payload: {
      productId: "FG-001", productName: "成品 A", factoryResourceId: "factory-1", workCenterResourceId: "wc-1",
      plannedQty: quantity, inputQty: quantity, uom: "PCS", dueDate: "2026-08-01", bomSnapshotId: randomUUID(),
      routingSnapshotId: randomUUID(), scheduleCandidateId: randomUUID(), kittingStatus: "READY",
    } });
    expect(create.statusCode).toBe(201);
    const order = create.json();
    const release = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/release`,
      headers: headers("supervisor", randomUUID(), "tenant-a", { "if-match": `"${order.version}"` }), payload: { reason: "计划已确认" } });
    expect(release.statusCode).toBe(200);
    const start = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/start`, headers: headers("operator"), payload: {} });
    expect(start.statusCode).toBe(200);
    return start.json();
  }

  async function reportAndPassFqc(orderId: string, quantity = "100") {
    const report = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${orderId}/reports`, headers: headers("operator"),
      payload: { goodQty: quantity, defectQty: "0", scrapQty: "0", inputQty: "0", uom: "PCS" } });
    expect(report.statusCode).toBe(201);
    const inspection = await app.inject({ method: "POST", url: "/api/v1/production/inspections", headers: headers("inspector"),
      payload: { workOrderId: orderId, sampleQty: quantity } });
    expect(inspection.statusCode).toBe(201);
    const result = await app.inject({ method: "POST", url: `/api/v1/production/inspections/${inspection.json().id}/result`, headers: headers("inspector"),
      payload: { passedQty: quantity, failedQty: "0" } });
    expect(result.statusCode).toBe(200);
    return result.json();
  }

  async function createCompletion(orderId: string, inspectionId: string, quantity = "100", traceMode: "NONE" | "SERIAL" = "NONE", serialNumbers?: string[]) {
    return app.inject({ method: "POST", url: `/api/v1/production/work-orders/${orderId}/completions`, headers: headers("supervisor"), payload: {
      inspectionId, qty: quantity, uom: "PCS", warehouseResourceId: "platform-warehouse-1",
      inventoryWarehouseId: "inventory-warehouse-1", binId: "A-01", traceMode, serialNumbers,
      productionDate: "2026-07-23", allocationRevision: 1,
    } });
  }

  it("isolates tenant data even when IDs and codes are probed", async () => {
    const a = await createDemand("tenant-a");
    const b = await createDemand("tenant-b");
    expect(a.statusCode).toBe(201); expect(b.statusCode).toBe(201);
    const listA = await app.inject({ method: "GET", url: "/api/v1/production/demands", headers: headers("viewer", randomUUID(), "tenant-a") });
    const listB = await app.inject({ method: "GET", url: "/api/v1/production/demands", headers: headers("viewer", randomUUID(), "tenant-b") });
    expect(listA.json().total).toBe(1); expect(listB.json().total).toBe(1);
    expect(listA.json().items[0].tenantId).toBe("tenant-a"); expect(listB.json().items[0].tenantId).toBe("tenant-b");
  });

  it("replays identical idempotent commands and rejects key reuse with a different body", async () => {
    const key = randomUUID();
    const first = await createDemand("tenant-a", key);
    const replay = await createDemand("tenant-a", key);
    expect(first.statusCode).toBe(201); expect(replay.statusCode).toBe(201);
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.json().id).toBe(first.json().id);
    const conflict = await app.inject({ method: "POST", url: "/api/v1/production/demands", headers: headers("planner", key), payload: {
      sourceType: "MANUAL", productId: "FG-002", qty: "1", uom: "PCS", dueDate: "2026-08-01", factoryResourceId: "factory-1",
    } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe("PRODUCTION_409_IDEMPOTENCY_CONFLICT");
  });

  it("enforces optimistic locking and report quantity conservation", async () => {
    const create = await app.inject({ method: "POST", url: "/api/v1/production/work-orders", headers: headers("planner"), payload: {
      productId: "FG-001", factoryResourceId: "factory-1", workCenterResourceId: "wc-1", plannedQty: "100", inputQty: "80",
      uom: "PCS", dueDate: "2026-08-01", bomSnapshotId: randomUUID(), routingSnapshotId: randomUUID(), scheduleCandidateId: randomUUID(), kittingStatus: "READY",
    } });
    const order = create.json();
    const conflict = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/release`,
      headers: headers("supervisor", randomUUID(), "tenant-a", { "if-match": '"99"' }), payload: {} });
    expect(conflict.statusCode).toBe(409); expect(conflict.json().error.code).toBe("PRODUCTION_409_VERSION_CONFLICT");
    await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/release`, headers: headers("supervisor"), payload: {} });
    await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/start`, headers: headers("operator"), payload: {} });
    const overReport = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/reports`, headers: headers("operator"),
      payload: { goodQty: "81", defectQty: "0", scrapQty: "0", inputQty: "0", uom: "PCS" } });
    expect(overReport.statusCode).toBe(422); expect(overReport.json().error.code).toBe("PRODUCTION_422_QUANTITY_VIOLATION");
    expect(overReport.json().error.details.reportableLimit).toBe("80");
  });

  it("blocks completion until FQC passes and preserves unique serial numbers", async () => {
    const order = await createReleasedOrder("2");
    const report = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/reports`, headers: headers("operator"),
      payload: { goodQty: "2", inputQty: "0", uom: "PCS" } });
    expect(report.statusCode).toBe(201);
    const inspection = await app.inject({ method: "POST", url: "/api/v1/production/inspections", headers: headers("inspector"), payload: { workOrderId: order.id, sampleQty: "2" } });
    const blocked = await createCompletion(order.id, inspection.json().id, "1");
    expect(blocked.statusCode).toBe(409); expect(blocked.json().error.message).toContain("FQC");
    await app.inject({ method: "POST", url: `/api/v1/production/inspections/${inspection.json().id}/result`, headers: headers("inspector"), payload: { passedQty: "2", failedQty: "0" } });
    const first = await createCompletion(order.id, inspection.json().id, "1", "SERIAL", ["SN-0001"]);
    expect(first.statusCode).toBe(202);
    const duplicate = await createCompletion(order.id, inspection.json().id, "1", "SERIAL", ["SN-0001"]);
    expect(duplicate.statusCode).toBe(409); expect(duplicate.json().error.details.serialNumbers).toEqual(["SN-0001"]);
  });

  it("keeps timeout in POSTING, supports rejection retry, posts once, then requires two-person close", async () => {
    const order = await createReleasedOrder("100");
    const inspection = await reportAndPassFqc(order.id, "100");
    const submitted = await createCompletion(order.id, inspection.id, "100");
    expect(submitted.statusCode).toBe(202);
    const completionId = submitted.json().completionId;
    const unknown = await app.inject({ method: "POST", url: `/api/v1/production/internal/completions/${completionId}/inventory-result`,
      headers: headers("inventory-service"), payload: { result: "UNKNOWN" } });
    expect(unknown.statusCode).toBe(202); expect(unknown.json().status).toBe("POSTING"); expect(unknown.json().task.status).toBe("RETRY_WAIT");
    const rejected = await app.inject({ method: "POST", url: `/api/v1/production/internal/completions/${completionId}/inventory-result`,
      headers: headers("inventory-service"), payload: { result: "REJECTED", failureCode: "BIN_INVALID", failureMessage: "库位无效" } });
    expect(rejected.statusCode).toBe(200); expect(rejected.json().status).toBe("FAILED");
    const inventoryKey = rejected.json().inventoryIdempotencyKey;
    const retry = await app.inject({ method: "POST", url: `/api/v1/production/completions/${completionId}/retry`, headers: headers("supervisor"), payload: { binId: "A-02" } });
    expect(retry.statusCode).toBe(202); expect(retry.json().inventoryIdempotencyKey).toBe(inventoryKey);
    const posted = await app.inject({ method: "POST", url: `/api/v1/production/internal/completions/${completionId}/inventory-result`,
      headers: headers("inventory-service"), payload: { result: "POSTED", externalTransactionId: "INV-TX-001" } });
    expect(posted.statusCode).toBe(200); expect(posted.json().completion.status).toBe("POSTED"); expect(posted.json().workOrder.status).toBe("COMPLETED");
    const closeSubmit = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${order.id}/close-submit`, headers: headers("closer-a"), payload: { reason: "生产完成" } });
    expect(closeSubmit.statusCode).toBe(201);
    const selfApprove = await app.inject({ method: "POST", url: `/api/v1/production/work-order-closes/${closeSubmit.json().id}/approve`, headers: headers("closer-a"), payload: {} });
    expect(selfApprove.statusCode).toBe(403);
    const approved = await app.inject({ method: "POST", url: `/api/v1/production/work-order-closes/${closeSubmit.json().id}/approve`, headers: headers("closer-b"), payload: {} });
    expect(approved.statusCode).toBe(200); expect(approved.json().workOrder.status).toBe("CLOSED");
  });
});
