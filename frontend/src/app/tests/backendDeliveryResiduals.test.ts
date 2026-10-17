import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { inventoryFactInput } from '../../features/ai-hub/import/inventoryFactInput';
import { mrpPurchaseState, mrpShortageRow } from '../../features/production/model/mrpPresentation';
import { SalesShipmentOrderEditModal } from '../../features/sales/components/SalesShipmentOrderEditModal';
import { workbenchProjection } from '../../api/workbenchProjection';
import { apiRequest } from '../../api/client';
import { platformApi } from '../../api/platform/client';
import { persistPlatformChange } from '../../platform/persistPlatformChange';
import { procurementApi } from '../../api/procurement';
import { loadPlatformState } from '../../platform/platformSeed';

const context = { tenantId: 'test-tenant', accessToken: 'test-token' };
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => vi.restoreAllMocks());

describe('inventory import requires explicit source facts', () => {
  const payload = {
    warehouseId: 'wh', productId: 'material', uom: 'KG', sourceSystem: 'CUSTOMER_WMS',
    asOf: '2026-10-17T08:00:00+08:00', factVersion: '1', qualifiedOnHandQty: '10.000001',
    allocatedReservedQty: '0', frozenQty: '0', safetyStockQty: '0', inTransitQty: '0', fulfillableQty: '10.000001',
  };
  it('retains actual zeros, decimals and the declared source without numeric conversion', () => {
    expect(inventoryFactInput(payload, 'event')).toMatchObject({ allocatedReservedQty: '0', qualifiedOnHandQty: '10.000001', sourceSystem: 'CUSTOMER_WMS', factVersion: 1 });
  });
  it.each(['sourceSystem', 'uom', 'asOf', 'factVersion', 'qualifiedOnHandQty', 'allocatedReservedQty', 'frozenQty', 'safetyStockQty', 'inTransitQty', 'fulfillableQty'])('blocks missing %s', field => {
    expect(() => inventoryFactInput({ ...payload, [field]: '' }, 'event')).toThrow('缺少');
  });
  it.each([
    ['fulfillableQty', '1e3'], ['frozenQty', '-1'], ['safetyStockQty', '0.0000001'],
    ['factVersion', '1.5'], ['factVersion', '9007199254740993'],
    ['asOf', '2026-10-17T08:00:00'], ['asOf', '2026-02-31T08:00:00Z'],
  ])('rejects an invalid %s without inventing a replacement', (field, value) => {
    expect(() => inventoryFactInput({ ...payload, [field]: value }, 'event')).toThrow();
  });
});

describe('MRP uses shortages and persisted procurement links', () => {
  const row = mrpShortageRow({ demandId: 'd1', materialId: 'm1', shortageQty: '1.000001', grossRequiredQty: '5', availableQty: '3', uom: 'KG' }, 'task', 'MPS1');
  const request = { id: 'pr1', mrpTaskId: 'task', demandId: 'd1', materialId: 'm1', status: 'REJECTED' } as any;
  it('does not label a shortage as a lot-sized suggestion or a definite purchased part', () => {
    expect(row.netReq).toBe('1.000001');
    expect(row).not.toHaveProperty('plannedQty');
    expect(row).not.toHaveProperty('type');
    expect(row.onWay).toBeNull();
  });
  it('restores exact associations after reload, including rejected requests', () => {
    expect(mrpPurchaseState(row, [request])).toMatchObject({ purchaseStateKnown: true, purchaseRequestId: 'pr1', status: '采购申请：REJECTED' });
    expect(mrpPurchaseState(row, [{ ...request, demandId: 'other' }])).toMatchObject({ purchaseStateKnown: true, purchaseRequestId: undefined });
    expect(mrpPurchaseState(row, null).purchaseStateKnown).toBe(false);
    expect(mrpPurchaseState(row, [request, { ...request, id: 'pr2' }]).purchaseStateKnown).toBe(false);
    expect(mrpPurchaseState(row, [{ id: 'invalid' } as any]).purchaseStateKnown).toBe(false);
  });
  it('refuses a truncated collection instead of declaring that no PR exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ items: [request], total: 2 })).mockResolvedValueOnce(json({ items: [], total: 2 }));
    await expect(procurementApi.listAllRequests(context)).rejects.toThrow('不完整');
  });
});

