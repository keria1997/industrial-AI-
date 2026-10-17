import { ApiError } from '../../../api/client';

const quantityFields = [
  'qualifiedOnHandQty', 'allocatedReservedQty', 'frozenQty',
  'safetyStockQty', 'inTransitQty', 'fulfillableQty',
] as const;

/** CSV -> business API: every stock fact and its source must be explicitly supplied. */
export function inventoryFactInput(payload: Record<string, string>, eventId: string) {
  const invalid = (message: string): never => {
    throw new ApiError(message, 422, 'INVENTORY_IMPORT_INVALID_FACT');
  };
  for (const field of ['warehouseId', 'productId', 'uom', 'sourceSystem', 'asOf', 'factVersion', ...quantityFields]) {
    if (!payload[field]?.trim()) invalid(`库存快照缺少 ${field}，不能用默认值代替来源事实`);
  }
  for (const field of quantityFields) {
    if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(payload[field].trim())) {
      invalid(`${field} 必须是非负十进制数，最多 6 位小数`);
    }
  }
  const factVersion = Number(payload.factVersion);
  if (!/^[1-9]\d*$/.test(payload.factVersion) || !Number.isSafeInteger(factVersion)) invalid('事实版本必须是有效正整数');
  const asOf = payload.asOf.trim();
  const dateParts = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.exec(asOf);
  const year = Number(dateParts?.[1]), month = Number(dateParts?.[2]), day = Number(dateParts?.[3]);
  const daysInMonth = month >= 1 && month <= 12 ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 0;
  if (!dateParts || day < 1 || day > daysInMonth || !Number.isFinite(Date.parse(asOf))) {
    invalid('快照时间必须包含有效日期、时间和时区');
  }
  return {
    eventId, warehouseId: payload.warehouseId.trim(), productId: payload.productId.trim(),
    qualifiedOnHandQty: payload.qualifiedOnHandQty.trim(),
    allocatedReservedQty: payload.allocatedReservedQty.trim(), frozenQty: payload.frozenQty.trim(),
    safetyStockQty: payload.safetyStockQty.trim(), inTransitQty: payload.inTransitQty.trim(),
    fulfillableQty: payload.fulfillableQty.trim(), uom: payload.uom.trim(),
    formulaVersion: 'FULFILLABLE-V1', factVersion, asOf,
    sourceSystem: payload.sourceSystem.trim(),
  };
}
