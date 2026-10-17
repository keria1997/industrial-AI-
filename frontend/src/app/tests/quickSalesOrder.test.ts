import { afterEach, describe, expect, it, vi } from 'vitest';
import { createQuickSalesOrder } from '../../features/sales/model/quickSalesOrder';
import type { SalesQuoteForConversion } from '../../features/sales/model/salesRules';

const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-token' };
const draft: SalesQuoteForConversion = {
  id: 'SO-DRAFT-1', client: '测试客户', date: '2026-10-13', validUntil: '2026-11-12',
  qty: 5, amount: '¥780.00', discountRate: 80, discountAmount: 20, remark: '快速开单备注',
  recipient: { name: '真实收货人', phone: '13912345678', country: '中国', province: '浙江省', city: '杭州市', address: '测试收货地址' },
  lines: [
    { warehouseId: 'WH-FG-01', productId: 'FG001', productName: '产品一', spec: '规格一', quantity: 2, unitPrice: 200, unit: '件' },
    { warehouseId: 'WH-FG-01', productId: 'FG002', productName: '产品二', quantity: 3, unitPrice: 200, unit: '套' },
  ],
};
const options = {
  warehouses: [{ id: 'warehouse-uuid', code: 'WH-FG-01' }],
  customers: [{ id: 'CUSTOMER-1', name: draft.client, contact: '联系人' }],
  ownerEmployeeId: 'sales01', factoryResourceId: 'FAC-SH-01',
  idempotencyKey: 'quick-sales-order:TENANT-SHWS:SO-DRAFT-1', today: '2026-10-13',
};
const response = (body: unknown, status = 201) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => vi.restoreAllMocks());

describe('quick sales order creation from the quotation form', () => {
  it.each(['台', '件', '个', 'PCS'])('preserves the actual %s unit without an unapproved conversion', async (unit) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ id: 'order-uuid' }));
    await createQuickSalesOrder(context, { ...draft, lines: [{ ...draft.lines![0], unit }] }, options);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).lines[0].uom).toBe(unit);
  });

  it('creates one pending order with every line, selected warehouse, units and discounts', async () => {
    const pending = { id: 'order-uuid', overallStatus: 'PENDING_CONFIRMATION', shipmentStatus: 'NOT_REQUESTED' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(pending));
    expect(await createQuickSalesOrder(context, draft, options)).toEqual(pending);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/v1/sales/sales-orders');
    const input = JSON.parse(String(request?.body));
    expect(input).toMatchObject({
      fulfillmentWarehouseId: 'warehouse-uuid', customerId: 'CUSTOMER-1',
      discountRate: '80', discountAmount: '20', expectedTotalAmount: '780.00',
      requestedDeliveryDate: '2026-10-13',
      orderDate: '2026-10-13', validUntil: '2026-11-12', remark: '快速开单备注',
      lines: [
        { lineNo: 1, productId: 'FG001', productName: '产品一', specification: '规格一', orderedQty: '2', unitPrice: '200', uom: '件' },
        { lineNo: 2, productId: 'FG002', orderedQty: '3', unitPrice: '200', uom: '套' },
      ],
    });
    expect(input.sourceQuoteId).toBeUndefined();
    expect((request?.headers as Record<string, string>)['X-Idempotency-Key']).toBe(options.idempotencyKey);
  });

  it('rejects missing or mixed warehouses rather than silently using the first warehouse', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createQuickSalesOrder(context, draft, { ...options, warehouses: [] }))
      .rejects.toThrow('所选发货仓库不可用');
    await expect(createQuickSalesOrder(context, {
      ...draft, lines: [{ ...draft.lines![0], warehouseId: '' }],
    }, options)).rejects.toThrow('所选发货仓库不可用');
    await expect(createQuickSalesOrder(context, {
      ...draft, lines: [draft.lines![0], { ...draft.lines![1], warehouseId: 'WH-FG-02' }],
    }, options)).rejects.toThrow('同一个发货仓库');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown customers and invalid product quantities before posting', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(createQuickSalesOrder(context, { ...draft, client: '不存在的客户' }, options))
      .rejects.toThrow('请选择客户列表中唯一匹配的客户');
    for (const line of [
      { ...draft.lines![0], quantity: 0 },
      { ...draft.lines![0], quantity: Number.NaN },
      { ...draft.lines![0], productId: '' },
      { ...draft.lines![0], unitPrice: Number.POSITIVE_INFINITY },
    ]) {
      await expect(createQuickSalesOrder(context, { ...draft, lines: [line] }, options))
        .rejects.toThrow('有效数量和单价');
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates a creation failure and reuses the same key on retry', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ error: { code: 'DENIED', message: '无销售开单权限' } }, 403))
      .mockResolvedValueOnce(response({ id: 'order-uuid', overallStatus: 'PENDING_CONFIRMATION' }));
    await expect(createQuickSalesOrder(context, draft, options)).rejects.toThrow('无销售开单权限');
    await createQuickSalesOrder(context, draft, options);
    expect(fetchMock.mock.calls.map(([, request]) =>
      (request?.headers as Record<string, string>)['X-Idempotency-Key']))
      .toEqual([options.idempotencyKey, options.idempotencyKey]);
  });

  it('keeps quotation validity separate from the delivery date confirmed later', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ id: 'order-uuid' }));
    await createQuickSalesOrder(context, { ...draft, date: '2026-10-01' }, options);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).requestedDeliveryDate).toBe(options.today);
  });

  it('rejects missing real recipient and resources without sending placeholder business facts', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(createQuickSalesOrder(context, { ...draft, recipient: undefined }, options)).rejects.toThrow('收货人');
    await expect(createQuickSalesOrder(context, draft, { ...options, ownerEmployeeId: '' })).rejects.toThrow('销售负责人');
    await expect(createQuickSalesOrder(context, draft, { ...options, factoryResourceId: '' })).rejects.toThrow('履约工厂');
    await expect(createQuickSalesOrder(context, draft, { ...options, customers: [...options.customers, ...options.customers] })).rejects.toThrow('唯一匹配');
    expect(fetch).not.toHaveBeenCalled();
  });
});
