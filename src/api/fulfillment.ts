import { apiRequest, type ApiContext } from './client';

export type FulfillmentOrderLine = {
  id: string; lineNo: number; productId: string; orderedQty: string; shippedQty: string;
  activeRequestedQty: string; reservedQty: string; remainingQty: string; uom: string;
  unitPrice: string; taxRate: string; promisedDate: string; allowPartialShipment: boolean;
  lineStatus: string; version: number;
};

export type FulfillmentOrder = {
  id: string; orderNo: string; customerId: string; customerName: string; ownerEmployeeId: string;
  fulfillmentWarehouseId: string; factoryResourceId: string; requestedDeliveryDate: string;
  allowPartialShipment: boolean; currency: string; totalAmount: string; overallStatus: string;
  reviewStatus: string; shipmentStatus: string; reviewRequired: boolean; recipient: Record<string, string>;
  lines: FulfillmentOrderLine[]; version: number; createdAt: string; updatedAt: string;
};

export type FulfillmentShipmentTask = {
  id: string; shipmentRequestId: string; salesOrderId: string; requestNo: string; warehouseId: string;
  salesOrderNo: string; orderRevision: number; allowPartialShipment: boolean;
  workflowStatus: string; availabilityStatus: string; replenishmentStatus: string; postingStatus: string;
  inventoryFactVersion?: number; outboundId?: string; version: number; updatedAt: string;
  lines: Array<{ id: string; orderLineId: string; productId: string; requestedQty: string; reservedQty: string; postedQty: string; shortageQty: string; uom: string; productionDemandId?: string }>;
};

export type FulfillmentOutbound = {
  id: string;
  version: number;
  lines: Array<{
    id: string;
    orderLineId: string;
    productId?: string;
    reservedQty: string;
    postedQty: string;
    uom: string;
  }>;
};

export const buildOutboundPostLines = (
  outbound: FulfillmentOutbound,
  quantitiesByOrderLineId?: Record<string, string>,
) => outbound.lines.map((line) => {
  const remainingQty = Number(line.reservedQty) - Number(line.postedQty);
  const requestedQty = quantitiesByOrderLineId?.[line.orderLineId];
  const qty = requestedQty === undefined ? remainingQty : Number(requestedQty);
  if (!Number.isFinite(qty) || qty <= 0 || qty > remainingQty) {
    throw new Error(`${line.productId || line.orderLineId} 的本次发货数量必须大于 0 且不超过 ${remainingQty}`);
  }
  return { outboundLineId: line.id, qty: String(qty), uom: line.uom };
});

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const createFulfillmentOrder = (context: ApiContext, input: Record<string, unknown>) =>
  apiRequest<FulfillmentOrder>('/api/v1/sales/sales-orders', context, { method: 'POST', idempotencyKey: key('sales-order'), body: JSON.stringify(input) });

export const listFulfillmentOrders = (context: ApiContext) =>
  apiRequest<{ items: FulfillmentOrder[]; total: number }>('/api/v1/sales/sales-orders?page=1&pageSize=200', context);

export const approveFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/review-decisions`, context, {
    method: 'POST', idempotencyKey: key(`review:${order.id}`), expectedVersion: order.version,
    body: JSON.stringify({ decision: 'APPROVE' }),
  });

export const confirmFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder, requestedDeliveryDate: string) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/confirm`, context, {
    method: 'POST', idempotencyKey: key(`confirm:${order.id}`), expectedVersion: order.version,
    body: JSON.stringify({ requestedDeliveryDate }),
  });

export const cancelFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder, reason: string) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/cancel`, context, {
    method: 'POST', idempotencyKey: key(`cancel:${order.id}`), expectedVersion: order.version,
    body: JSON.stringify({ reason }),
  });

export const createFulfillmentShipmentRequest = (context: ApiContext, order: FulfillmentOrder) =>
  apiRequest<Record<string, unknown>>(`/api/v1/sales/sales-orders/${order.id}/shipment-requests`, context, {
    method: 'POST', idempotencyKey: key(`shipment:${order.id}`), expectedVersion: order.version,
    body: JSON.stringify({
      warehouseId: order.fulfillmentWarehouseId,
      lines: order.lines.filter((line) => Number(line.remainingQty) > Number(line.activeRequestedQty)).map((line) => ({
        orderLineId: line.id, sourceLineRevision: line.version,
        requestedQty: String(Number(line.remainingQty) - Number(line.activeRequestedQty)), uom: line.uom,
      })),
    }),
  });

export const listFulfillmentShipmentTasks = (context: ApiContext, salesOrderId?: string) =>
  apiRequest<{ items: FulfillmentShipmentTask[]; total: number }>(`/api/v1/inventory/shipment-tasks?page=1&pageSize=200${salesOrderId ? `&salesOrderId=${encodeURIComponent(salesOrderId)}` : ''}`, context);

export const checkAndReserveShipmentTask = (context: ApiContext, task: FulfillmentShipmentTask) =>
  apiRequest<{ outcome: string; adapterKind: string; task: FulfillmentShipmentTask; outbound?: { id: string; version: number; lines: Array<{ orderLineId: string; reservedQty: string; postedQty: string; uom: string }> } }>(`/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`, context, {
    method: 'POST', idempotencyKey: key(`reserve:${task.id}`), expectedVersion: task.version,
    body: JSON.stringify({ shipmentRequestId: task.shipmentRequestId, orderRevision: task.orderRevision }),
  });

export const createProductionRequestForTask = (context: ApiContext, task: FulfillmentShipmentTask, factoryResourceId: string) =>
  apiRequest<{ task: FulfillmentShipmentTask; demands: Array<{ id: string; code: string }> }>(`/api/v1/inventory/shipment-tasks/${task.id}/production-requests`, context, {
    method: 'POST', idempotencyKey: key(`production:${task.id}`), expectedVersion: task.version,
    body: JSON.stringify({ lines: task.lines.filter((line) => Number(line.shortageQty) > 0).map((line) => ({ shipmentRequestLineId: line.id, orderLineId: line.orderLineId, sourceRevision: 1, factoryResourceId, dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10) })) }),
  });

export const getFulfillmentOutbound = (context: ApiContext, id: string) =>
  apiRequest<FulfillmentOutbound>(`/api/v1/inventory/outbounds/${id}`, context);

export const postFulfillmentOutbound = (
  context: ApiContext,
  outbound: FulfillmentOutbound,
  quantitiesByOrderLineId?: Record<string, string>,
) =>
  apiRequest<{ outcome: string; adapterKind: string; outbound: { status: string } }>(`/api/v1/inventory/outbounds/${outbound.id}/post`, context, {
    method: 'POST', idempotencyKey: key(`outbound-command:${outbound.id}`), expectedVersion: outbound.version,
    body: JSON.stringify({
      shippedAt: new Date().toISOString(),
      lines: buildOutboundPostLines(outbound, quantitiesByOrderLineId),
    }),
  });
