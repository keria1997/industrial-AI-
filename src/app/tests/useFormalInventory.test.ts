import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFormalInventory } from '../../features/inventory/model/useFormalInventory';
import { inventoryApi } from '../../api/fulfillment';
import type { AvailabilityFactDto, WarehouseDto } from '../../api/fulfillment';

const hooks = vi.hoisted(() => ({ cursor: 0, values: [] as unknown[], effects: [] as Array<() => unknown> }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useCallback: (callback: unknown) => callback,
  useState: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = initial;
    return [hooks.values[index], (next: unknown) => {
      hooks.values[index] = typeof next === 'function' ? next(hooks.values[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++;
    if (!(index in hooks.values)) hooks.values[index] = { current: initial };
    return hooks.values[index];
  },
  useEffect: (effect: () => unknown) => { hooks.effects.push(effect); },
}));

const context = { tenantId: 'tenant-a', accessToken: 'token-a' };
const warehouse = { id: 'wh-id', code: 'WH-FG-01', name: '成品主仓', updatedAt: '' } as WarehouseDto;
const fact = { warehouseId: 'wh-id', productId: 'FG003', qualifiedOnHandQty: '2',
  allocatedReservedQty: '0', frozenQty: '0', fulfillableQty: '2', safetyStockQty: '0', uom: '台', factVersion: 1 } as AvailabilityFactDto;
const deferred = <T,>() => {
  let resolve: (value: T) => void;
  let reject: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve: resolve!, reject: reject! };
};
const render = (session = context) => {
  hooks.cursor = 0;
  hooks.effects = [];
  return useFormalInventory(session);
};

beforeEach(() => {
  hooks.values = [];
  vi.stubGlobal('localStorage', { getItem: () => null });
  vi.stubGlobal('window', { addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.spyOn(inventoryApi, 'listWarehouses').mockResolvedValue({ items: [warehouse], total: 1 });
  vi.spyOn(inventoryApi, 'listProducts').mockResolvedValue({ items: [], total: 0 });
  vi.spyOn(inventoryApi, 'listMaterials').mockResolvedValue({ items: [], total: 0 });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('formal inventory loading lifecycle', () => {
  it('never shows seed stock while loading or after a failed request and supports retry', async () => {
    const pending = deferred<AvailabilityFactDto[]>();
    vi.spyOn(inventoryApi, 'listAvailability').mockReturnValueOnce(pending.promise).mockResolvedValueOnce([fact]);
    const request = render().refresh();
    expect(render()).toMatchObject({ status: 'loading', stockData: [] });
    pending.reject(new Error('库存暂时不可用'));
    await request;
    expect(render()).toMatchObject({ status: 'error', stockData: [], error: '库存暂时不可用' });
    await render().refresh();
    expect(render()).toMatchObject({ status: 'ready', stockData: [expect.objectContaining({ id: 'FG003', availQty: 2 })] });
  });

  it('ignores late stock responses after a newer refresh', async () => {
    const older = deferred<AvailabilityFactDto[]>();
    vi.spyOn(inventoryApi, 'listAvailability').mockReturnValueOnce(older.promise).mockResolvedValueOnce([{ ...fact, fulfillableQty: '1', factVersion: 2 }]);
    const first = render().refresh();
    await render().refresh();
    older.resolve([fact]);
    await first;
    expect(render().stockData[0]).toMatchObject({ availQty: 1, factVersion: 2 });
  });

  it('hides the previous tenant immediately and ignores its late response', async () => {
    const older = deferred<AvailabilityFactDto[]>();
    vi.spyOn(inventoryApi, 'listAvailability').mockReturnValueOnce(older.promise).mockResolvedValueOnce([]);
    const first = render().refresh();
    const secondContext = { tenantId: 'tenant-b', accessToken: 'token-b' };
    expect(render(secondContext).stockData).toEqual([]);
    await render(secondContext).refresh();
    older.resolve([fact]);
    await first;
    expect(render(secondContext)).toMatchObject({ status: 'ready', stockData: [] });
  });
});
