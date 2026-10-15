import { describe, expect, it } from 'vitest';
import {
  createPendingSalesOrderFromQuote,
  createSalesTabUrl,
  getQuoteStatus,
  getSalesOrderActions,
  isSalesOrderEditable,
  isQuoteConvertible,
  resolveSalesTab,
  validateShipmentDeliveryDate,
} from '../../features/sales/model/salesRules';

describe('sales navigation', () => {
  it('restores supported sales tabs and rejects unknown tabs', () => {
    expect(resolveSalesTab('?module=sales&tab=quotes')).toBe('quotes');
    expect(resolveSalesTab('?module=sales&tab=basic-data')).toBe('basic-data');
    expect(resolveSalesTab('?module=sales&tab=unknown')).toBe('dashboard');
  });

  it('creates refresh-safe sales URLs and clears other module state', () => {
    expect(createSalesTabUrl({ pathname: '/', search: '?module=inventory&inventory=outbound', hash: '' }, 'orders'))
      .toBe('/?module=sales&tab=orders');
    expect(createSalesTabUrl({ pathname: '/', search: '?module=sales&tab=orders', hash: '#top' }, 'dashboard'))
      .toBe('/?module=sales#top');
    expect(createSalesTabUrl({ pathname: '/', search: '?module=sales&tab=orders&focusOrder=SO-1', hash: '' }, 'quotes'))
      .toBe('/?module=sales&tab=quotes');
  });
});

