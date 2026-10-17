import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryApi } from '../../api/fulfillment';
import { platformApi } from '../../api/platform/client';
import { mapSalesCustomer, saveSalesCustomer } from '../../features/sales/model/formalCustomer';
import { createInventoryReplenishmentDemand } from '../../features/inventory/model/replenishmentDemand';
import { persistPlatformChange } from '../../platform/persistPlatformChange';
import type { PlatformState } from '../../platform/platformSeed';

const context = { tenantId: 'API-TENANT', accessToken: 'test-token' };
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});
const snapshot = () => ({
  tenant: { id: context.tenantId }, capabilities: [], orgUnits: [], resources: [],
  positions: [], employees: [], accounts: [], roles: [], approvalRules: [],
  dictionaries: [], parameters: [], adapters: [], permissions: [], roleGrants: [], audits: [],
}) as unknown as PlatformState;

afterEach(() => vi.restoreAllMocks());

describe('formal data persistence replaces prototype bridges', () => {
  it.each(['Product', 'Material'] as const)('creates and updates %s using actual inventory contracts', async kind => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response({}));
    const input = { code: 'API-CODE', name: '接口物项', uom: 'PCS', safetyStockQty: '3' };
    await inventoryApi[`create${kind}`](context, input);
    await inventoryApi[`update${kind}`](context, 'server-uuid', 7, { name: '修改名称' });
    const collection = kind === 'Product' ? 'products' : 'materials';
    expect(fetch.mock.calls[0][0]).toBe(`/api/v1/inventory/${collection}`);
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
    expect(fetch.mock.calls[1][0]).toBe(`/api/v1/inventory/${collection}/server-uuid`);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'PATCH', headers: { 'If-Match': '"7"', 'X-Tenant-Id': context.tenantId },
    });
    expect(JSON.parse(String(fetch.mock.calls[1][1]?.body))).toEqual({ name: '修改名称' });
  });

  it('preserves customer identity, missing facts and server metadata on update', async () => {
    const customer = {
      id: 'customer-uuid', customerNo: 'API-CUSTOMER', name: '接口客户', version: 4,
      status: 'active', metadata: { externalReference: 'retained', phone: '13900000000' },
    } as any;
    const draft = mapSalesCustomer(customer);
    expect(draft.id).toBe(customer.id);
    expect(draft.customerNo).toBe(customer.customerNo);
    expect(draft.level).toBe('');
    expect(draft.lastInteractionAt).toBe('');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ customer: { ...customer, name: '新名称', version: 5 } }));
    const saved = await saveSalesCustomer(context, { ...draft, name: '新名称' });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/supply-chain/customers/customer-uuid');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PATCH', headers: { 'If-Match': '"4"' } });
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).metadata).toMatchObject({ externalReference: 'retained' });
    expect(saved.formalCustomer.version).toBe(5);
  });

  it('propagates a failed customer save instead of fabricating a record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ error: { message: '无写权限' } }, 403));
    const draft = mapSalesCustomer({ id: 'id', customerNo: 'number', status: 'active', name: '客户', version: 1 } as any);
    await expect(saveSalesCustomer(context, draft)).rejects.toThrow('无写权限');
  });

  it('normalizes auditLogs from the API snapshot without inventing audit entries', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ ...snapshot(), audits: undefined, auditLogs: [{ id: 'server-audit' }] }));
    expect((await platformApi.getSnapshot(context)).audits).toEqual([{ id: 'server-audit' }]);
  });

  it('persists one platform entity using PUT /id with its server version', async () => {
    const before = snapshot();
    before.orgUnits = [{ id: 'org-uuid', name: '原组织', version: 6 } as any];
    const after = { ...before, orgUnits: [{ ...before.orgUnits[0], name: '修改组织' }] };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}));
    await persistPlatformChange(context, before, after);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/platform/org-units/org-uuid');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"6"' } });
  });

  it('creates a platform draft with POST even when it already has a client ID', async () => {
    const before = snapshot();
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}));
    await persistPlatformChange(context, before, { ...before, dictionaries: [{ id: 'draft-id', name: '字典' } as any] });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/platform/dictionaries');
    expect(fetch.mock.calls[0][1]?.method).toBe('POST');
  });

  it('rejects unsupported tenant and adapter sync changes before sending a request', async () => {
    const before = snapshot();
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(persistPlatformChange(context, before, { ...before, tenant: { ...before.tenant, name: '改变企业' } })).rejects.toThrow('未提供');
    await expect(persistPlatformChange(context, before, { ...before, adapters: [{ id: 'adapter', status: 'synced' } as any] })).rejects.toThrow('未提供');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects missing server versions and multi-entity pseudo transactions', async () => {
    const before = snapshot();
    before.orgUnits = [{ id: 'id', name: '原名称' } as any];
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(persistPlatformChange(context, before, { ...before, orgUnits: [{ ...before.orgUnits[0], name: '更新' }] })).rejects.toThrow('版本未加载');
    await expect(persistPlatformChange(context, snapshot(), { ...snapshot(), dictionaries: [{ id: 'a' }, { id: 'b' }] as any })).rejects.toThrow('一条正式业务命令');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('resolves replenishment factory from API resource relations, never example factories', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async path => {
      if (String(path).endsWith('/resources')) return response([{ code: 'WAREHOUSE-API', type: 'warehouse', status: 'enabled', factoryOrgId: 'org-api' }]);
      if (String(path).endsWith('/org-units')) return response([{ id: 'org-api', code: 'FACTORY-API', type: 'factory', status: 'enabled' }]);
      return response({ id: 'server-demand' });
    });
    await createInventoryReplenishmentDemand(context, { id: 'wh-uuid', code: 'WAREHOUSE-API' } as any,
      { id: 'product-uuid', name: '产品', unit: 'PCS', availQty: 1, safetyStock: 10 }, 9, '2026-10-20');
    const command = fetch.mock.calls.find(([path]) => String(path).endsWith('/demands'))!;
    expect(JSON.parse(String(command[1]?.body))).toMatchObject({
      productId: 'product-uuid', inventoryWarehouseId: 'wh-uuid', factoryResourceId: 'FACTORY-API', qty: '9',
    });
  });
});
