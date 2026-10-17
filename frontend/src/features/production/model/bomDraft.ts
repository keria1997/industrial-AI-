import type { BomSnapshot } from '../../../api/production/operations';
import { normalizeNumericDraft, parseNumericDraft } from '../../../shared/numericDraft';

export type BomLineDraft = BomSnapshot['lines'][number] & { key: string };
export type BomOperationDraft = Omit<BomSnapshot['routingSnapshot']['operations'][number], 'sequence'> & { sequence: string; key: string };

/** Validate only the user's draft; the server remains authoritative for publication. */
export function buildBomInput(productId: string, productName: string, lines: BomLineDraft[], operations: BomOperationDraft[], routingId: string) {
  const errors: Record<string, string> = {};
  if (!productId.trim()) errors.productId = '请选择正式产品';
  if (!lines.length) errors.lines = '请至少添加一条物料';
  if (!operations.length) errors.operations = '请至少添加一道工序';
  const pairs = new Set<string>();
  const normalizedLines = lines.map((line, index) => {
    const qtyPer = normalizeNumericDraft(line.qtyPer, { positive: true });
    for (const field of ['materialId', 'warehouseId', 'uom'] as const) {
      if (!line[field]?.trim()) errors[`${field}-${index}`] = '此项必填';
    }
    if (qtyPer === null) errors[`qtyPer-${index}`] = '用量须为大于 0 的十进制数';
    const pair = JSON.stringify([line.warehouseId, line.materialId]);
    if (pairs.has(pair)) errors[`materialId-${index}`] = '同一仓库不能重复添加相同物料';
    pairs.add(pair);
    return { materialId: line.materialId, materialName: line.materialName, warehouseId: line.warehouseId, qtyPer: qtyPer!, uom: line.uom.trim() };
  });
  let previousSequence = 0;
  const codes = new Set<string>();
  const normalizedOperations = operations.map((operation, index) => {
    const sequence = parseNumericDraft(operation.sequence, { integer: true, min: 1, max: 2147483647 });
    const standardMinutes = normalizeNumericDraft(operation.standardMinutes, { positive: true });
    if (sequence === null || sequence <= previousSequence) errors[`sequence-${index}`] = '工序顺序须为递增正整数，且不超过 2147483647';
    if (sequence !== null) previousSequence = sequence;
    const code = operation.code.trim();
    if (!code || codes.has(code)) errors[`code-${index}`] = '工序编码必填且不能重复';
    codes.add(code);
    if (!operation.name.trim()) errors[`name-${index}`] = '请填写工序名称';
    if (!operation.workCenterResourceId) errors[`workCenterResourceId-${index}`] = '请选择正式工作中心';
    if (standardMinutes === null) errors[`standardMinutes-${index}`] = '工时须为大于 0 的十进制数';
    return { sequence: sequence!, code, name: operation.name.trim(), workCenterResourceId: operation.workCenterResourceId, standardMinutes: standardMinutes! };
  });
  return {
    errors,
    input: {
      productId: productId.trim(), productName: productName.trim(), lines: normalizedLines,
      routingSnapshotId: routingId,
      routingSnapshot: { id: routingId, productId: productId.trim(), operations: normalizedOperations },
    },
  };
}
