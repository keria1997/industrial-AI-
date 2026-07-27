import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProductionApp } from "../src/app.js";
import { InMemoryProductionRepository } from "../src/memory-store.js";

describe("Sales order to production intake", () => {
  let repository: InMemoryProductionRepository;
  let app: ReturnType<typeof buildProductionApp>;

  beforeEach(() => {
    repository = new InMemoryProductionRepository();
    app = buildProductionApp(repository, { allowInsecureHeaders: true });
  });
  afterEach(async () => { await app.close(); });

  const headers = (key = randomUUID()) => ({
    "x-tenant-id": "tenant-a",
    "x-actor-id": "sales-supervisor",
    "x-permissions": "*",
    "x-permission-version": "pv-1",
    "x-idempotency-key": key,
    "x-trace-id": randomUUID(),
  });

  const intakePayload = (orderedQty = "17") => ({
    salesOrderId: "SO-20260508-001",
    sourceLineId: "1",
    sourceRevision: 1,
    productId: "FG001",
    productName: "工业控制器顶配版",
    orderedQty,
    uom: "PCS",
    dueDate: "2026-08-01",
    factoryResourceId: "FAC-SH-01",
    inventoryWarehouseId: "WH-FG-01",
  });

  async function publishAvailability(availableQty: string, factVersion = 1, eventId = randomUUID()) {
    return app.inject({
      method: "POST",
      url: "/api/v1/production/internal/inventory-availability-events",
      headers: headers(),
      payload: {
        eventId,
        productId: "FG001",
        inventoryWarehouseId: "WH-FG-01",
        availableQty,
        uom: "PCS",
        factVersion,
        sourceSystem: "INVENTORY",
        asOf: new Date().toISOString(),
      },
    });
  }

  it("fails safely when no inventory fact exists", async () => {
    const response = await app.inject({
      method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(), payload: intakePayload(),
    });
    expect(response.statusCode).toBe(424);
    expect(response.json().error).toMatchObject({ code: "PRODUCTION_424_DEPENDENCY_FAILED", retryable: true });
    const snapshot = repository.snapshot();
    expect(snapshot.demands.size).toBe(0);
    expect(snapshot.salesOrderIntakes.size).toBe(0);
    expect(snapshot.outbox).toHaveLength(0);
    expect(snapshot.idempotency.size).toBe(0);
  });

  it("deduplicates inventory events and ignores stale fact versions", async () => {
    const eventId = randomUUID();
    const first = await publishAvailability("8", 2, eventId);
    const duplicate = await publishAvailability("99", 3, eventId);
    const stale = await publishAvailability("7", 1);
    expect(first.statusCode).toBe(200);
    expect(first.json().projectionResult).toBe("CREATED");
    expect(duplicate.json()).toMatchObject({ duplicate: true, projectionResult: "DUPLICATE" });
    expect(stale.json().projectionResult).toBe("STALE");
    const snapshot = repository.snapshot();
    expect(snapshot.inbox.size).toBe(2);
    expect([...snapshot.inventoryAvailability.values()][0]).toMatchObject({ availableQty: "8", factVersion: 2 });
  });

  it("creates one production demand with audit, source, history and outbox when stock is short", async () => {
    expect((await publishAvailability("8")).statusCode).toBe(200);
    const key = randomUUID();
    const first = await app.inject({
      method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(key), payload: intakePayload(),
    });
    const replay = await app.inject({
      method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(key), payload: intakePayload(),
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().intake).toMatchObject({
      orderedQty: "17", availableQty: "8", shortageQty: "9", decision: "CREATE_PRODUCTION_DEMAND",
    });
    expect(first.json().demand).toMatchObject({ sourceType: "SALES_ORDER_SHORTAGE", qty: "9", productId: "FG001", status: "RECEIVED" });
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.json().demand.id).toBe(first.json().demand.id);

    const snapshot = repository.snapshot();
    expect(snapshot.demands.size).toBe(1);
    expect(snapshot.demandSources.size).toBe(1);
    expect(snapshot.salesOrderIntakes.size).toBe(1);
    expect(snapshot.statusHistory).toHaveLength(2);
    expect(snapshot.outbox.map((event) => event.aggregateType).sort()).toEqual(["Demand", "SalesOrderIntake"]);
    expect(snapshot.audits).toHaveLength(1);
    expect(snapshot.idempotency.size).toBe(1);
  });

  it("records a stock fulfillment decision without creating a production demand when stock is enough", async () => {
    await publishAvailability("20");
    const response = await app.inject({
      method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(), payload: intakePayload(),
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().intake).toMatchObject({ shortageQty: "0", decision: "FULFILL_FROM_STOCK" });
    expect(response.json().demand).toBeUndefined();
    const snapshot = repository.snapshot();
    expect(snapshot.demands.size).toBe(0);
    expect(snapshot.outbox).toHaveLength(1);
    expect(snapshot.outbox[0].aggregateType).toBe("SalesOrderIntake");
  });

  it("serializes concurrent intake attempts for the same sales order line", async () => {
    await publishAvailability("8");
    const [first, second] = await Promise.all([
      app.inject({ method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(), payload: intakePayload() }),
      app.inject({ method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(), payload: intakePayload() }),
    ]);
    expect([first.statusCode, second.statusCode].sort()).toEqual([200, 201]);
    expect(first.json().intake.id).toBe(second.json().intake.id);
    expect(repository.snapshot().demands.size).toBe(1);
  });
});
