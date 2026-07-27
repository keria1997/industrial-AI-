import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { FulfillmentError } from "../../shared/fulfillment-errors.js";
import type { RequestContext } from "../../types.js";
import type { FulfillmentService } from "./service.js";

const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/);
const positiveDecimal = decimal.refine((value) => !/^0(?:\.0*)?$/.test(value), "必须大于 0");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const dateTime = z.string().datetime({ offset: true });
const id = z.string().uuid();
const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(200).default(20);
const eventEnvelope = z.object({
  eventId: id, eventType: z.string(), eventVersion: z.literal(1), tenantId: z.string().min(1),
  aggregateType: z.string().min(1), aggregateId: z.string().min(1), aggregateVersion: z.number().int().min(1),
  correlationId: id, causationId: id.optional(), traceId: z.string().min(1), sourceSystem: z.string().min(1),
  occurredAt: dateTime,
});

const recipient = z.object({
  name: z.string().min(1).max(100), phone: z.string().min(5).max(40), country: z.string().min(1).max(80),
  province: z.string().min(1).max(80), city: z.string().min(1).max(80), district: z.string().max(80).optional(),
  address: z.string().min(1).max(500), postalCode: z.string().max(20).optional(),
});
const orderLine = z.object({
  lineNo: z.number().int().min(1), productId: z.string().min(1).max(100), orderedQty: positiveDecimal,
  uom: z.string().min(1).max(20), unitPrice: positiveDecimal, taxRate: decimal, promisedDate: date,
  allowPartialShipment: z.boolean(),
});
const createOrderBase = z.object({
  customerId: z.string().min(1).max(100), customerName: z.string().max(200).optional(),
  ownerEmployeeId: z.string().min(1).max(100), fulfillmentWarehouseId: z.string().min(1).max(100),
  factoryResourceId: z.string().min(1).max(100), requestedDeliveryDate: date, allowPartialShipment: z.boolean(),
  currency: z.string().regex(/^[A-Z]{3}$/), recipient, sourceQuoteId: id.optional(), sourceQuoteRevision: z.number().int().min(1).optional(),
  lines: z.array(orderLine).min(1).max(200),
});
const createOrder = createOrderBase
  .refine((value) => Boolean(value.sourceQuoteId) === Boolean(value.sourceQuoteRevision), { message: "sourceQuoteId 与 sourceQuoteRevision 必须同时提供", path: ["sourceQuoteId"] })
  .refine((value) => {
    const today = new Date().toISOString().slice(0, 10);
    if (value.requestedDeliveryDate < today) return false;
    return value.lines.every((line) => line.promisedDate >= value.requestedDeliveryDate);
  }, { message: "承诺交期不能早于订单日期", path: ["requestedDeliveryDate"] });

