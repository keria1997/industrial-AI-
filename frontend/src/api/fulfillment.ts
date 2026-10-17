import { ApiError, apiRequest } from './client';
import type { ApiContext } from './client';
import { compareQuantity, subtractQuantity } from '../shared/decimal';

export type { ApiContext };

export type FulfillmentOrderLine = {
  productName?: string; specification?: string;
  id: string; lineNo: number; productId: string; orderedQty: string; shippedQty: string;
  activeRequestedQty: string; reservedQty: string; remainingQty: string; uom: string;
  unitPrice: string; taxRate: string; promisedDate: string; allowPartialShipment: boolean;
  lineStatus: string; version: number;
};

export type FulfillmentOrder = {
  orderDate?: string; validUntil?: string; remark?: string;
  id: string; orderNo: string; customerId: string; customerName: string; ownerEmployeeId: string;
  fulfillmentWarehouseId: string; factoryResourceId: string; requestedDeliveryDate: string;
  allowPartialShipment: boolean; currency: string; totalAmount: string; originalAmount?: string;
  discountRate?: string; discountAmount?: string; overallStatus: string;
  reviewStatus: string; shipmentStatus: string; reviewRequired: boolean; recipient: Record<string, string>;
  lines: FulfillmentOrderLine[]; version: number; createdAt: string; updatedAt: string;
};

export type FulfillmentShipmentTask = {
  id: string; shipmentRequestId: string; salesOrderId: string; requestNo: string; warehouseId: string;
  salesOrderNo: string; orderRevision: number; allowPartialShipment: boolean;
  factoryResourceId?: string;
  workflowStatus: string; availabilityStatus: string; replenishmentStatus: string; postingStatus: string;
  inventoryFactVersion?: number; outboundId?: string; version: number; updatedAt: string;
  lines: Array<{
    id: string; orderLineId: string; productId: string; requestedQty: string; reservedQty: string;
    postedQty: string; shortageQty: string; uom: string; productionDemandId?: string;
    sourceLineRevision?: number; promisedDate?: string; allowPartialShipment?: boolean;
  }>;
};

export type FulfillmentOutbound = {
  id: string;
  version: number;
  status?: string;
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
) => {
  const lines = outbound.lines.flatMap((line) => {
  const remainingQty = subtractQuantity(line.reservedQty, line.postedQty);
  if (compareQuantity(remainingQty, '0') === 0) return [];
  const qty = quantitiesByOrderLineId?.[line.orderLineId] ?? remainingQty;
  if (qty === '0') return [];
  if (compareQuantity(qty, '0') <= 0 || compareQuantity(qty, remainingQty) > 0) {
    throw new Error(`${line.productId || line.orderLineId} 的本次发货数量必须大于 0 且不超过 ${remainingQty}`);
  }
  return [{ outboundLineId: line.id, qty, uom: line.uom }];
  });
  if (!lines.length) throw new Error('请至少选择一行有效的发货数量');
  return lines;
};

export type FulfillmentPostResult = {
  outcome: string; adapterKind: string; outbound: FulfillmentOutbound;
  task: FulfillmentShipmentTask; order: FulfillmentOrder;
};

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const createFulfillmentOrder = (context: ApiContext, input: Record<string, unknown>, idempotencyKey?: string) =>
  apiRequest<FulfillmentOrder>('/api/v1/sales/sales-orders', context, { method: 'POST', idempotencyKey: idempotencyKey || key('sales-order'), body: JSON.stringify(input) });

export const listFulfillmentOrders = (context: ApiContext, filter: { page: number; pageSize: number } = { page: 1, pageSize: 200 }) =>
  apiRequest<{ items: FulfillmentOrder[]; total: number }>(`/api/v1/sales/sales-orders?page=${filter.page}&pageSize=${filter.pageSize}`, context);

export const getFulfillmentOrder = (context: ApiContext, id: string) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${id}`, context);

export const approveFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder, decision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE', comment?: string, idempotencyKey = key(`review:${order.id}`)) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/review-decisions`, context, {
    method: 'POST', idempotencyKey, expectedVersion: order.version,
    body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
  });

