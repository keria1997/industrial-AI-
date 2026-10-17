import { apiRequest, type ApiContext } from './client';

export type PurchaseRequestDto = {
  id: string; requestNo: string; mrpTaskId: string; demandId: string; materialId: string; materialName?: string;
  warehouseId: string; requiredQty: string; uom: string; requiredDate: string; status: string;
  purchaseOrderId?: string; rejectReason?: string; version: number; createdAt: string; updatedAt: string;
};

export type PurchaseOrderDto = {
  id: string; orderNo: string; purchaseRequestId: string; demandId: string; materialId: string; materialName?: string;
  warehouseId: string; orderedQty: string; receivedQty: string; uom: string; supplierId: string;
  supplierName: string; promisedDate: string;
  unitPrice: string; taxRate: string; currency: string; totalAmount: string;
  status: string; cancelReason?: string; canceledAt?: string;
  version: number; createdAt: string; updatedAt: string;
};

export type PurchaseReceiptDto = {
  id: string; receiptNo: string; purchaseOrderId: string; demandId: string; materialId: string; warehouseId: string;
  receivedQty: string; uom: string; externalTransactionId: string; inventoryFactVersion: number;
  status: string; receivedAt: string;
  inspectedBy?: string; inspectedAt?: string; inspectionResult?: string; inspectionRemark?: string;
  version: number;
};

export type SupplierDto = {
  id: string; code: string; name: string; shortName: string;
  contactPerson: string; phone: string; email: string; address: string;
  bankAccount: string; taxNo: string; rating: string;
  leadTimeDays: number; minOrderQty: string; paymentTerms: string;
  status: string; remark: string;
  version: number; createdAt: string; updatedAt: string;
};

