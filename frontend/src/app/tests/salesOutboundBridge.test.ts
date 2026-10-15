import { describe, expect, it } from 'vitest';
import {
  formatSalesOutboundDateTime,
  loadSalesOutboundTasks,
  removeSalesOutboundBySource,
  requestSalesOutbound,
} from '../../features/inventory/model/salesOutboundBridge';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('sales outbound bridge', () => {
  it('formats ISO task dates for the operations list', () => {
    expect(formatSalesOutboundDateTime('2026-10-13T08:50:55.973Z'))
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatSalesOutboundDateTime('')).toBe('-');
  });

  it('removes a local outbound task after it is promoted to formal fulfillment', () => {
    const storage = new MemoryStorage();
    const task = requestSalesOutbound(storage, 'TENANT-A', {
      orderId: 'SO-TEST-001',
      item: 'FG003 智能视觉检测终端',
      qty: 1,
      productId: 'FG003',
      availableQty: 120,
    }, new Date('2026-10-13T08:50:55.973Z'));

    expect(loadSalesOutboundTasks(storage, 'TENANT-A')).toHaveLength(1);
    expect(removeSalesOutboundBySource(storage, 'TENANT-A', task.source)).toBe(true);
    expect(loadSalesOutboundTasks(storage, 'TENANT-A')).toHaveLength(0);
  });
});
