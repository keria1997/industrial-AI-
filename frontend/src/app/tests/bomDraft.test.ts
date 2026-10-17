import { describe, expect, it } from 'vitest';
import { buildBomInput, type BomLineDraft, type BomOperationDraft } from '../../features/production/model/bomDraft';
import { productionError } from '../../features/production/model/productionError';
import { ApiError } from '../../api/client';

const line: BomLineDraft = { key: 'ui-only', materialId: 'material-uuid', materialName: '物料', warehouseId: 'warehouse-uuid', qtyPer: '002.50', uom: 'PCS' };
const operation: BomOperationDraft = { key: 'ui-only', sequence: '010', code: ' OP10 ', name: ' 组装 ', workCenterResourceId: 'center-uuid', standardMinutes: '01.25' };
const build = (lines = [line], operations = [operation]) => buildBomInput('product-uuid', '产品', lines, operations, 'routing-uuid');

describe('formal BOM draft safeguards', () => {
  it('preserves stable IDs and decimal strings while stripping UI row keys', () => {
    const result = build();
    expect(result.errors).toEqual({});
    expect(result.input.productId).toBe('product-uuid');
    expect(result.input.routingSnapshot.productId).toBe('product-uuid');
    expect(result.input.routingSnapshot.id).toBe(result.input.routingSnapshotId);
    expect(result.input.lines[0]).toEqual({ materialId: 'material-uuid', materialName: '物料', warehouseId: 'warehouse-uuid', qtyPer: '2.50', uom: 'PCS' });
    expect(result.input.routingSnapshot.operations[0]).toEqual({ sequence: 10, code: 'OP10', name: '组装', workCenterResourceId: 'center-uuid', standardMinutes: '1.25' });
  });
  it.each(['', '0', '-1', '1e3', 'NaN', '0.'])('blocks invalid positive quantities and durations: %s', value => {
    expect(build([{ ...line, qtyPer: value }]).errors['qtyPer-0']).toBeTruthy();
    expect(build([line], [{ ...operation, standardMinutes: value }]).errors['standardMinutes-0']).toBeTruthy();
  });
  it('requires material and routing lines and identifies duplicate warehouse/material pairs', () => {
    expect(build([], []).errors).toEqual(expect.objectContaining({ lines: expect.any(String), operations: expect.any(String) }));
    expect(build([line, { ...line, key: 'other' }]).errors['materialId-1']).toBeTruthy();
    expect(build([line, { ...line, key: 'other', warehouseId: 'other-warehouse' }]).errors).toEqual({});
  });
  it('rejects nonincreasing sequence, duplicate codes and Java integer overflow', () => {
    expect(build([line], [operation, { ...operation, key: 'other', sequence: '5' }]).errors).toEqual(expect.objectContaining({ 'sequence-1': expect.any(String), 'code-1': expect.any(String) }));
    for (const sequence of ['', '0', '1.5', '2147483648', '9007199254740992']) {
      expect(build([line], [{ ...operation, sequence }]).errors['sequence-0']).toBeTruthy();
    }
  });
  it('keeps backend field guidance and trace IDs in a persistent error', () => {
    const error = new ApiError('版本冲突', 409, 'PRODUCTION_409_VERSION_CONFLICT', '刷新后确认', false, 'trace-019', [{ field: 'version', message: '版本过期' }]);
    expect(productionError(error)).toBe('版本冲突；version：版本过期；刷新后确认；追踪号：trace-019');
  });
});
