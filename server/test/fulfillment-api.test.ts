import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildProductionApp } from "../src/app.js";
import { InMemoryFulfillmentStore } from "../src/modules/fulfillment/memory-store.js";
import { InMemoryProductionRepository } from "../src/memory-store.js";

describe("Sales inventory production shipment baseline", () => {
  let app: ReturnType<typeof buildProductionApp>;
  let fulfillment: InMemoryFulfillmentStore;
  let production: InMemoryProductionRepository;

  beforeEach(() => {
    fulfillment = new InMemoryFulfillmentStore();
    production = new InMemoryProductionRepository();
    app = buildProductionApp(production, { allowInsecureHeaders: true, fulfillmentStore: fulfillment });
  });
  afterEach(async () => { await app.close(); });

  const headers = (actor: string, key = randomUUID(), version?: number, tenantId = "TENANT-SHWS") => ({
    "x-tenant-id": tenantId, "x-actor-id": actor, "x-permissions": "*", "x-permission-version": "pv-fulfillment-1",
    "x-idempotency-key": key, "x-trace-id": randomUUID(), ...(version ? { "if-match": `"${version}"` } : {}),
  });
  const availability = (qualified: string, allocated: string, fulfillable: string, factVersion: number) => {
    const eventId = randomUUID(); const occurredAt = new Date().toISOString();
    return {
      eventId, eventType: "inventory.availability.changed.v1", eventVersion: 1, tenantId: "TENANT-SHWS",
      aggregateType: "InventoryAvailability", aggregateId: "availability:WH-FG-01:FG001", aggregateVersion: factVersion,
      correlationId: randomUUID(), traceId: randomUUID(), sourceSystem: "REFERENCE_WMS", occurredAt,
      payload: { warehouseId: "WH-FG-01", productId: "FG001", qualifiedOnHandQty: qualified,
        allocatedReservedQty: allocated, frozenQty: "0", safetyStockQty: "0", inTransitQty: "0", fulfillableQty: fulfillable,
        uom: "PCS", formulaVersion: "FULFILLABLE-V1", factVersion, sourceSystem: "REFERENCE_WMS", sourceEventId: eventId, asOf: occurredAt },
    };
  };
  const orderPayload = {
    customerId: "CUS-001", customerName: "试点客户", ownerEmployeeId: "sales-a",
    fulfillmentWarehouseId: "WH-FG-01", factoryResourceId: "FAC-SH-01", requestedDeliveryDate: "2026-08-10",
    allowPartialShipment: true, currency: "CNY",
    recipient: { name: "收货人", phone: "13800138000", country: "中国", province: "上海", city: "上海", address: "测试路 1 号" },
    lines: [{ lineNo: 1, productId: "FG001", orderedQty: "10", uom: "PCS", unitPrice: "100", taxRate: "0.13", promisedDate: "2026-08-10", allowPartialShipment: true }],
  };

  async function createApprovedOrder() {
    const created = await app.inject({ method: "POST", url: "/api/v1/sales/sales-orders", headers: headers("sales-a"), payload: orderPayload });
    expect(created.statusCode).toBe(201);
    const order = created.json();
    expect(order.recipient).toMatchObject({ phoneMasked: "138****8000" });
    expect(JSON.stringify([...fulfillment.snapshot().outbox.values()])).not.toContain("13800138000");
    expect(JSON.stringify(fulfillment.snapshot().audits)).not.toContain("13800138000");
    expect(fulfillment.snapshot().audits).toHaveLength(1);
    const approved = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${order.id}/review-decisions`, headers: headers("reviewer-b", randomUUID(), order.version), payload: { decision: "APPROVE" } });
    expect(approved.statusCode).toBe(200);
    return approved.json();
  }

  async function createConfirmedOrder() {
    const approved = await createApprovedOrder();
    const prematureShipment = await app.inject({
      method: "POST",
      url: `/api/v1/sales/sales-orders/${approved.id}/shipment-requests`,
      headers: headers("sales-a", randomUUID(), approved.version),
      payload: { warehouseId: "WH-FG-01", lines: [{ orderLineId: approved.lines[0].id, sourceLineRevision: approved.lines[0].version, requestedQty: "10", uom: "PCS" }] },
    });
    expect(prematureShipment.statusCode).toBe(409);
    expect(prematureShipment.json().error.message).toBe("销售发货内容尚未确认");
    const confirmed = await app.inject({
      method: "POST",
      url: `/api/v1/sales/sales-orders/${approved.id}/confirm`,
      headers: headers("sales-a", randomUUID(), approved.version),
      payload: { requestedDeliveryDate: "2026-08-10" },
    });
    expect(confirmed.statusCode, confirmed.body).toBe(200);
    expect(confirmed.json()).toMatchObject({ overallStatus: "CONFIRMED", shipmentStatus: "NOT_REQUESTED", requestedDeliveryDate: "2026-08-10" });
    return confirmed.json();
  }

  it("enforces tenant scope, approval separation, idempotency and optimistic locking", async () => {
    const key = randomUUID();
    const first = await app.inject({ method: "POST", url: "/api/v1/sales/sales-orders", headers: headers("sales-a", key), payload: orderPayload });
    const replay = await app.inject({ method: "POST", url: "/api/v1/sales/sales-orders", headers: headers("sales-a", key), payload: orderPayload });
    expect(replay.headers["x-idempotent-replay"]).toBe("true");
    expect(replay.json().id).toBe(first.json().id);
    const selfApprove = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${first.json().id}/review-decisions`, headers: headers("sales-a", randomUUID(), 1), payload: { decision: "APPROVE" } });
    expect(selfApprove.statusCode).toBe(403);
    const stale = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${first.json().id}/review-decisions`, headers: headers("reviewer-b", randomUUID(), 9), payload: { decision: "APPROVE" } });
    expect(stale.statusCode).toBe(409);
    const otherTenant = await app.inject({ method: "GET", url: `/api/v1/sales/sales-orders/${first.json().id}`, headers: headers("viewer", randomUUID(), undefined, "TENANT-HDJG") });
    expect(otherTenant.statusCode).toBe(404);

    const approved = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${first.json().id}/review-decisions`, headers: headers("reviewer-b", randomUUID(), first.json().version), payload: { decision: "APPROVE" } });
    expect(approved.json().reviewStatus).toBe("APPROVED");
    const edited = await app.inject({ method: "PATCH", url: `/api/v1/sales/sales-orders/${first.json().id}`, headers: headers("sales-a", randomUUID(), approved.json().version), payload: { requestedDeliveryDate: "2026-08-11" } });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json()).toMatchObject({ overallStatus: "PENDING_CONFIRMATION", reviewStatus: "PENDING", shipmentStatus: "NOT_REQUESTED" });
    const bypass = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${first.json().id}/shipment-requests`, headers: headers("sales-a", randomUUID(), edited.json().version), payload: { warehouseId: "WH-FG-01", lines: [{ orderLineId: edited.json().lines[0].id, sourceLineRevision: edited.json().lines[0].version, requestedQty: "1", uom: "PCS" }] } });
    expect(bypass.statusCode).toBe(409);
  });

  it("closes shortage through production, authoritative recheck and full outbound posting", async () => {
    expect((await app.inject({ method: "POST", url: "/api/v1/inventory/internal/availability-events", headers: headers("inventory-service"), payload: availability("8", "0", "8", 1) })).statusCode).toBe(200);
    const order = await createConfirmedOrder();
    const shipment = await app.inject({ method: "POST", url: `/api/v1/sales/sales-orders/${order.id}/shipment-requests`, headers: headers("sales-a", randomUUID(), order.version), payload: { warehouseId: "WH-FG-01", lines: [{ orderLineId: order.lines[0].id, sourceLineRevision: order.lines[0].version, requestedQty: "10", uom: "PCS" }] } });
    expect(shipment.statusCode).toBe(202);
    const tasks = await app.inject({ method: "GET", url: `/api/v1/inventory/shipment-tasks?salesOrderId=${order.id}`, headers: headers("warehouse-a") });
    expect(tasks.json().total).toBe(1);
    let task = tasks.json().items[0];
    const reserved = await app.inject({ method: "POST", url: `/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`, headers: headers("warehouse-a", randomUUID(), task.version), payload: { shipmentRequestId: task.shipmentRequestId, orderRevision: task.orderRevision } });
    expect(reserved.statusCode).toBe(200);
    expect(reserved.json()).toMatchObject({ outcome: "PARTIALLY_SUCCEEDED", adapterKind: "REFERENCE", task: { availabilityStatus: "PARTIALLY_RESERVED", replenishmentStatus: "REQUIRED" }, reservation: { reservedQty: "8" } });
    task = reserved.json().task;
    const productionRequest = await app.inject({ method: "POST", url: `/api/v1/inventory/shipment-tasks/${task.id}/production-requests`, headers: headers("warehouse-a", randomUUID(), task.version), payload: { lines: task.lines.filter((line: { shortageQty: string }) => Number(line.shortageQty) > 0).map((line: { id: string; orderLineId: string }) => ({ shipmentRequestLineId: line.id, orderLineId: line.orderLineId, sourceRevision: 1, factoryResourceId: "FAC-SH-01", dueDate: "2026-08-10" })) } });
    expect(productionRequest.statusCode).toBe(201);
    expect(productionRequest.json().demands).toHaveLength(1);
    expect(production.snapshot().demands.size).toBe(1);
    task = productionRequest.json().task;

    const demandId = productionRequest.json().demands[0].id;
    const demandList = await app.inject({ method: "GET", url: "/api/v1/production/demands", headers: headers("planner-a") });
    expect(demandList.statusCode).toBe(200);
    expect(demandList.json().items.find((item: { id: string }) => item.id === demandId)).toMatchObject({
      correlationId: order.correlationId,
      source: {
        sourceSystem: "INVENTORY_FULFILLMENT",
        sourceType: "SALES_ORDER_SHORTAGE",
        salesOrderId: order.id,
        salesOrderLineId: order.lines[0].id,
        shipmentRequestId: task.shipmentRequestId,
        shipmentRequestLineId: task.lines[0].shipmentRequestLineId,
        inventoryWarehouseId: "WH-FG-01",
        inventoryFactVersion: 2,
        correlationId: order.correlationId,
        traceId: expect.any(String),
      },
    });
    const validated = await app.inject({ method: "POST", url: `/api/v1/production/demands/${demandId}/validate`, headers: headers("planner-a", randomUUID(), 1), payload: {} });
    expect(validated.statusCode).toBe(200);
    const approvedDemand = await app.inject({ method: "POST", url: `/api/v1/production/demands/${demandId}/approve`, headers: headers("planner-b", randomUUID(), validated.json().version), payload: {} });
    expect(approvedDemand.statusCode).toBe(200);
    const mrp = await app.inject({ method: "POST", url: "/api/v1/production/mrp-runs", headers: headers("planner-a"), payload: { demandIds: [demandId] } });
    expect(mrp.statusCode).toBe(202);
    expect(mrp.json()).toMatchObject({ status: "SUCCEEDED", progress: 100, result: { solver: "REFERENCE_MPS_MRP_V2", mpsLines: [{ demandId, plannedQty: "2" }], materialShortages: [{ demandId, materialId: "RM201", grossRequiredQty: "4", shortageQty: "4", warehouseId: "WH-RM-01" }], canProceedToAps: false } });
    const blockedAps = await app.inject({ method: "POST", url: "/api/v1/production/schedule-runs", headers: headers("planner-a"), payload: { demandIds: [demandId] } });
    expect(blockedAps.statusCode).toBe(422);
    const purchaseRequest = await app.inject({ method: "POST", url: "/api/v1/procurement/purchase-requests", headers: headers("buyer-a"), payload: { mrpTaskId: mrp.json().taskId, demandId, materialId: "RM201" } });
    expect(purchaseRequest.statusCode, purchaseRequest.body).toBe(201);
    expect(purchaseRequest.json()).toMatchObject({ demandId, materialId: "RM201", requiredQty: "4", status: "PENDING_APPROVAL" });
    const approvedPurchase = await app.inject({ method: "POST", url: `/api/v1/procurement/purchase-requests/${purchaseRequest.json().id}/approve`, headers: headers("buyer-b", randomUUID(), purchaseRequest.json().version), payload: { supplierId: "SUP-001", supplierName: "深圳华芯科技", promisedDate: "2026-08-01" } });
    expect(approvedPurchase.statusCode, approvedPurchase.body).toBe(201);
    const purchaseOrder = approvedPurchase.json().order;
    const purchaseReceipt = await app.inject({ method: "POST", url: `/api/v1/procurement/purchase-orders/${purchaseOrder.id}/receipts`, headers: headers("warehouse-a", randomUUID(), purchaseOrder.version), payload: { externalTransactionId: "PURCHASE-INBOUND-001", receivedAt: new Date().toISOString() } });
    expect(purchaseReceipt.statusCode, purchaseReceipt.body).toBe(201);
    expect(purchaseReceipt.json()).toMatchObject({ order: { status: "RECEIVED", receivedQty: "4" }, receipt: { status: "POSTED", demandId, materialId: "RM201", inventoryFactVersion: 1 }, availability: { warehouseId: "WH-RM-01", productId: "RM201", fulfillableQty: "4" }, transaction: { type: "PURCHASE_RECEIPT_INBOUND" } });
    expect(await production.getInventoryAvailability("TENANT-SHWS", "RM201", "WH-RM-01")).toMatchObject({ availableQty: "4", factVersion: 1 });
    const aps = await app.inject({ method: "POST", url: "/api/v1/production/schedule-runs", headers: headers("planner-a"), payload: { demandIds: [demandId] } });
    expect(aps.statusCode).toBe(202);
    expect(aps.json()).toMatchObject({ status: "SUCCEEDED", progress: 100, result: { solver: "REFERENCE_APS_V1", scheduleCandidates: [{ demandIds: [demandId], published: true }] } });
    const scheduleCandidateId = aps.json().result.scheduleCandidates[0].id;
    const workOrder = await app.inject({ method: "POST", url: "/api/v1/production/work-orders", headers: headers("planner-a"), payload: {
      productId: "FG001", factoryResourceId: "FAC-SH-01", workCenterResourceId: "WC-01", plannedQty: "2", inputQty: "2", uom: "PCS",
      dueDate: "2026-08-10", bomSnapshotId: randomUUID(), routingSnapshotId: randomUUID(), scheduleCandidateId,
      kittingStatus: "SHORTAGE", correlationId: order.correlationId,
      demandLinks: [{ demandId, allocatedQty: "2", customerLocked: true, promisedDate: "2026-08-10" }],
    } });
    expect(workOrder.statusCode).toBe(201);
    expect(workOrder.json().kittingStatus).toBe("READY");
    expect(workOrder.json().parameterSnapshot).toMatchObject({ inventoryWarehouseId: "WH-FG-01", demandIds: [demandId] });
    const released = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/release`, headers: headers("supervisor-a", randomUUID(), workOrder.json().version), payload: {} });
    expect(released.statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/start`, headers: headers("operator-a"), payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/reports`, headers: headers("operator-a"), payload: { goodQty: "2", defectQty: "0", scrapQty: "0", inputQty: "2", uom: "PCS" } })).statusCode).toBe(201);
    const inspection = await app.inject({ method: "POST", url: "/api/v1/production/inspections", headers: headers("inspector-a"), payload: { workOrderId: workOrder.json().id, sampleQty: "2" } });
    expect(inspection.statusCode).toBe(201);
    expect((await app.inject({ method: "POST", url: `/api/v1/production/inspections/${inspection.json().id}/result`, headers: headers("inspector-a"), payload: { passedQty: "2", failedQty: "0" } })).statusCode).toBe(200);
    const completion = await app.inject({ method: "POST", url: `/api/v1/production/work-orders/${workOrder.json().id}/completions`, headers: headers("supervisor-a"), payload: {
      inspectionId: inspection.json().id, qty: "2", uom: "PCS", warehouseResourceId: "PLATFORM-WH-01", inventoryWarehouseId: "WH-FG-01",
      binId: "A-01", traceMode: "NONE", productionDate: "2026-07-26", allocationRevision: 1,
    } });
    expect(completion.statusCode).toBe(202);
    const postedCompletion = await app.inject({ method: "POST", url: `/api/v1/production/internal/completions/${completion.json().completionId}/inventory-result`, headers: headers("inventory-service"), payload: { result: "POSTED", externalTransactionId: "REF-INBOUND-001" } });
    expect(postedCompletion.statusCode).toBe(200);
    expect([...fulfillment.snapshot().transactions.values()].some((transaction) => transaction.externalTransactionId === "REF-INBOUND-001")).toBe(true);
    expect(production.snapshot().outbox.some((event) => event.eventType === "production.completion.posted.v1" && event.status === "PUBLISHED")).toBe(true);
    expect([...fulfillment.snapshot().availability.values()]).toEqual(expect.arrayContaining([expect.objectContaining({
      warehouseId: "WH-FG-01", productId: "FG001", qualifiedOnHandQty: "10",
      allocatedReservedQty: "8", fulfillableQty: "2", factVersion: 3, sourceSystem: "REFERENCE_WMS",
    })]));
    task = (await app.inject({ method: "GET", url: `/api/v1/inventory/shipment-tasks/${task.id}`, headers: headers("warehouse-a") })).json();
    expect(task).toMatchObject({ availabilityStatus: "RECHECKING", replenishmentStatus: "AVAILABLE", inventoryFactVersion: 3 });
    const rechecked = await app.inject({ method: "POST", url: `/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`, headers: headers("warehouse-a", randomUUID(), task.version), payload: { shipmentRequestId: task.shipmentRequestId, orderRevision: task.orderRevision } });
    expect(rechecked.json()).toMatchObject({ outcome: "SUCCEEDED", task: { availabilityStatus: "RESERVED" } });
    const outbound = rechecked.json().outbound;
    const posted = await app.inject({ method: "POST", url: `/api/v1/inventory/outbounds/${outbound.id}/post`, headers: headers("warehouse-a", randomUUID(), outbound.version), payload: { shippedAt: new Date().toISOString(), lines: [{ outboundLineId: outbound.lines[0].id, qty: "10", uom: "PCS" }] } });
    expect(posted.statusCode).toBe(200);
    expect(posted.json()).toMatchObject({ outcome: "SUCCEEDED", result: "POSTED", adapterKind: "REFERENCE", outbound: { status: "POSTED" }, traceId: expect.any(String) });
    expect(posted.json().transactions).toEqual([expect.objectContaining({ transactionNo: expect.stringMatching(/^ITX-/), type: "SALES_OUTBOUND", qty: "10" })]);
    const finalOrder = await app.inject({ method: "GET", url: `/api/v1/sales/sales-orders/${order.id}`, headers: headers("sales-a") });
    expect(finalOrder.json()).toMatchObject({ overallStatus: "SHIPPED", shipmentStatus: "SHIPPED", lines: [{ shippedQty: "10", remainingQty: "0", lineStatus: "SHIPPED" }] });
    const trace = await app.inject({ method: "GET", url: `/api/v1/sales/sales-orders/${order.id}/fulfillment-trace`, headers: headers("sales-a") });
    expect(trace.json().events.map((event: { eventType: string }) => event.eventType)).toEqual(expect.arrayContaining(["sales.shipment-request.requested.v1", "inventory.shortage.detected.v1", "production.demand.created.v1", "inventory.sales-outbound.posted.v1"]));
  });

  it("ships an order in two requests without losing or duplicating the remaining quantity", async () => {
    expect((await app.inject({ method: "POST", url: "/api/v1/inventory/internal/availability-events", headers: headers("inventory-service"), payload: availability("10", "0", "10", 1) })).statusCode).toBe(200);
    let order = await createConfirmedOrder();

    const ship = async (requestedQty: string) => {
      const request = await app.inject({
        method: "POST",
        url: `/api/v1/sales/sales-orders/${order.id}/shipment-requests`,
        headers: headers("sales-a", randomUUID(), order.version),
        payload: {
          warehouseId: "WH-FG-01",
          lines: [{
            orderLineId: order.lines[0].id,
            sourceLineRevision: order.lines[0].version,
            requestedQty,
            uom: "PCS",
          }],
        },
      });
      expect(request.statusCode).toBe(202);

      const task = (await app.inject({
        method: "GET",
        url: `/api/v1/inventory/shipment-tasks?salesOrderId=${order.id}`,
        headers: headers("warehouse-a"),
      })).json().items.find((item: { shipmentRequestId: string }) => item.shipmentRequestId === request.json().id);
      expect(task).toBeDefined();

      const reserved = await app.inject({
        method: "POST",
        url: `/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`,
        headers: headers("warehouse-a", randomUUID(), task.version),
        payload: { shipmentRequestId: task.shipmentRequestId, orderRevision: task.orderRevision },
      });
      expect(reserved.statusCode).toBe(200);
      expect(reserved.json()).toMatchObject({ outcome: "SUCCEEDED", task: { availabilityStatus: "RESERVED" } });

      const outbound = reserved.json().outbound;
      const posted = await app.inject({
        method: "POST",
        url: `/api/v1/inventory/outbounds/${outbound.id}/post`,
        headers: headers("warehouse-a", randomUUID(), outbound.version),
        payload: {
          shippedAt: new Date().toISOString(),
          lines: [{ outboundLineId: outbound.lines[0].id, qty: requestedQty, uom: "PCS" }],
        },
      });
      expect(posted.statusCode).toBe(200);
      expect(posted.json()).toMatchObject({ result: "POSTED", outbound: { status: "POSTED" } });
      order = (await app.inject({ method: "GET", url: `/api/v1/sales/sales-orders/${order.id}`, headers: headers("sales-a") })).json();
    };

    await ship("4");
    expect(order).toMatchObject({
      overallStatus: "PARTIALLY_SHIPPED",
      shipmentStatus: "PARTIALLY_SHIPPED",
      lines: [{ shippedQty: "4", activeRequestedQty: "0", reservedQty: "0", remainingQty: "6", lineStatus: "PARTIALLY_SHIPPED" }],
    });

    const overRequest = await app.inject({
      method: "POST",
      url: `/api/v1/sales/sales-orders/${order.id}/shipment-requests`,
      headers: headers("sales-a", randomUUID(), order.version),
      payload: { warehouseId: "WH-FG-01", lines: [{ orderLineId: order.lines[0].id, sourceLineRevision: order.lines[0].version, requestedQty: "7", uom: "PCS" }] },
    });
    expect(overRequest.statusCode).toBe(422);

    await ship("6");
    expect(order).toMatchObject({
      overallStatus: "SHIPPED",
      shipmentStatus: "SHIPPED",
      lines: [{ shippedQty: "10", activeRequestedQty: "0", reservedQty: "0", remainingQty: "0", lineStatus: "SHIPPED" }],
    });
    expect(fulfillment.snapshot().transactions.size).toBe(2);
  });
});
