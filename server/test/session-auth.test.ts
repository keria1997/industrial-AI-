import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProductionApp } from "../src/app.js";
import { InMemoryProductionRepository } from "../src/memory-store.js";

describe("signed session boundary", () => {
  let app: ReturnType<typeof buildProductionApp>;

  beforeEach(() => {
    app = buildProductionApp(new InMemoryProductionRepository(), {
      authSecret: "test-auth-secret",
      allowInsecureHeaders: false,
      demoAuthEnabled: true,
      demoAccount: "admin,reviewer",
      demoPassword: "test-password",
    });
  });

  afterEach(async () => { await app.close(); });

  it("rejects caller-supplied actor and permissions without a signed token", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/v1/production/demands",
      headers: { "x-tenant-id": "TENANT-SHWS", "x-actor-id": "forged", "x-permissions": "*" },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("PRODUCTION_401_UNAUTHENTICATED");
  });

  it("uses signed identity claims and validates tenant selection", async () => {
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/session/login",
      payload: { account: "admin", password: "test-password" },
    });
    expect(login.statusCode).toBe(200);
    const token = login.json().accessToken;
    const me = await app.inject({
      method: "GET",
      url: "/api/v1/session/me",
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "TENANT-HDJG" },
    });
    expect(me.json()).toMatchObject({ account: "admin", tenantId: "TENANT-HDJG", permissions: ["*"] });

    const forbidden = await app.inject({
      method: "GET",
      url: "/api/v1/session/me",
      headers: { authorization: `Bearer ${token}`, "x-tenant-id": "TENANT-NOT-ALLOWED" },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("executes the signed demand-to-inventory vertical flow without caller-supplied identity", async () => {
    const tokenFor = async (account: string) => {
      const response = await app.inject({ method: "POST", url: "/api/v1/session/login", payload: { account, password: "test-password" } });
      return response.json().accessToken as string;
    };
    const adminToken = await tokenFor("admin");
    const reviewerToken = await tokenFor("reviewer");
    const headers = (token: string, key = randomUUID(), version?: number) => ({
      authorization: `Bearer ${token}`,
      "x-tenant-id": "TENANT-SHWS",
      "x-idempotency-key": key,
      ...(version ? { "if-match": `"${version}"` } : {}),
    });

    const availability = await app.inject({ method: "POST", url: "/api/v1/production/internal/inventory-availability-events", headers: headers(adminToken), payload: {
      eventId: randomUUID(), productId: "FG001", inventoryWarehouseId: "WH-FG-01", availableQty: "8", uom: "PCS",
      factVersion: 1, sourceSystem: "TEST_INVENTORY", asOf: new Date().toISOString(),
    } });
    expect(availability.statusCode).toBe(200);
    const materialAvailability = await app.inject({ method: "POST", url: "/api/v1/production/internal/inventory-availability-events", headers: headers(adminToken), payload: {
      eventId: randomUUID(), productId: "RM201", inventoryWarehouseId: "WH-RM-01", availableQty: "4", uom: "PCS",
      factVersion: 1, sourceSystem: "TEST_INVENTORY", asOf: new Date().toISOString(),
    } });
    expect(materialAvailability.statusCode).toBe(200);

    const intake = await app.inject({ method: "POST", url: "/api/v1/production/sales-order-intakes", headers: headers(adminToken), payload: {
      salesOrderId: "SO-SIGNED-001", sourceLineId: "1", sourceRevision: 1, productId: "FG001", productName: "工业控制器",
      orderedQty: "10", uom: "PCS", dueDate: "2026-08-01", factoryResourceId: "FAC-SH-01", inventoryWarehouseId: "WH-FG-01",
    } });
    expect(intake.statusCode).toBe(201);
    const demand = intake.json().demand;

    const validated = await app.inject({ method: "POST", url: `/api/v1/production/demands/${demand.id}/validate`, headers: headers(adminToken, randomUUID(), demand.version), payload: {
      productActive: true, factoryActive: true, bomEffective: true, routingEffective: true,
    } });
    expect(validated.json().status).toBe("PENDING_REVIEW");
    const approved = await app.inject({ method: "POST", url: `/api/v1/production/demands/${demand.id}/approve`, headers: headers(reviewerToken, randomUUID(), validated.json().version), payload: {} });
    expect(approved.json().status).toBe("APPROVED");
    const mrp = await app.inject({ method: "POST", url: "/api/v1/production/mrp-runs", headers: headers(reviewerToken), payload: { demandIds: [demand.id] } });
    expect(mrp.json().status).toBe("SUCCEEDED");
    const aps = await app.inject({ method: "POST", url: "/api/v1/production/schedule-runs", headers: headers(reviewerToken), payload: { demandIds: [demand.id] } });
    const scheduleCandidateId = aps.json().result.scheduleCandidates[0].id;

    const workOrder = await app.inject({ method: "POST", url: "/api/v1/production/work-orders", headers: headers(reviewerToken), payload: {
      productId: "FG001", productName: "工业控制器", factoryResourceId: "FAC-SH-01", workCenterResourceId: "WC-SH-ASSY-01",
      plannedQty: "2", inputQty: "2", uom: "PCS", dueDate: "2026-08-01", bomSnapshotId: randomUUID(), routingSnapshotId: randomUUID(),
      scheduleCandidateId, kittingStatus: "READY", demandLinks: [{ demandId: demand.id, allocatedQty: "2" }],
    } });
    expect(workOrder.statusCode).toBe(201);
    const released = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/release`, headers: headers(reviewerToken, randomUUID(), workOrder.json().version), payload: {} });
    const started = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/start`, headers: headers(adminToken, randomUUID(), released.json().version), payload: {} });
    const reported = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/reports`, headers: headers(adminToken, randomUUID(), started.json().version), payload: { goodQty: "2", inputQty: "0", uom: "PCS" } });
    expect(reported.statusCode).toBe(201);

    const inspection = await app.inject({ method: "POST", url: "/api/v1/production/inspections", headers: headers(reviewerToken), payload: { workOrderId: workOrder.json().id, sampleQty: "2" } });
    const passed = await app.inject({ method: "POST", url: `/api/v1/production/inspections/${inspection.json().id}/result`, headers: headers(reviewerToken, randomUUID(), inspection.json().version), payload: { passedQty: "2", failedQty: "0" } });
    expect(passed.json().status).toBe("PASSED");

    const completion = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/completions`, headers: headers(adminToken), payload: {
      inspectionId: inspection.json().id, qty: "2", uom: "PCS", warehouseResourceId: "RES-WH-FG-SH", inventoryWarehouseId: "WH-FG-01",
      binId: "FG-A-01", traceMode: "NONE", productionDate: "2026-07-26", allocationRevision: 1,
    } });
    expect(completion.json().status).toBe("POSTING");
    const posted = await app.inject({ method: "POST", url: `/api/v1/production/internal/completions/${completion.json().completionId}/inventory-result`, headers: headers(reviewerToken), payload: {
      result: "POSTED", externalTransactionId: "WMS-SIGNED-001",
    } });
    expect(posted.statusCode).toBe(200);
    expect(posted.json().completion.status).toBe("POSTED");
  });
});
