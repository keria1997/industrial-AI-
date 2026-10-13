import { describe, expect, it, vi } from 'vitest';
import { loadSalesOutboundTasks, requestSalesOutbound } from '../../features/inventory/model/salesOutboundBridge';
import { restoreShippedSalesOutbounds, syncShippedSalesOutbounds, type ShippedSalesOrder } from '../../features/inventory/model/shippedSalesOutboundSync';
import { salesWorkspaceStorageKey } from '../../features/sales/model/salesShipmentBridge';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
  };
};

const order: ShippedSalesOrder = {
  id: 'SO-20261013-SYNC',
  status: '待发货',
  outStatus: '未发货',
  client: 'Sync customer',
  product: 'FG001 Controller; FG002 Sensor',
  amount: 'CNY 80.00',
  warehouseId: 'WH-FG-01',
  lines: [
    { productId: 'FG001', productName: 'Controller', qty: 5, unit: 'PCS' },
    { productId: 'FG002', productName: 'Sensor', quantity: 3, unit: 'PCS' },
  ],
};
const shipped = { ...order, status: '已发货', outStatus: '全部发货', shippedAt: '2026-10-13T10:00:00Z' };

describe('shipped sales order to outbound synchronization', () => {
  it('creates a completed outbound when a pending order becomes shipped', () => {
    const storage = memoryStorage();
    expect(syncShippedSalesOutbounds(storage, 'A', [order])).toEqual([]);
    const [outbound] = syncShippedSalesOutbounds(storage, 'A', [shipped]);
    expect(outbound).toMatchObject({
      source: order.id, customer: order.client, amount: order.amount,
      qty: 8, shippedQty: 8, warehouse: 'WH-FG-01',
      status: '已出库', shortageQty: 0, shippedAt: shipped.shippedAt,
      lines: [{ productId: 'FG001', qty: 5, shippedQty: 5 }, { productId: 'FG002', qty: 3, shippedQty: 3 }],
    });
    expect(loadSalesOutboundTasks(storage, 'A')).toEqual([outbound]);
  });

  it('reuses the existing task and preserves its ID', () => {
    const storage = memoryStorage();
    const task = requestSalesOutbound(storage, 'A', {
      orderId: order.id, item: 'FG001', qty: 8, availableQty: 0,
    });
    const [outbound] = syncShippedSalesOutbounds(storage, 'A', [shipped]);
    expect(outbound).toMatchObject({ id: task.id, status: '已出库', qty: 8, shortageQty: 0 });
    expect(loadSalesOutboundTasks(storage, 'A')).toHaveLength(1);
  });

  it('keeps the original outbound number and does not write again on refresh or receipt', () => {
    const storage = memoryStorage();
    const [outbound] = syncShippedSalesOutbounds(storage, 'A', [{ ...shipped, outboundNo: 'OUT-EXISTING' }]);
    storage.setItem.mockClear();
    expect(syncShippedSalesOutbounds(storage, 'A', [shipped])).toEqual([outbound]);
    expect(syncShippedSalesOutbounds(storage, 'A', [{ ...shipped, status: '已完成' }])).toEqual([outbound]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('restores historical shipped orders on direct inventory entry and isolates tenants', () => {
    const storage = memoryStorage();
    storage.setItem(salesWorkspaceStorageKey('A'), JSON.stringify({ schemaVersion: 8, orders: [shipped] }));
    expect(restoreShippedSalesOutbounds(storage, 'A')).toHaveLength(1);
    expect(restoreShippedSalesOutbounds(storage, 'A')).toHaveLength(1);
    expect(restoreShippedSalesOutbounds(storage, 'B')).toEqual([]);
  });

  it('does not synthesize formal outbounds or change unshipped and canceled orders', () => {
    const storage = memoryStorage();
    const ignored = [
      order, { ...order, status: '已确认' }, { ...order, status: '部分发货' },
      { ...order, status: '生产中' }, { ...order, status: '已取消' },
      { ...order, status: '已完成' },
      { ...shipped, aggregateId: 'server-order-id' },
      { ...shipped, formalOrder: { id: 'server-order-id' } },
    ];
    expect(syncShippedSalesOutbounds(storage, 'A', ignored)).toEqual([]);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('supports single-line historical orders and sums decimal lines exactly', () => {
    const storage = memoryStorage();
    const [single] = syncShippedSalesOutbounds(storage, 'A', [{
      ...shipped, lines: [], qty: 2, productId: 'FG001', productName: 'Controller',
    }]);
    expect(single).toMatchObject({ qty: 2, shippedQty: 2, productId: 'FG001' });
    const [decimal] = syncShippedSalesOutbounds(storage, 'B', [{
      ...shipped, lines: [{ qty: '0.1' }, { quantity: '0.2' }],
    }]);
    expect(decimal.qty).toBe(0.3);
  });

  it('preserves existing tasks when sales history is malformed and ignores invalid quantities', () => {
    const storage = memoryStorage();
    const task = requestSalesOutbound(storage, 'A', { orderId: 'SO-OTHER', item: 'FG001', qty: 1 });
    storage.setItem(salesWorkspaceStorageKey('A'), '{invalid');
    expect(restoreShippedSalesOutbounds(storage, 'A')).toEqual([task]);
    expect(syncShippedSalesOutbounds(storage, 'A', [
      { ...shipped, lines: [{ qty: -1 }] },
      { ...shipped, lines: [{ qty: 'abc' }] },
      { ...shipped, lines: [], qty: 0 },
    ])).toEqual([task]);
  });

  it('keeps inventory readable if recovery cannot persist to browser storage', () => {
    const storage = memoryStorage();
    const task = requestSalesOutbound(storage, 'A', { orderId: 'SO-OTHER', item: 'FG001', qty: 1 });
    storage.setItem(salesWorkspaceStorageKey('A'), JSON.stringify({ orders: [shipped] }));
    storage.setItem.mockImplementation(() => { throw new Error('Storage quota exceeded'); });
    expect(restoreShippedSalesOutbounds(storage, 'A')).toEqual([task]);
  });
});