export const confirmFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder, requestedDeliveryDate: string) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/confirm`, context, {
    method: 'POST', idempotencyKey: key(`confirm:${order.id}`), expectedVersion: order.version,
    body: JSON.stringify({ requestedDeliveryDate }),
  });

export const cancelFulfillmentOrder = (context: ApiContext, order: FulfillmentOrder, reason: string, idempotencyKey = key(`cancel:${order.id}`)) =>
  apiRequest<FulfillmentOrder>(`/api/v1/sales/sales-orders/${order.id}/cancel`, context, {
    method: 'POST', idempotencyKey, expectedVersion: order.version,
    body: JSON.stringify({ reason }),
  });

export const createFulfillmentShipmentRequest = (context: ApiContext, order: FulfillmentOrder) =>
  apiRequest<Record<string, unknown>>(`/api/v1/sales/sales-orders/${order.id}/shipment-requests`, context, {
    method: 'POST', idempotencyKey: `shipment:${order.id}:${order.version}`, expectedVersion: order.version,
    body: JSON.stringify({
      warehouseId: order.fulfillmentWarehouseId,
      lines: order.lines.filter((line) => line.lineStatus !== 'CANCELED'
        && compareQuantity(line.remainingQty, line.activeRequestedQty) > 0).map((line) => ({
        orderLineId: line.id, sourceLineRevision: line.version,
        requestedQty: subtractQuantity(line.remainingQty, line.activeRequestedQty), uom: line.uom,
      })),
    }),
  });

export const listFulfillmentShipmentTasks = (context: ApiContext, salesOrderId?: string) =>
  apiRequest<{ items: FulfillmentShipmentTask[]; total: number }>(`/api/v1/inventory/shipment-tasks?page=1&pageSize=200${salesOrderId ? `&salesOrderId=${encodeURIComponent(salesOrderId)}` : ''}`, context);

export const checkAndReserveShipmentTask = (
  context: ApiContext,
  task: FulfillmentShipmentTask,
  warehouseId?: string,
  expectedFactVersions?: Array<{ productId: string; factVersion: number }>,
) =>
  apiRequest<{ outcome: string; adapterKind: string; task: FulfillmentShipmentTask; outbound?: FulfillmentOutbound }>(`/api/v1/inventory/shipment-tasks/${task.id}/check-and-reserve`, context, {
    method: 'POST', idempotencyKey: key(`reserve:${task.id}`), expectedVersion: task.version,
    body: JSON.stringify({
      shipmentRequestId: task.shipmentRequestId,
      orderRevision: task.orderRevision,
      ...(warehouseId ? { warehouseId } : {}),
      ...(expectedFactVersions?.length ? { expectedFactVersions } : {}),
    }),
  });

export const createProductionRequestForTask = (
  context: ApiContext,
  task: FulfillmentShipmentTask,
  input?: { factoryResourceId?: string; defaultDueDate?: string },
) =>
  apiRequest<{ task: FulfillmentShipmentTask; demands: Array<{ id: string; code: string }>; restored?: boolean }>(`/api/v1/inventory/shipment-tasks/${task.id}/production-requests`, context, {
    method: 'POST', idempotencyKey: `production-request:${task.id}:${task.version}`, expectedVersion: task.version,
    body: JSON.stringify({
      lines: task.lines
        .filter((line) => Number(line.shortageQty) > 0)
        .map((line) => ({
          shipmentRequestLineId: line.id,
          orderLineId: line.orderLineId,
          sourceRevision: line.sourceLineRevision ?? task.orderRevision ?? 1,
          factoryResourceId: input?.factoryResourceId ?? task.factoryResourceId,
          dueDate: line.promisedDate ?? input?.defaultDueDate,
        })),
    }),
  });

export const getFulfillmentOutbound = (context: ApiContext, id: string) =>
  apiRequest<FulfillmentOutbound>(`/api/v1/inventory/outbounds/${id}`, context);

type OutboundCommand = {
  idempotencyKey: string;
  shippedAt: string;
  lines: ReturnType<typeof buildOutboundPostLines>;
};
const outboundCommands = new Map<string, OutboundCommand>();

export const postFulfillmentOutbound = async (
  context: ApiContext,
  outbound: FulfillmentOutbound,
  quantitiesByOrderLineId?: Record<string, string>,
) => {
  const storageKey = `industrial-ai:outbound-command:v1:${context.tenantId}:${outbound.id}:${outbound.version}`;
  const lines = buildOutboundPostLines(outbound, quantitiesByOrderLineId);
  let command = outboundCommands.get(storageKey);
  try {
    const saved = typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : null;
    if (saved) {
      const parsed = JSON.parse(saved) as OutboundCommand;
      if (typeof parsed.idempotencyKey === 'string' && typeof parsed.shippedAt === 'string' && Array.isArray(parsed.lines)) command = parsed;
    }
  } catch { /* Continue with the in-memory command if browser storage is unavailable. */ }
  if (command && JSON.stringify(command.lines) !== JSON.stringify(lines)) {
    throw new Error('上次出库请求结果尚未确认，请刷新任务后再修改发货数量');
  }
  command ??= { idempotencyKey: key(`outbound-command:${outbound.id}`), shippedAt: new Date().toISOString(), lines };
  outboundCommands.set(storageKey, command);
  try {
    if (typeof window !== 'undefined') window.sessionStorage.setItem(storageKey, JSON.stringify(command));
  } catch { /* The same page can still retry with the in-memory command. */ }
  try {
    return await apiRequest<FulfillmentPostResult>(`/api/v1/inventory/outbounds/${outbound.id}/post`, context, {
      method: 'POST', idempotencyKey: command.idempotencyKey, expectedVersion: outbound.version,
      body: JSON.stringify({ shippedAt: command.shippedAt, lines: command.lines }),
    });
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 408) {
      outboundCommands.delete(storageKey);
      try {
        if (typeof window !== 'undefined') window.sessionStorage.removeItem(storageKey);
      } catch { /* Browser storage is optional. */ }
    }
    throw error;
  }
};

// ===== Phase 6: Inventory Domain Completion =====

export type WarehouseDto = {
  id: string; code: string; name: string; type: string; address: string; manager: string;
  phone: string; organization?: string; capacity?: string; usedCapacity?: string;
  status: string; remark: string; version: number; createdAt: string; updatedAt: string;
};

export type ProductDto = {
  id: string; code: string; name: string; specification: string; category: string; uom: string;
  unitPrice: string; safetyStockQty: string; maxStockQty: string; productType: string; status: string; remark: string;
  defaultWarehouseId?: string | null;
  version: number; createdAt: string; updatedAt: string;
};

export type MaterialDto = {
  id: string; code: string; name: string; specification: string; category: string; uom: string;
  unitPrice: string; safetyStockQty: string; maxStockQty: string; materialType: string; status: string; remark: string;
  version: number; createdAt: string; updatedAt: string;
};

export type TransferOrderDto = {
  id: string; transferNo: string; fromWarehouseId: string; toWarehouseId: string;
  productId: string; productCode: string; productName: string;
  transferQty: string; receivedQty: string; uom: string; status: string; reason: string;
  externalTransactionId?: string; version: number; createdAt: string; updatedAt: string;
  lines: Array<{ id: string; productId: string; transferQty: string; receivedQty: string; uom: string; version: number }>;
};

export type StocktakeTaskDto = {
  id: string; stocktakeNo: string; warehouseId: string; scope: string; status: string;
  reason: string; assignedTo: string; version: number; createdAt: string; updatedAt: string;
  lines: Array<{ id: string; productId: string; productCode: string; productName: string; systemQty: string; countedQty?: string; varianceQty?: string; uom: string; binLocation: string; lineStatus: string; remark: string; version: number }>;
};

export type AvailabilityFactDto = {
  eventId?: string; warehouseId: string; productId: string; qualifiedOnHandQty: string;
  allocatedReservedQty: string; frozenQty: string; safetyStockQty: string; inTransitQty: string;
  fulfillableQty: string; uom: string; factVersion: number;
  asOf?: string;
};

export const inventoryApi = {
  // Warehouse
  listWarehouses: (context: ApiContext) => apiRequest<{ items: WarehouseDto[]; total: number }>('/api/v1/inventory/warehouses', context),
  getWarehouse: (context: ApiContext, id: string) => apiRequest<WarehouseDto>(`/api/v1/inventory/warehouses/${id}`, context),
  createWarehouse: (context: ApiContext, input: { code: string; name: string; type?: string; address?: string; manager?: string; phone?: string; organization?: string; capacity?: string; usedCapacity?: string; status?: string; remark?: string }) => apiRequest<{ warehouse: WarehouseDto }>('/api/v1/inventory/warehouses', context, { method: 'POST', idempotencyKey: key(`warehouse-create:${input.code}`), body: JSON.stringify(input) }),
  updateWarehouse: (context: ApiContext, warehouse: WarehouseDto, input: Partial<{ name: string; type: string; address: string; manager: string; phone: string; status: string; remark: string; organization: string; capacity: string; usedCapacity: string }>) => apiRequest<{ warehouse: WarehouseDto }>(`/api/v1/inventory/warehouses/${warehouse.id}`, context, { method: 'PATCH', expectedVersion: warehouse.version, idempotencyKey: key(`warehouse-update:${warehouse.id}`), body: JSON.stringify(input) }),
  deleteWarehouse: (context: ApiContext, warehouse: WarehouseDto) => apiRequest<{ deleted: boolean }>(`/api/v1/inventory/warehouses/${warehouse.id}`, context, { method: 'DELETE', expectedVersion: warehouse.version, idempotencyKey: key(`warehouse-delete:${warehouse.id}`) }),

  getAvailability: (context: ApiContext, warehouseId: string, productIds: string[]) =>
    apiRequest<AvailabilityFactDto[]>(`/api/v1/inventory/availability?warehouseId=${encodeURIComponent(warehouseId)}&productIds=${productIds.map(encodeURIComponent).join(',')}`, context),
  listAvailability: (context: ApiContext) =>
    apiRequest<AvailabilityFactDto[]>('/api/v1/inventory/availability', context),
  importAvailability: (context: ApiContext, input: AvailabilityFactDto & { formulaVersion: string; sourceSystem: string }) =>
    apiRequest<{ duplicate: boolean; projectionResult: string }>('/api/v1/inventory/import/availability', context,
      { method: 'POST', idempotencyKey: key(`inventory-import:${input.eventId}`), body: JSON.stringify(input) }),

  // Product
  listProducts: (context: ApiContext) => apiRequest<{ items: ProductDto[]; total: number }>('/api/v1/inventory/products', context),
  createProduct: (context: ApiContext, input: { code: string; name: string; specification?: string; category?: string; uom?: string; unitPrice?: string; safetyStockQty?: string; maxStockQty?: string; productType?: string; remark?: string; defaultWarehouseId?: string }) => apiRequest<{ product: ProductDto }>('/api/v1/inventory/products', context, { method: 'POST', idempotencyKey: key(`product-create:${input.code}`), body: JSON.stringify(input) }),
  updateProduct: (context: ApiContext, id: string, version: number, input: Partial<Pick<ProductDto, 'name' | 'specification' | 'category' | 'uom' | 'unitPrice' | 'safetyStockQty' | 'maxStockQty' | 'productType' | 'status' | 'remark' | 'defaultWarehouseId'>>) =>
    apiRequest<{ product: ProductDto }>(`/api/v1/inventory/products/${encodeURIComponent(id)}`, context,
      { method: 'PATCH', expectedVersion: version, idempotencyKey: key(`product-update:${id}`), body: JSON.stringify(input) }),

  // Material
  listMaterials: (context: ApiContext) => apiRequest<{ items: MaterialDto[]; total: number }>('/api/v1/inventory/materials', context),
  createMaterial: (context: ApiContext, input: { code: string; name: string; specification?: string; category?: string; uom?: string; unitPrice?: string; safetyStockQty?: string; maxStockQty?: string; materialType?: string; remark?: string }) => apiRequest<{ material: MaterialDto }>('/api/v1/inventory/materials', context, { method: 'POST', idempotencyKey: key(`material-create:${input.code}`), body: JSON.stringify(input) }),
  updateMaterial: (context: ApiContext, id: string, version: number, input: Partial<Pick<MaterialDto, 'name' | 'specification' | 'category' | 'uom' | 'unitPrice' | 'safetyStockQty' | 'maxStockQty' | 'materialType' | 'status' | 'remark'>>) =>
    apiRequest<{ material: MaterialDto }>(`/api/v1/inventory/materials/${encodeURIComponent(id)}`, context,
      { method: 'PATCH', expectedVersion: version, idempotencyKey: key(`material-update:${id}`), body: JSON.stringify(input) }),

  // Transfer orders
  listTransferOrders: (context: ApiContext) => apiRequest<{ items: TransferOrderDto[]; total: number }>('/api/v1/inventory/transfer-orders', context),
  getTransferOrder: (context: ApiContext, id: string) => apiRequest<TransferOrderDto>(`/api/v1/inventory/transfer-orders/${id}`, context),
  createTransferOrder: (context: ApiContext, input: { fromWarehouseId: string; toWarehouseId: string; productId: string; productCode?: string; productName?: string; transferQty: string; uom: string; reason?: string }) => apiRequest<{ transfer: TransferOrderDto }>('/api/v1/inventory/transfer-orders', context, { method: 'POST', idempotencyKey: key('transfer-create'), body: JSON.stringify(input) }),
  approveTransferOrder: (context: ApiContext, transfer: TransferOrderDto) => apiRequest<{ transfer: TransferOrderDto }>(`/api/v1/inventory/transfer-orders/${transfer.id}/approve`, context, { method: 'POST', expectedVersion: transfer.version, idempotencyKey: key(`transfer-approve:${transfer.id}`) }),
  shipTransferOrder: (context: ApiContext, transfer: TransferOrderDto) => apiRequest<{ transfer: TransferOrderDto }>(`/api/v1/inventory/transfer-orders/${transfer.id}/ship`, context, { method: 'POST', expectedVersion: transfer.version, idempotencyKey: key(`transfer-ship:${transfer.id}`), body: JSON.stringify({ externalTransactionId: `WEB-TRF-${transfer.id}` }) }),
  receiveTransferOrder: (context: ApiContext, transfer: TransferOrderDto) => apiRequest<{ transfer: TransferOrderDto }>(`/api/v1/inventory/transfer-orders/${transfer.id}/receive`, context, { method: 'POST', expectedVersion: transfer.version, idempotencyKey: key(`transfer-recv:${transfer.id}`), body: JSON.stringify({ externalTransactionId: `WEB-TRR-${transfer.id}` }) }),
  cancelTransferOrder: (context: ApiContext, transfer: TransferOrderDto, reason: string) => apiRequest<{ transfer: TransferOrderDto }>(`/api/v1/inventory/transfer-orders/${transfer.id}/cancel`, context, { method: 'POST', expectedVersion: transfer.version, idempotencyKey: key(`transfer-cancel:${transfer.id}`), body: JSON.stringify({ reason }) }),

  // Stocktake tasks
  listStocktakeTasks: (context: ApiContext) => apiRequest<{ items: StocktakeTaskDto[]; total: number }>('/api/v1/inventory/stocktake-tasks', context),
  getStocktakeTask: (context: ApiContext, id: string) => apiRequest<StocktakeTaskDto>(`/api/v1/inventory/stocktake-tasks/${id}`, context),
  createStocktakeTask: (context: ApiContext, input: { warehouseId: string; scope?: string; reason?: string; assignedTo?: string; lines: Array<{ productId: string; productCode?: string; productName?: string; systemQty: string; uom: string; binLocation?: string }> }) => apiRequest<{ stocktake: StocktakeTaskDto }>('/api/v1/inventory/stocktake-tasks', context, { method: 'POST', idempotencyKey: key('stocktake-create'), body: JSON.stringify(input) }),
  approveStocktakeTask: (context: ApiContext, task: StocktakeTaskDto) => apiRequest<{ stocktake: StocktakeTaskDto }>(`/api/v1/inventory/stocktake-tasks/${task.id}/approve`, context, { method: 'POST', expectedVersion: task.version, idempotencyKey: key(`stocktake-approve:${task.id}`) }),
  startStocktakeTask: (context: ApiContext, task: StocktakeTaskDto) => apiRequest<{ stocktake: StocktakeTaskDto }>(`/api/v1/inventory/stocktake-tasks/${task.id}/start`, context, { method: 'POST', expectedVersion: task.version, idempotencyKey: key(`stocktake-start:${task.id}`) }),
  submitStocktakeCount: (context: ApiContext, task: StocktakeTaskDto, lines: Array<{ lineId: string; countedQty: string; remark?: string }>) => apiRequest<{ stocktake: StocktakeTaskDto }>(`/api/v1/inventory/stocktake-tasks/${task.id}/count`, context, { method: 'POST', expectedVersion: task.version, idempotencyKey: key(`stocktake-count:${task.id}`), body: JSON.stringify({ lines }) }),
  adjustStocktakeTask: (context: ApiContext, task: StocktakeTaskDto) => apiRequest<{ stocktake: StocktakeTaskDto; adjustments: unknown[] }>(`/api/v1/inventory/stocktake-tasks/${task.id}/adjust`, context, { method: 'POST', expectedVersion: task.version, idempotencyKey: key(`stocktake-adjust:${task.id}`), body: JSON.stringify({ externalTransactionId: `WEB-STA-${task.id}` }) }),
};

// ===== 销售监控舱 AI 洞察 =====

export type AiInsights = {
  availability?: 'AVAILABLE' | 'EMPTY' | 'UNAVAILABLE';
  dataAsOf?: string | null;
  sourceVersion?: string | null;
  currency?: string | null;
  stalledOrders: Array<{
    orderId: string;
    customerId: string;
    customerName: string;
    status: string;
    totalAmount: string;
  }>;
  deliveryRiskOrders: Array<{
    orderId: string;
    customerName: string;
    deliveryDate: string;
    totalAmount: string;
  }>;
  totalSalesAmount: string;
  monthlyOrderCount: number;
  stalledCount: number;
  deliveryRiskCount: number;
  generatedAt: string;
};

export async function fetchAiInsights(
  context: ApiContext,
): Promise<AiInsights> {
  return apiRequest<AiInsights>("/api/v1/sales/ai-insights", context, {
    method: "GET",
  });
}
