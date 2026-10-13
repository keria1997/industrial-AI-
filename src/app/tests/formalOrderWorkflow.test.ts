import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFulfillmentShipmentRequest, type FulfillmentOrder } from '../../api/fulfillment';
import {
  confirmSalesOrderContents,
  mergeFormalSalesOrders,
  mergePersistedSalesOrders,
  upsertSalesOrder,
} from '../../features/sales/model/formalOrderWorkflow';

const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-token' };
const order = {
  id: '01e203f0-3c80-4aa2-a00d-8c37527ef144',
  orderNo: 'SO-20261013-01E203F0',
  fulfillmentWarehouseId: 'WH-FG-01',
  reviewStatus: 'PENDING',
  overallStatus: 'PENDING_CONFIRMATION',
  shipmentStatus: 'NOT_REQUESTED',
  version: 1,
  lines: [{
    id: '28aa7df2-2761-47ff-956d-8f8415557af8',
    version: 1, remainingQty: '10', activeRequestedQty: '0', uom: 'PCS',
  }],
} as FulfillmentOrder;

const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
});

afterEach(() => vi.restoreAllMocks());

describe('formal sales confirmation workflow', () => {
  it('reads the current order and uses each returned version through approval, confirmation and shipment', async () => {
    const approved = { ...order, reviewStatus: 'APPROVED', version: 2 };
    const confirmed = { ...approved, overallStatus: 'CONFIRMED', version: 3, lines: [{ ...order.lines[0], version: 2 }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response(approved))
      .mockResolvedValueOnce(response(confirmed))
      .mockResolvedValueOnce(response({}, 202));
    const updated = vi.fn();
    const result = await confirmSalesOrderContents(context, order.id, '2026-10-21', true, updated);
    expect(updated.mock.calls.map(([value]) => value.version)).toEqual([1, 2, 3]);
    expect(result.overallStatus).toBe('CONFIRMED');
    expect(fetchMock.mock.calls).toHaveLength(3);
    await createFulfillmentShipmentRequest(context, result);
    expect(fetchMock.mock.calls.map(([, options]) => (options?.headers as Record<string, string>)['If-Match']))
      .toEqual([undefined, '"1"', '"2"', '"3"']);
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body)).lines[0].sourceLineRevision).toBe(2);
  });

  it('recovers an already confirmed order without approving or confirming it again', async () => {
    const confirmed = { ...order, overallStatus: 'CONFIRMED', reviewStatus: 'APPROVED', version: 3 };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(confirmed));
    expect(await confirmSalesOrderContents(context, order.id, '2026-10-21', true)).toEqual(confirmed);
    expect(fetchMock.mock.calls).toHaveLength(1);
  });

  it('requires review and never reports confirmation on a permission failure', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(order));
    await expect(confirmSalesOrderContents(context, order.id, '2026-10-21')).rejects.toThrow('尚未完成');
    expect(fetchMock.mock.calls).toHaveLength(1);
    fetchMock.mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response({ error: { code: 'DENIED', message: '制单人不能审批自己的订单' } }, 403));
    const updated = vi.fn();
    await expect(confirmSalesOrderContents(context, order.id, '2026-10-21', true, updated))
      .rejects.toThrow('制单人不能审批');
    expect(updated.mock.calls.map(([value]) => value.version)).toEqual([1]);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/confirm'))).toBe(false);
  });
});

describe('sales order reconciliation', () => {
  const local = { id: 'SO-20261013-3840', status: '待发货' };
  const formal = { id: order.orderNo, aggregateId: order.id, localOrderId: local.id, status: '已确认' };

  it('replaces the local row with one authoritative order', () => {
    expect(upsertSalesOrder([local, formal], formal, local.id)).toEqual([formal]);
  });

  it('preserves promotion identity on backend refresh and excludes the old local row', () => {
    const refreshed = { id: formal.id, aggregateId: formal.aggregateId, status: '已发货' };
    expect(mergeFormalSalesOrders([formal, local], [refreshed]))
      .toEqual([{ ...formal, status: '已发货' }]);
  });

  it('does not let cached pending states overwrite current confirmation or restore the promoted local row', () => {
    expect(mergePersistedSalesOrders([formal], [local, { ...formal, status: '待发货' }])).toEqual([formal]);
  });
});
