import type { PurchaseOrderDto, PurchaseRequestDto } from '../../api/procurement';

const missingFields = (value: object, fields: string[]) => {
  const missing = fields.filter(field => typeof value[field] !== 'string' || !value[field].trim());
  if (!Number.isInteger(value['version']) || value['version'] < 1) missing.push('version');
  return missing.length ? `来源字段不完整（${missing.join('、')}），暂不可操作` : '';
};

// Historical aliases are display-only: never promote them into a command's authoritative fields.
export const purchaseRequestReadOnlyReason = (request: PurchaseRequestDto) =>
  missingFields(request, ['id', 'requestNo', 'mrpTaskId', 'demandId', 'materialId', 'warehouseId', 'requiredQty', 'uom', 'requiredDate']);

export const purchaseOrderReadOnlyReason = (order: PurchaseOrderDto) =>
  missingFields(order, ['id', 'orderNo', 'purchaseRequestId', 'materialId', 'warehouseId', 'orderedQty', 'receivedQty', 'uom', 'promisedDate']);
