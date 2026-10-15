import { describe, expect, it } from 'vitest';
import {
  cancelSalesOutbound,
  completeSalesOutbound,
  loadSalesOutboundTasks,
  requestSalesOutbound,
  type StoragePort,
} from '../../features/inventory/model/salesOutboundBridge';
import { getSalesOrderActions } from '../../features/sales/model/salesRules';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('sales order cancellation -> outbound linkage', () => {
  it('marks a pending outbound task as cancelled when the source order is cancelled', () => {
    const storage = new MemoryStorage();
    const task = requestSalesOutbound(storage, 'TENANT-A', {
      orderId: 'SO-20260727-001',
      customer: '测试客户',
      item: 'FG001 工业控制器',
      qty: 5,
      unit: '件',
      availableQty: 5,
    });
    expect(task.status).toBe('待发货');

    const cancelled = cancelSalesOutbound(storage, 'TENANT-A', 'SO-20260727-001');
    expect(cancelled).toMatchObject({
      id: task.id,
      source: 'SO-20260727-001',
      status: '已取消',
    });

    const tasks = loadSalesOutboundTasks(storage, 'TENANT-A');
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('已取消');
  });

  it('marks a stock-shortage outbound task as cancelled', () => {
    const storage = new MemoryStorage();
    const task = requestSalesOutbound(storage, 'TENANT-A', {
      orderId: 'SO-20260727-002',
      customer: '测试客户',
      item: 'FG001 工业控制器',
      qty: 10,
      unit: '件',
      availableQty: 3,
    });
    expect(task.status).toBe('库存不足');

    const cancelled = cancelSalesOutbound(storage, 'TENANT-A', 'SO-20260727-002');
    expect(cancelled?.status).toBe('已取消');
  });

  it('does not touch already-shipped outbound tasks', () => {
    const storage = new MemoryStorage();
    const task = requestSalesOutbound(storage, 'TENANT-A', {
      orderId: 'SO-20260727-003',
      customer: '测试客户',
      item: 'FG001 工业控制器',
      qty: 2,
      unit: '件',
      availableQty: 2,
    });
    completeSalesOutbound(storage, 'TENANT-A', task.id, new Date('2026-07-27T10:00:00.000Z'));

    expect(cancelSalesOutbound(storage, 'TENANT-A', 'SO-20260727-003')).toBeNull();
    const tasks = loadSalesOutboundTasks(storage, 'TENANT-A');
    expect(tasks[0].status).toBe('已出库');
  });

  it('returns null when no matching outbound task exists', () => {
    const storage = new MemoryStorage();
    expect(cancelSalesOutbound(storage, 'TENANT-A', 'SO-NONEXISTENT')).toBeNull();
  });

  it('does not cancel an already-cancelled task twice', () => {
    const storage = new MemoryStorage();
    requestSalesOutbound(storage, 'TENANT-A', {
      orderId: 'SO-20260727-004',
      customer: '测试客户',
      item: 'FG001',
      qty: 1,
      unit: '件',
      availableQty: 1,
    });
    const first = cancelSalesOutbound(storage, 'TENANT-A', 'SO-20260727-004');
    expect(first?.status).toBe('已取消');
    const second = cancelSalesOutbound(storage, 'TENANT-A', 'SO-20260727-004');
    expect(second).toBeNull();
  });
});

describe('sales order actions: confirmed + cancellable outbound states', () => {
  it('allows cancelling confirmed orders when stock is insufficient', () => {
    expect(getSalesOrderActions('已确认', '库存不足')).toEqual(['outbound', 'rollback', 'cancel']);
  });

  it('allows cancelling confirmed orders when not yet shipped', () => {
    expect(getSalesOrderActions('已确认', '未发货')).toEqual(['outbound', 'rollback', 'cancel']);
  });

  it('forbids cancelling confirmed orders already handed to warehouse', () => {
    expect(getSalesOrderActions('已确认', '已移交仓库')).toEqual(['outbound']);
  });

  it('forbids cancelling when no outbound status is provided', () => {
    expect(getSalesOrderActions('已确认')).toEqual(['outbound']);
  });

  it('keeps cancel unavailable for terminal statuses', () => {
    expect(getSalesOrderActions('已完成')).toEqual([]);
    expect(getSalesOrderActions('已取消')).toEqual([]);
    expect(getSalesOrderActions('已发货')).toEqual(['complete']);
  });

  it('keeps cancel available for pending orders', () => {
    expect(getSalesOrderActions('待发货', '未发货')).toContain('cancel');
  });
});
