import { afterEach, describe, expect, it, vi } from 'vitest';
import { warehouseAssociation } from '../../features/inventory/model/warehouseAssociation';
import { appendActivityPage } from '../../features/workbench/activityPages';
import { readPasswordResetRoute } from '../passwordResetRoute';
import { sourceDestination } from '../sourceDestination';
import { apiContextScope, apiRequest } from '../../api/client';
import { readAllPages } from '../../api/readAllPages';
import { listEmployeeAccounts, updateEmployeeStatus, loginWithSms, resetPasswordByEmail } from '../../api/session';
import { productionOperationsApi, type WorkOrderDto, type InspectionDto } from '../../api/production/operations';
import { requireCompletionFacts } from '../../api/production/completionInput';

const context = { tenantId: 'tenant-one', accessToken: 'signed-token' };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('inventory warehouse association', () => {
  const active = { id: 'WH-CODE', serverId: 'warehouse-uuid', status: '启用' } as any;
  const inactive = { id: 'WH-OLD', serverId: 'inactive-uuid', status: '停用' } as any;
  it('keeps product creation optional and requires a material warehouse', () => {
    expect(warehouseAssociation([], '', '', 'product', true)).toEqual({});
    expect(() => warehouseAssociation([], '', '', 'material', true)).toThrow('请选择物料');
  });
  it('submits only authorized active server IDs', () => {
    expect(warehouseAssociation([active], 'WH-CODE', '', 'material', true)).toEqual({ defaultWarehouseId: 'warehouse-uuid' });
    expect(warehouseAssociation([active], 'warehouse-uuid', '', 'product', false)).toEqual({ defaultWarehouseId: 'warehouse-uuid' });
    for (const rows of [[], [inactive], [{ ...active, serverId: undefined }]]) {
      expect(() => warehouseAssociation(rows, rows[0]?.id || 'unknown', '', 'material', true)).toThrow('可用');
    }
  });
  it('preserves historical associations while blocking unsupported removal', () => {
    expect(warehouseAssociation([], 'removed-code', 'removed-code', 'material', false)).toEqual({});
    expect(() => warehouseAssociation([active], '', 'WH-CODE', 'product', false)).toThrow('暂不支持取消');
  });
});

describe('reset link and source protocol', () => {
  it('reads the current backend six-digit email code without accepting ambiguous credentials', () => {
    expect(readPasswordResetRoute({ pathname: '/', search: '?token=123456' })).toBeNull();
    expect(readPasswordResetRoute({ pathname: '/reset-password/', search: '?token=123456' })).toEqual({ code: '123456' });
    for (const search of ['', '?token=opaque', '?token=123456&token=654321', '?token=12345']) {
      expect(readPasswordResetRoute({ pathname: '/reset-password', search })).toEqual({ code: '' });
    }
  });
  it.each([
    ['WorkOrder', '生产管理', 'focusOrder'],
    ['ProductionDemand', '生产管理', 'focusMps'],
    ['PurchaseRequest', '采购管理', 'focusPr'],
    ['ShipmentTask', '库存管理', 'focusOutbound'],
  ])('locates %s by stable source ID', (sourceType, module, focus) => {
    expect(sourceDestination({ sourceType, sourceId: 'server-id' })).toMatchObject({ module, query: { [focus]: 'server-id' } });
    expect(sourceDestination({ sourceType, sourceId: '' })).toBeNull();
  });
  it('sends tenant headers, preserves 204 and submits the implemented email/code reset protocol', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ items: [{ id: 'employee-id' }] }))
      .mockResolvedValueOnce(new Response(null, { status: 204, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect(await listEmployeeAccounts(context)).toEqual([{ id: 'employee-id' }]);
    await updateEmployeeStatus(context, 'employee/id', 'disabled');
    await resetPasswordByEmail('test@example.test', '123456', 'NewPassword1!');
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'X-Tenant-Id': 'tenant-one', Authorization: 'Bearer signed-token' });
    expect(fetch.mock.calls[1][0]).toContain('employee%2Fid/status');
    expect(JSON.parse(String(fetch.mock.calls[2][1]?.body))).toEqual({ email: 'test@example.test', code: '123456', newPassword: 'NewPassword1!' });
  });
  it('records phone login correctly and scopes data by authorization revisions', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ user: { account: 'phone-account' }, accessToken: 'token' }));
    expect((await loginWithSms('13912345678', '123456')).loginType).toBe('phone');
    expect(apiContextScope(context)).not.toBe(apiContextScope({ ...context, permissionVersion: 'new' }));
    expect(apiContextScope(context)).not.toBe(apiContextScope({ ...context, scopeVersion: 'new' }));
  });
});

describe('complete paging and workbench history', () => {
  it('reads through a server page-size cap instead of silently returning the first 200 rows', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ items: [{ id: '1' }, { id: '2' }], total: 3 }))
      .mockResolvedValueOnce(json({ items: [{ id: '3' }], total: 3 }));
    expect((await readAllPages('/api/v1/production/demands', context)).items).toHaveLength(3);
    expect(fetch.mock.calls[1][0]).toContain('page=2');
  });
  it.each([
    [{ items: [{ id: '1' }], total: 2 }, { items: [], total: 2 }],
    [{ items: [{ id: '1' }], total: 2 }, { items: [{ id: '1' }], total: 2 }],
    [{ items: [{ id: '1' }], total: 2 }, { items: [{ id: '2' }], total: 3 }],
  ])('rejects truncated, repeated or changing collections', async (first, second) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(first)).mockResolvedValueOnce(json(second));
    await expect(readAllPages('/api/v1/production/demands', context)).rejects.toThrow();
  });
  it('appends more than 50 events, keeps newest duplicates and sorts newest first', () => {
    const current = Array.from({ length: 50 }, (_, index) => ({ id: String(index), title: `new-${index}`, occurredAt: new Date(1000000 - index * 1000).toISOString() })) as any;
    const history = [{ ...current[0], title: 'stale-duplicate' }, { id: 'old', occurredAt: new Date(0).toISOString() }] as any;
    const result = appendActivityPage(current, history);
    expect(result).toHaveLength(51);
    expect(result[0].title).toBe('new-0');
    expect(result[result.length - 1]?.id).toBe('old');
  });
  it('handles a JSON-labelled 204 without parsing an empty response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204, headers: { 'Content-Type': 'application/json' } }));
    expect(await apiRequest('/api/v1/test-command', context, { method: 'PUT' })).toBeNull();
  });
});

describe('completion facts cannot be fabricated', () => {
  it('does not send a completion with guessed resources, trace rules or revision', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(productionOperationsApi.createCompletion(context, { id: 'order' } as WorkOrderDto,
      { id: 'inspection' } as InspectionDto, 'inventory-id')).rejects.toThrow('暂不能提交完工入库');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects missing and invalid production dates without falling back to UTC today', () => {
    for (const productionDate of ['', '2026-99-99', '2026-02-31']) {
      expect(() => requireCompletionFacts({ warehouseResourceId: 'resource', traceMode: 'NONE', allocationRevision: 2, productionDate }))
        .toThrow('暂不能提交完工入库');
    }
  });
});
