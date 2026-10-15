import {
  approveFulfillmentOrder,
  confirmFulfillmentOrder,
  createFulfillmentShipmentRequest,
  getFulfillmentOrder,
  type ApiContext,
  type FulfillmentOrder,
} from '../../../api/fulfillment';
import { compareQuantity } from '../../../shared/decimal';

export const requestSalesShipment = async (context: ApiContext, orderId: string): Promise<FulfillmentOrder> => {
  const order = await getFulfillmentOrder(context, orderId);
  if (!['APPROVED', 'NOT_REQUIRED'].includes(order.reviewStatus)) throw new Error('订单尚未完成复核或审批');
  if (!['CONFIRMED', 'PARTIALLY_SHIPPED'].includes(order.overallStatus)) throw new Error('订单当前不能发起发货');
  const canRequest = order.lines.some(line => line.lineStatus !== 'CANCELED'
    && compareQuantity(line.remainingQty, line.activeRequestedQty) > 0);
  if (!canRequest) {
    if (order.lines.some(line => compareQuantity(line.activeRequestedQty, '0') > 0)) return order;
    throw new Error('订单没有剩余可申请的发货数量');
  }
  await createFulfillmentShipmentRequest(context, order);
  return getFulfillmentOrder(context, orderId);
};

export const confirmSalesOrderContents = async (
  context: ApiContext,
  orderId: string,
  deliveryDate: string,
  approvePending = false,
  onUpdated?: (order: FulfillmentOrder) => void,
): Promise<FulfillmentOrder> => {
  let order = await getFulfillmentOrder(context, orderId);
  onUpdated?.(order);
  if (order.overallStatus === 'CONFIRMED') return order;
  if (approvePending && order.reviewStatus === 'PENDING') {
    order = await approveFulfillmentOrder(context, order);
    onUpdated?.(order);
  }
  if (!['APPROVED', 'NOT_REQUIRED'].includes(order.reviewStatus)) {
    throw new Error('订单尚未完成复核或审批');
  }
  order = await confirmFulfillmentOrder(context, order, deliveryDate);
  onUpdated?.(order);
  return order;
};

type SalesOrderIdentity = {
  id: string;
  aggregateId?: string;
  localOrderId?: string;
};

export const upsertSalesOrder = <T extends SalesOrderIdentity>(orders: T[], updated: T, sourceId = updated.id): T[] => [
  updated,
  ...orders.filter((order) => order.id !== sourceId
    && order.id !== updated.id
    && order.id !== updated.localOrderId
    && (!updated.aggregateId || order.aggregateId !== updated.aggregateId)),
];

export const mergeFormalSalesOrders = <T extends SalesOrderIdentity>(orders: T[], formal: T[]): T[] => {
  const refreshed = formal.map((order) => {
    const previous = orders.find((item) => item.aggregateId === order.aggregateId);
    return previous ? { ...previous, ...order } : order;
  });
  return [
    ...refreshed,
    ...orders.filter((order) => !order.aggregateId
      && !refreshed.some((item) => item.id === order.id || item.localOrderId === order.id)),
  ];
};

export const mergePersistedSalesOrders = <T extends SalesOrderIdentity>(current: T[], persisted: T[]): T[] => {
  const formal = current.filter((order) => order.aggregateId);
  const local = persisted.filter((order) => !formal.some((item) =>
    item.id === order.id || item.localOrderId === order.id || (order.aggregateId && item.aggregateId === order.aggregateId)));
  return [
    ...current.filter((order) => !local.some((item) => item.id === order.id)),
    ...local,
  ];
};
