import type { PurchaseRequestDto } from '../../../api/procurement';

/** A shortage is a reference quantity, not a lot-sized purchase suggestion or a persisted PR. */
export function mrpShortageRow(
  shortage: Record<string, unknown>, taskId: string, source: string,
) {
  const demandId = shortage.demandId, materialId = shortage.materialId;
  if (typeof demandId !== 'string' || !demandId.trim() || typeof materialId !== 'string' || !materialId.trim() || !taskId) {
    throw new Error('MRP 缺口缺少任务、需求或物料标识，请重新查询');
  }
  return {
    id: `MRP-${taskId}-${demandId}-${materialId}`,
    mrpTaskId: taskId, demandId, source,
    itemCode: materialId, itemName: shortage.materialName || materialId,
    grossReq: shortage.grossRequiredQty, stock: shortage.availableQty, onWay: null,
    netReq: shortage.shortageQty, uom: shortage.uom, lotRule: '批量规则未提供',
    status: '采购状态待查询', purchaseStateKnown: false, pegging: [],
  };
}

/** Restore source links from a complete authorized API collection, including rejected requests. */
export function mrpPurchaseState(
  row: { mrpTaskId?: string; demandId?: string; itemCode?: string },
  requests: PurchaseRequestDto[] | null,
) {
  if (!requests || !row.mrpTaskId || !row.demandId || !row.itemCode
    || requests.some(request => !request.mrpTaskId || !request.demandId || !request.materialId || !request.status)) {
    return { purchaseStateKnown: false, purchaseRequestId: undefined, status: '采购状态待查询' };
  }
  const matches = requests.filter(request => request.mrpTaskId === row.mrpTaskId
    && request.demandId === row.demandId && request.materialId === row.itemCode);
  if (matches.length > 1) return { purchaseStateKnown: false, purchaseRequestId: undefined, status: '采购关联待核实' };
  const request = matches[0];
  return {
    purchaseStateKnown: true, purchaseRequestId: request?.id,
    status: request ? `采购申请：${request.status}` : '未查询到采购申请',
  };
}
