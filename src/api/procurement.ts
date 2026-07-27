import { apiRequest, type ApiContext } from './client';

export type PurchaseRequestDto = {
  id: string; requestNo: string; mrpTaskId: string; demandId: string; materialId: string; materialName?: string;
  warehouseId: string; requiredQty: string; uom: string; requiredDate: string; status: string;
  purchaseOrderId?: string; version: number; createdAt: string; updatedAt: string;
};

export type PurchaseOrderDto = {
  id: string; orderNo: string; purchaseRequestId: string; demandId: string; materialId: string; materialName?: string;
  warehouseId: string; orderedQty: string; receivedQty: string; uom: string; supplierId: string;
  supplierName: string; promisedDate: string; status: string; version: number; createdAt: string; updatedAt: string;
};

export type PurchaseReceiptDto = {
  id: string; receiptNo: string; purchaseOrderId: string; demandId: string; materialId: string; warehouseId: string;
  receivedQty: string; uom: string; externalTransactionId: string; inventoryFactVersion: number;
  status: string; receivedAt: string; version: number;
};

const operationKey = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const procurementApi = {
  createRequest: (context: ApiContext, input: { mrpTaskId: string; demandId: string; materialId: string }) =>
    apiRequest<PurchaseRequestDto>('/api/v1/procurement/purchase-requests', context, {
      method: 'POST', body: JSON.stringify(input), idempotencyKey: operationKey(`purchase-request:${input.mrpTaskId}:${input.demandId}:${input.materialId}`),
    }),
  listRequests: (context: ApiContext) => apiRequest<{ items: PurchaseRequestDto[]; total: number }>('/api/v1/procurement/purchase-requests', context),
  approveRequest: (context: ApiContext, request: PurchaseRequestDto) => apiRequest<{ request: PurchaseRequestDto; order: PurchaseOrderDto }>(`/api/v1/procurement/purchase-requests/${request.id}/approve`, context, {
    method: 'POST', expectedVersion: request.version, idempotencyKey: operationKey(`purchase-approve:${request.id}`),
    body: JSON.stringify({ supplierId: 'SUP-001', supplierName: '深圳华芯科技', promisedDate: request.requiredDate }),
  }),
  listOrders: (context: ApiContext) => apiRequest<{ items: PurchaseOrderDto[]; total: number }>('/api/v1/procurement/purchase-orders', context),
  receiveOrder: (context: ApiContext, order: PurchaseOrderDto) => apiRequest<{ order: PurchaseOrderDto; receipt: PurchaseReceiptDto; availability: { productId: string; warehouseId: string; fulfillableQty: string; factVersion: number } }>(`/api/v1/procurement/purchase-orders/${order.id}/receipts`, context, {
    method: 'POST', expectedVersion: order.version, idempotencyKey: operationKey(`purchase-receipt:${order.id}`),
    body: JSON.stringify({ externalTransactionId: `WEB-PRCV-${order.id}`, receivedAt: new Date().toISOString() }),
  }),
  listReceipts: (context: ApiContext) => apiRequest<{ items: PurchaseReceiptDto[]; total: number }>('/api/v1/procurement/purchase-receipts', context),
};