describe('historical order prices are read-only facts', () => {
  const order = { id: 'SO1', client: '客户', salesman: '', date: '2026-10-17', amount: '¥999.00', productName: '物料', lines: [{ productName: '物料', quantity: '2' }] };
  it('does not back-calculate prices, original totals or discounts from partial facts', () => {
    const html = renderToStaticMarkup(React.createElement(SalesShipmentOrderEditModal, { order, onClose() {}, onSubmit() {} }));
    expect(html).not.toContain('¥0.00');
    expect(html).not.toContain('999.00');
    expect(html).not.toContain('100%');
    expect(html).toContain('单位未提供');
  });
  it('preserves a true zero and large decimal/currency snapshots', () => {
    const html = renderToStaticMarkup(React.createElement(SalesShipmentOrderEditModal, { order: { ...order, currency: 'USD', totalAmount: '9007199254740993.01', originalAmount: '9007199254740993.01', discountRate: '0', discountAmount: '0', lines: [{ quantity: '0', unitPrice: '0', amount: '0' }] }, onClose() {}, onSubmit() {} }));
    expect(html).toContain('9,007,199,254,740,993.01 USD');
    expect(html).toContain('0.00 USD');
    expect(html).toContain('0%');
  });
});

describe('backend delivery contract boundaries', () => {
  it('projects backend list aliases, source failures, low severity and stable event IDs', () => {
    const projected = workbenchProjection({ schemaVersion: '1.1', data: {
      metrics: { orderAmount: { availability: 'AVAILABLE', value: '100' }, confirmedRevenueAmount: { availability: 'UNAVAILABLE', unavailableReason: 'SOURCE_MISSING' } },
      todos: { items: [{ module: '销售管理', title: '待处理', dueDate: '2026-10-17', urgent: true }], total: 1 },
      alerts: { items: [{ module: '库存管理', title: '提示', severity: 'low' }], total: 1 },
      activities: { items: [{ id: 'event1', module: '销售管理', detail: '事件详情' }] },
      sources: [{ source: 'Message', availability: 'AVAILABLE' }, { source: 'RevenueRecognition', availability: 'UNAVAILABLE', unavailableReason: 'SOURCE_MISSING' }, { source: 'SalesOrder' },
        { source: 'ShipmentRecognition', status: 'SOURCE_PENDING', availability: 'AVAILABLE', errorCode: 'SOURCE_MISSING' }],
    } }, { sections: 'todos,alerts,activities' });
    expect(projected.metrics.map(item => item.value)).toEqual(['-', '-']);
    expect(projected.todos[0]).toMatchObject({ dueDate: '2026-10-17', urgent: true });
    expect(projected.alerts[0].severity).toBe('low');
    expect(projected.activities[0]).toMatchObject({ id: 'event1', detail: '事件详情' });
    expect(projected.sourceWarnings).toEqual(['RevenueRecognition：UNAVAILABLE (SOURCE_MISSING)', 'SalesOrder：来源状态未提供']);
  });
  it('sends identical canonical and legacy keys, including legacy client headers', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => json({}));
    await apiRequest('/api/test', context, { method: 'POST', idempotencyKey: 'stable' });
    expect(fetch.mock.calls[0][1]?.headers).toMatchObject({ 'Idempotency-Key': 'stable', 'X-Idempotency-Key': 'stable' });
    await apiRequest('/api/test', context, { method: 'POST', headers: { 'X-Idempotency-Key': 'old-client' } });
    expect(fetch.mock.calls[1][1]?.headers).toMatchObject({ 'Idempotency-Key': 'old-client', 'X-Idempotency-Key': 'old-client' });
    await expect(apiRequest('/api/test', context, { idempotencyKey: 'a', headers: { 'X-Idempotency-Key': 'b' } })).rejects.toThrow('不一致');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('accepts exact server audit totals but refuses the old incomplete page', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ items: [], total: 99, hasMore: true, page: 1, pageSize: 20 }))
      .mockResolvedValueOnce(json({ items: [], total: 0 }));
    expect(await platformApi.listAudits(context, { page: 1 })).toMatchObject({ total: 99, hasMore: true });
    expect(fetch.mock.calls[0][0]).toContain('page=1');
    await expect(platformApi.listAudits(context)).rejects.toThrow('契约');
  });
  it('returns a warning and keeps the formal NOT_CONFIGURED result instead of reporting synchronization success', async () => {
    const before = loadPlatformState();
    before.adapters = [{ id: 'adapter', status: 'pending_sync', version: 4 } as any];
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'adapter', status: 'NOT_CONFIGURED', version: 5 }));
    expect(await persistPlatformChange(context, before, { ...before, adapters: [{ ...before.adapters[0], status: 'synced' }] })).toMatchObject({ type: 'warning', message: '未配置外部同步端点，未完成同步' });
    expect(before.adapters[0].status).toBe('pending_sync');
  });
});
