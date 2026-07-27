import { ApiError, apiRequest, type ApiContext } from '../client';

export type ProductionApiContext = ApiContext;

export type DemandTraceability = {
  sourceSystem: string;
  sourceType: string;
  salesOrderId?: string;
  salesOrderLineId?: string;
  shipmentRequestId?: string;
  shipmentRequestLineId?: string;
  inventoryWarehouseId?: string;
  inventoryFactVersion?: number;
  correlationId: string;
  traceId?: string;
};

export type ProductionDemandDto = {
  id: string;
  code: string;
  sourceType: string;
  productId: string;
  productName?: string;
  qty: string;
  uom: string;
  dueDate: string;
  factoryResourceId: string;
  status: string;
  correlationId: string;
  version: number;
  source?: DemandTraceability;
};

export type SalesOrderIntakeResponse = {
  intake: {
    id: string;
    salesOrderId: string;
    sourceLineId: string;
    orderedQty: string;
    availableQty: string;
    shortageQty: string;
    decision: 'FULFILL_FROM_STOCK' | 'CREATE_PRODUCTION_DEMAND';
    inventoryFactVersion: number;
    demandId?: string;
    correlationId: string;
  };
  demand?: ProductionDemandDto;
  recovered: boolean;
};

export { ApiError as ProductionApiError };

export async function createSalesOrderIntake(
  context: ProductionApiContext,
  input: {
    salesOrderId: string;
    sourceLineId: string;
    sourceRevision: number;
    productId: string;
    productName?: string;
    orderedQty: string;
    uom: string;
    dueDate: string;
    factoryResourceId: string;
    inventoryWarehouseId: string;
  },
) {
  const idempotencyKey = `sales-intake:${context.tenantId}:${input.salesOrderId}:${input.sourceLineId}:${input.sourceRevision}`;
  return apiRequest<SalesOrderIntakeResponse>('/api/v1/production/sales-order-intakes', context, {
    method: 'POST',
    idempotencyKey,
    body: JSON.stringify(input),
  });
}

export async function listProductionDemands(context: ProductionApiContext) {
  return apiRequest<{ items: ProductionDemandDto[]; total: number }>(
    '/api/v1/production/demands?page=1&pageSize=200', context,
  );
}