export type PurchaseReturnDto = {
  id: string; returnNo: string; purchaseReceiptId: string; purchaseOrderId: string;
  supplierId: string; supplierName: string; materialId: string; warehouseId: string;
  returnQty: string; uom: string; reason: string; status: string;
  externalTransactionId?: string; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

const operationKey = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const procurementApi = {
  createRequest: (context: ApiContext, input: { mrpTaskId: string; demandId: string; materialId: string }) =>
    apiRequest<PurchaseRequestDto>('/api/v1/procurement/purchase-requests', context, {
      method: 'POST', body: JSON.stringify(input), idempotencyKey: operationKey(`purchase-request:${input.mrpTaskId}:${input.demandId}:${input.materialId}`),
    }),
  listRequests: (context: ApiContext) => apiRequest<{ items: PurchaseRequestDto[]; total: number }>('/api/v1/procurement/purchase-requests', context),
  approveRequest: (context: ApiContext, request: PurchaseRequestDto, options: { supplierId: string; supplierName: string; unitPrice?: string; taxRate?: string; currency?: string }) => apiRequest<{ request: PurchaseRequestDto; order: PurchaseOrderDto }>(`/api/v1/procurement/purchase-requests/${request.id}/approve`, context, {
    method: 'POST', expectedVersion: request.version, idempotencyKey: operationKey(`purchase-approve:${request.id}`),
    body: JSON.stringify({ promisedDate: request.requiredDate, ...options }),
  }),
  rejectRequest: (context: ApiContext, request: PurchaseRequestDto, reason: string) => apiRequest<{ request: PurchaseRequestDto }>(`/api/v1/procurement/purchase-requests/${request.id}/reject`, context, {
    method: 'POST', expectedVersion: request.version, idempotencyKey: operationKey(`purchase-reject:${request.id}`),
    body: JSON.stringify({ reason }),
  }),
  listOrders: (context: ApiContext) => apiRequest<{ items: PurchaseOrderDto[]; total: number }>('/api/v1/procurement/purchase-orders', context),
  cancelOrder: (context: ApiContext, order: PurchaseOrderDto, reason: string) => apiRequest<{ order: PurchaseOrderDto }>(`/api/v1/procurement/purchase-orders/${order.id}/cancel`, context, {
    method: 'POST', expectedVersion: order.version, idempotencyKey: operationKey(`purchase-cancel:${order.id}`),
    body: JSON.stringify({ reason }),
  }),
  receiveOrder: (context: ApiContext, order: PurchaseOrderDto, options?: { receivedQty?: string; requireInspection?: boolean }) => apiRequest<{ order: PurchaseOrderDto; receipt: PurchaseReceiptDto; availability: { productId: string; warehouseId: string; fulfillableQty: string; factVersion: number } }>(`/api/v1/procurement/purchase-orders/${order.id}/receipts`, context, {
    method: 'POST', expectedVersion: order.version, idempotencyKey: operationKey(`purchase-receipt:${order.id}`),
    body: JSON.stringify({ externalTransactionId: `WEB-PRCV-${order.id}`, receivedAt: new Date().toISOString(), ...options }),
  }),
  listReceipts: (context: ApiContext) => apiRequest<{ items: PurchaseReceiptDto[]; total: number }>('/api/v1/procurement/purchase-receipts', context),
  inspectReceipt: (context: ApiContext, receiptId: string, result: 'ACCEPTED' | 'REJECTED', remark?: string) => apiRequest<{ receipt: PurchaseReceiptDto }>(`/api/v1/procurement/purchase-receipts/${receiptId}/inspect`, context, {
    method: 'POST', idempotencyKey: operationKey(`purchase-inspect:${receiptId}`),
    body: JSON.stringify({ result, remark }),
  }),
  // Supplier management
  listSuppliers: (context: ApiContext) => apiRequest<{ items: SupplierDto[]; total: number }>('/api/v1/procurement/suppliers', context),
  getSupplier: (context: ApiContext, id: string) => apiRequest<SupplierDto>(`/api/v1/procurement/suppliers/${id}`, context),
  createSupplier: (context: ApiContext, input: { code: string; name: string; shortName?: string; contactPerson?: string; phone?: string; email?: string; address?: string; rating?: string; leadTimeDays?: number; paymentTerms?: string; remark?: string }) => apiRequest<SupplierDto>('/api/v1/procurement/suppliers', context, {
    method: 'POST', idempotencyKey: operationKey(`supplier-create:${input.code}`),
    body: JSON.stringify(input),
  }),
  updateSupplier: (context: ApiContext, supplier: SupplierDto, input: Partial<{ name: string; shortName: string; contactPerson: string; phone: string; email: string; address: string; rating: string; leadTimeDays: number; paymentTerms: string; status: string; remark: string }>) => apiRequest<SupplierDto>(`/api/v1/procurement/suppliers/${supplier.id}`, context, {
    method: 'PATCH', expectedVersion: supplier.version, idempotencyKey: operationKey(`supplier-update:${supplier.id}`),
    body: JSON.stringify({ ...input, version: supplier.version }),
  }),
  // Purchase returns
  listReturns: (context: ApiContext) => apiRequest<{ items: PurchaseReturnDto[]; total: number }>('/api/v1/procurement/purchase-returns', context),
  createReturn: (context: ApiContext, input: { purchaseReceiptId: string; reason: string; returnQty?: string; remark?: string }) => apiRequest<PurchaseReturnDto>('/api/v1/procurement/purchase-returns', context, {
    method: 'POST', idempotencyKey: operationKey(`return-create:${input.purchaseReceiptId}`),
    body: JSON.stringify(input),
  }),
  processReturn: (context: ApiContext, ret: PurchaseReturnDto, externalTransactionId: string) => apiRequest<{ ret: PurchaseReturnDto }>(`/api/v1/procurement/purchase-returns/${ret.id}/process`, context, {
    method: 'POST', expectedVersion: ret.version, idempotencyKey: operationKey(`return-process:${ret.id}`),
    body: JSON.stringify({ externalTransactionId }),
  }),
};