describe('sales status rules', () => {
  it('derives quote expiry from the end of the validity date', () => {
    const now = new Date('2026-07-26T10:00:00');
    expect(getQuoteStatus('2026-07-26', now)).toBe('正常');
    expect(getQuoteStatus('2026-07-25', now)).toBe('已过期');
    expect(getQuoteStatus('invalid', now)).toBe('已过期');
    expect(getQuoteStatus('2026-07-25', now, 'SO-001')).toBe('已转订单');
  });

  it('approves a valid quote into a pending unshipped sales order once', () => {
    const quote = {
      id: 'QT-001',
      client: '示例客户',
      productName: 'FG001 工业控制器',
      spec: '标准型',
      unit: '件',
      qty: 2,
      unitPrice: 500,
      discountRate: 100,
      discountAmount: 0,
      amount: '¥1,000.00',
      validUntil: '2026-08-15',
      version: 3,
    };

    expect(isQuoteConvertible(quote, new Date('2026-07-26T10:00:00'))).toBe(true);
    expect(createPendingSalesOrderFromQuote(quote, {
      orderId: 'SO-001',
      salesman: '客户经理',
      approvedAt: '2026-07-26T10:00:00.000Z',
    })).toMatchObject({
      id: 'SO-001',
      sourceQuoteId: 'QT-001',
      sourceQuoteVersion: 3,
      quoteApprovalStatus: '已审批',
      confirmationStatus: '待发货',
      status: '待发货',
      outStatus: '未发货',
      receivable: '待生成',
    });
    expect(isQuoteConvertible({ ...quote, convertedOrderId: 'SO-001' }, new Date('2026-07-26T10:00:00'))).toBe(false);
  });

  it('copies the latest complete quote snapshot into the sales order', () => {
    const latestQuote = {
      id: 'QT-002',
      client: '更新后的客户',
      date: '2026-07-27',
      validUntil: '2026-08-27',
      productName: '旧摘要产品',
      qty: 1,
      unitPrice: 1,
      lines: [
        {
          warehouseId: 'WH-01',
          productId: 'FG-NEW-01',
          productName: '工业控制器 Pro',
          spec: '增强型',
          unit: '台',
          available: 18,
          quantity: 3,
          unitPrice: 1680,
        },
        {
          warehouseId: 'WH-02',
          productId: 'FG-NEW-02',
          productName: '边缘计算网关',
          spec: '8G/128G',
          unit: '套',
          available: 6,
          quantity: 2,
          unitPrice: 2350,
        },
      ],
      discountRate: 95,
      discountAmount: 120,
      amount: '¥9,133.00',
      remark: '使用最后一次保存的报价条款',
      version: 4,
    };

    const order = createPendingSalesOrderFromQuote(latestQuote, {
      orderId: 'SO-002',
      salesman: '客户经理',
      approvedAt: '2026-07-28T09:00:00.000Z',
    });

    expect(order).toMatchObject({
      sourceQuoteId: 'QT-002',
      sourceQuoteVersion: 4,
      sourceQuoteDate: '2026-07-27',
      sourceQuoteValidUntil: '2026-08-27',
      client: '更新后的客户',
      date: '2026-07-27',
      productId: 'FG-NEW-01',
      productName: '工业控制器 Pro',
      qty: 5,
      unitPrice: 1680,
      discountRate: 95,
      discountAmount: 120,
      amount: '¥9,133.00',
      remark: '使用最后一次保存的报价条款',
      lines: latestQuote.lines,
      quoteSnapshot: {
        id: 'QT-002',
        version: 4,
        client: '更新后的客户',
        date: '2026-07-27',
        validUntil: '2026-08-27',
        lines: latestQuote.lines,
        discountRate: 95,
        discountAmount: 120,
        amount: '¥9,133.00',
        remark: '使用最后一次保存的报价条款',
      },
    });
    expect(order.product).toBe('工业控制器 Pro 等 2 项产品');
    expect(order.lines).not.toBe(latestQuote.lines);
    expect(order.quoteSnapshot.lines).not.toBe(order.lines);
  });

  it('rejects conversion after the quote expires', () => {
    expect(() => createPendingSalesOrderFromQuote({
      id: 'QT-EXPIRED',
      client: '示例客户',
      productName: 'FG001 工业控制器',
      qty: 1,
      amount: '¥500.00',
      validUntil: '2026-07-25',
    }, {
      orderId: 'SO-EXPIRED',
      salesman: '客户经理',
      approvedAt: '2026-07-26T10:00:00.000Z',
    })).toThrow('只有正常、未过期且未转单的报价可以审批确认');
  });

  it('exposes order actions by lifecycle status', () => {
    expect(getSalesOrderActions('待发货', '未发货', 'PENDING', true)).toEqual(['review', 'duplicate', 'cancel']);
    expect(getSalesOrderActions('待发货', '未发货', 'APPROVED', true)).toEqual(['confirm', 'duplicate', 'cancel']);
    expect(getSalesOrderActions('待发货', '未发货', 'NOT_REQUIRED', true)).toEqual(['confirm', 'duplicate', 'cancel']);
    expect(getSalesOrderActions('待发货', '已移交仓库', 'APPROVED', true)).toEqual(['outbound', 'duplicate']);
    expect(getSalesOrderActions('待发货', '未发货')).toEqual(['edit', 'confirm', 'duplicate', 'cancel']);
    expect(getSalesOrderActions('已确认')).toEqual(['outbound']);
    expect(getSalesOrderActions('已确认', '库存不足')).toEqual(['outbound', 'rollback', 'cancel']);
    expect(getSalesOrderActions('已确认', '未发货')).toEqual(['outbound', 'rollback', 'cancel']);
    expect(getSalesOrderActions('已确认', '已移交仓库')).toEqual(['outbound']);
    expect(getSalesOrderActions('部分发货')).toEqual(['outbound']);
    expect(getSalesOrderActions('生产中')).toEqual(['expedite']);
    expect(getSalesOrderActions('已发货')).toEqual(['complete']);
    expect(getSalesOrderActions('已完成')).toEqual([]);
    expect(getSalesOrderActions('已取消')).toEqual([]);
  });

  it('allows editing only while an order is pending and unshipped', () => {
    expect(isSalesOrderEditable('待发货', '未发货')).toBe(true);
    expect(isSalesOrderEditable('待发货', '部分发货')).toBe(false);
    expect(isSalesOrderEditable('已确认', '未发货')).toBe(false);
    expect(isSalesOrderEditable('已发货', '全部发货')).toBe(false);
  });

  it('requires a valid shipment delivery date not earlier than the order date', () => {
    expect(validateShipmentDeliveryDate('2026-07-26', '')).toBe('请选择交期');
    expect(validateShipmentDeliveryDate('2026-07-26', '2026-07-25')).toBe('交期不能早于订单日期');
    expect(validateShipmentDeliveryDate('2026-07-26', '2026-08-02')).toBe('');
  });
});