export function registerFulfillmentRoutes(
  app: FastifyInstance,
  contextFor: (request: FastifyRequest) => RequestContext,
  service: FulfillmentService,
) {
  const command = async <T>(request: FastifyRequest, reply: FastifyReply, action: (context: RequestContext) => Promise<{ statusCode: number; body: T; replayed?: boolean }>) => {
    const context = contextFor(request); reply.header("X-Trace-Id", context.traceId); const result = await action(context);
    if (result.replayed) reply.header("X-Idempotent-Replay", "true");
    const body = result.body as Record<string, unknown>; const version = body?.version ?? (body?.task as Record<string, unknown> | undefined)?.version ?? (body?.outbound as Record<string, unknown> | undefined)?.version;
    if (version) reply.header("ETag", `"${version}"`); return reply.status(result.statusCode).send(result.body);
  };

  app.post("/api/v1/sales/sales-orders", async (request, reply) => command(request, reply, (context) => service.createOrder(context, createOrder.parse(request.body))));
  app.get("/api/v1/sales/sales-orders", async (request) => {
    const context = contextFor(request); const query = z.object({ overallStatus: z.string().optional(), reviewStatus: z.string().optional(), shipmentStatus: z.string().optional(), search: z.string().max(100).optional(), page, pageSize }).parse(request.query);
    return service.listOrders(context, query);
  });
  app.get("/api/v1/sales/sales-orders/:id", async (request, reply) => {
    const context = contextFor(request); const value = await service.getOrder(context, z.object({ id }).parse(request.params).id); reply.header("ETag", `"${value.version}"`); return value;
  });
  app.patch("/api/v1/sales/sales-orders/:id", async (request, reply) => {
    const params = z.object({ id }).parse(request.params);
    const input = createOrderBase.partial().omit({ customerId: true, currency: true, sourceQuoteId: true, sourceQuoteRevision: true }).refine((value) => Object.keys(value).length > 0).parse(request.body);
    return command(request, reply, (context) => service.updateOrder(context, params.id, input));
  });
  app.post("/api/v1/sales/sales-orders/:id/review-submit", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ comment: z.string().max(500).optional() }).parse(request.body ?? {});
    return command(request, reply, (context) => service.resubmitReview(context, params.id, body));
  });
  app.post("/api/v1/sales/sales-orders/:id/review-decisions", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ decision: z.enum(["APPROVE", "RETURN", "REJECT"]), comment: z.string().max(500).optional() }).parse(request.body);
    return command(request, reply, (context) => service.decideReview(context, params.id, body));
  });
  app.post("/api/v1/sales/sales-orders/:id/confirm", async (request, reply) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ requestedDeliveryDate: date }).refine((value) => value.requestedDeliveryDate >= new Date().toISOString().slice(0, 10), { message: "交期不能早于今天", path: ["requestedDeliveryDate"] }).parse(request.body);
    return command(request, reply, (context) => service.confirmOrder(context, params.id, body));
  });
  app.post("/api/v1/sales/sales-orders/:id/shipment-requests", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ warehouseId: z.string().min(1).max(100), lines: z.array(z.object({ orderLineId: id, sourceLineRevision: z.number().int().min(1), requestedQty: positiveDecimal, uom: z.string().min(1).max(20) })).min(1).max(200) }).parse(request.body);
    return command(request, reply, (context) => service.createShipmentRequest(context, params.id, body));
  });
  app.get("/api/v1/sales/sales-orders/:id/fulfillment-trace", async (request) => service.fulfillmentTrace(contextFor(request), z.object({ id }).parse(request.params).id));
  app.post("/api/v1/sales/sales-orders/:id/cancel", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ reason: z.string().min(1).max(500) }).parse(request.body);
    return command(request, reply, (context) => service.cancelOrder(context, params.id, body));
  });

  app.get("/api/v1/inventory/availability", async (request) => {
    const query = z.object({ warehouseId: z.string().min(1).max(100), productIds: z.union([z.string(), z.array(z.string())]) }).parse(request.query);
    const productIds = Array.isArray(query.productIds) ? query.productIds : query.productIds.split(",").filter(Boolean);
    return service.getAvailability(contextFor(request), query.warehouseId, productIds);
  });
  app.post("/api/v1/inventory/internal/availability-events", async (request) => {
    const body = eventEnvelope.extend({
      eventType: z.literal("inventory.availability.changed.v1"), aggregateType: z.literal("InventoryAvailability"),
      payload: z.object({ warehouseId: z.string().min(1).max(100), productId: z.string().min(1).max(100), qualifiedOnHandQty: decimal, allocatedReservedQty: decimal, frozenQty: decimal, safetyStockQty: decimal, inTransitQty: decimal, fulfillableQty: decimal, uom: z.string().min(1).max(20), formulaVersion: z.string().min(1).max(50), factVersion: z.number().int().min(1), sourceSystem: z.string().min(1).max(50), sourceEventId: z.string().min(1), asOf: dateTime }),
    }).parse(request.body);
    const context = contextFor(request);
    if (body.tenantId !== context.tenantId) throw new FulfillmentError("FULFILLMENT_403_PERMISSION_DENIED", "事件租户与访问租户不一致", "使用事件所属租户的服务身份重试");
    if (body.aggregateVersion !== body.payload.factVersion || body.payload.sourceEventId !== body.eventId) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "库存事实版本或来源事件与信封不一致", "保持 aggregateVersion=factVersion 且 sourceEventId=eventId");
    return service.receiveAvailability(context, { eventId: body.eventId, ...body.payload });
  });
  app.get("/api/v1/inventory/shipment-tasks", async (request) => {
    const query = z.object({ warehouseId: z.string().optional(), workflowStatus: z.string().optional(), salesOrderId: id.optional(), page, pageSize }).parse(request.query);
    return service.listTasks(contextFor(request), query);
  });
  app.get("/api/v1/inventory/shipment-tasks/:id", async (request, reply) => { const value = await service.getTask(contextFor(request), z.object({ id }).parse(request.params).id); reply.header("ETag", `"${value.version}"`); return value; });
  app.post("/api/v1/inventory/shipment-tasks/:id/check-and-reserve", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ shipmentRequestId: id, orderRevision: z.number().int().min(1), expectedFactVersions: z.array(z.object({ productId: z.string().min(1).max(100), factVersion: z.number().int().min(1) })).max(200).optional() }).parse(request.body);
    return command(request, reply, (context) => service.checkAndReserve(context, params.id, body));
  });
  app.post("/api/v1/inventory/shipment-tasks/:id/production-requests", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ lines: z.array(z.object({ shipmentRequestLineId: id, orderLineId: id, sourceRevision: z.number().int().min(1), factoryResourceId: z.string().min(1).max(100), dueDate: date })).min(1).max(200) }).parse(request.body);
    return command(request, reply, (context) => service.createProductionRequest(context, params.id, body));
  });
  app.get("/api/v1/inventory/reservations/:id", async (request, reply) => { const value = await service.getReservation(contextFor(request), z.object({ id }).parse(request.params).id); reply.header("ETag", `"${value.version}"`); return value; });
  app.post("/api/v1/inventory/reservations/:id/release", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ reason: z.string().min(1).max(500), compensationId: id }).parse(request.body);
    return command(request, reply, (context) => service.releaseReservation(context, params.id, body));
  });
  app.get("/api/v1/inventory/outbounds/:id", async (request, reply) => { const value = await service.getOutbound(contextFor(request), z.object({ id }).parse(request.params).id); reply.header("ETag", `"${value.version}"`); return value; });
  app.post("/api/v1/inventory/outbounds/:id/post", async (request, reply) => {
    const params = z.object({ id }).parse(request.params); const body = z.object({ lines: z.array(z.object({ outboundLineId: id, qty: positiveDecimal, uom: z.string().min(1).max(20) })).min(1).max(200), carrier: z.string().max(100).optional(), trackingNo: z.string().max(100).optional(), shippedAt: dateTime }).parse(request.body);
    return command(request, reply, (context) => service.postOutbound(context, params.id, body));
  });
  app.get("/api/v1/inventory/transactions", async (request) => {
    const query = z.object({ warehouseId: z.string().optional(), productId: z.string().optional(), sourceId: z.string().optional(), type: z.string().optional(), page, pageSize }).parse(request.query);
    return service.listTransactions(contextFor(request), query);
  });
  app.post("/api/v1/procurement/purchase-requests", async (request, reply) => {
    const body = z.object({ mrpTaskId: id, demandId: id, materialId: z.string().min(1).max(100) }).parse(request.body);
    return command(request, reply, (context) => service.createPurchaseRequest(context, body));
  });
  app.get("/api/v1/procurement/purchase-requests", async (request) => service.listPurchaseRequests(contextFor(request)));
  app.post("/api/v1/procurement/purchase-requests/:id/approve", async (request, reply) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ supplierId: z.string().min(1).max(100), supplierName: z.string().min(1).max(200), promisedDate: date }).parse(request.body);
    return command(request, reply, (context) => service.approvePurchaseRequest(context, params.id, body));
  });
  app.get("/api/v1/procurement/purchase-orders", async (request) => service.listPurchaseOrders(contextFor(request)));
  app.post("/api/v1/procurement/purchase-orders/:id/receipts", async (request, reply) => {
    const params = z.object({ id }).parse(request.params);
    const body = z.object({ externalTransactionId: z.string().min(1).max(100), receivedAt: dateTime }).parse(request.body);
    return command(request, reply, (context) => service.receivePurchaseOrder(context, params.id, body));
  });
  app.get("/api/v1/procurement/purchase-receipts", async (request) => service.listPurchaseReceipts(contextFor(request)));
  app.post("/api/v1/inventory/internal/completion-results", async (request) => {
    const body = eventEnvelope.extend({
      eventType: z.literal("production.completion.posted.v1"), aggregateType: z.literal("Completion"),
      payload: z.object({ completionId: id, workOrderId: id, externalTransactionId: z.string().min(1).max(100), warehouseId: z.string().min(1).max(100), productId: z.string().min(1).max(100), qty: positiveDecimal, uom: z.string().min(1).max(20), productionDate: date, inventoryFactVersion: z.number().int().min(1).optional(), allocations: z.array(z.object({ demandId: id, qty: positiveDecimal })).min(1) }),
    }).parse(request.body);
    const context = contextFor(request);
    if (body.tenantId !== context.tenantId) throw new FulfillmentError("FULFILLMENT_403_PERMISSION_DENIED", "事件租户与访问租户不一致", "使用事件所属租户的服务身份重试");
    if (body.aggregateId !== body.payload.completionId) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "完工聚合 ID 与事件载荷不一致", "保持 aggregateId=payload.completionId");
    return service.receiveCompletion(context, { eventId: body.eventId, completionId: body.payload.completionId, externalTransactionId: body.payload.externalTransactionId, warehouseId: body.payload.warehouseId, productId: body.payload.productId, qty: body.payload.qty, uom: body.payload.uom, occurredAt: body.occurredAt, correlationId: body.correlationId, inventoryFactVersion: body.payload.inventoryFactVersion, allocations: body.payload.allocations });
  });
}
