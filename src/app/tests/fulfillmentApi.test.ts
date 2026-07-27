import { beforeEach, describe, expect, it, vi } from 'vitest';
import { approveFulfillmentOrder, buildOutboundPostLines, checkAndReserveShipmentTask, confirmFulfillmentOrder, createFulfillmentShipmentRequest, postFulfillmentOutbound } from '../../api/fulfillment';

describe('fulfillment API client', () => {
  const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-token' };
  beforeEach(() => vi.restoreAllMocks());

  it('uses aggregate versions and server-side business actions', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'd63d7227-152c-4b61-8a67-1969e596bf51', version: 2 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const order = { id: 'd63d7227-152c-4b61-8a67-1969e596bf51', version: 1, fulfillmentWarehouseId: 'WH-FG-01', lines: [] } as any;
    await approveFulfillmentOrder(context, order);
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: 'Bearer signed-token', 'X-Tenant-Id': 'TENANT-SHWS', 'If-Match': '"1"' });
    expect(JSON.parse(String(request.body))).toEqual({ decision: 'APPROVE' });
  });

  it('hands the remaining order quantities to inventory and calls atomic reservation', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    const order = { id: 'd63d7227-152c-4b61-8a67-1969e596bf51', version: 3, fulfillmentWarehouseId: 'WH-FG-01', lines: [{ id: '28aa7df2-2761-47ff-956d-8f8415557af8', version: 1, remainingQty: '10', activeRequestedQty: '2', uom: 'PCS' }] } as any;
    await createFulfillmentShipmentRequest(context, order);
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).lines[0].requestedQty).toBe('8');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ task: { id: '7c5e98e6-fde0-4938-9aaa-19de11cd8611' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await checkAndReserveShipmentTask(context, { id: '7c5e98e6-fde0-4938-9aaa-19de11cd8611', version: 4 } as any);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/inventory/shipment-tasks/7c5e98e6-fde0-4938-9aaa-19de11cd8611/check-and-reserve');
  });

  it('confirms shipment contents before creating a warehouse task', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'd63d7227-152c-4b61-8a67-1969e596bf51', overallStatus: 'CONFIRMED', version: 4 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const order = { id: 'd63d7227-152c-4b61-8a67-1969e596bf51', version: 3 } as any;
    await confirmFulfillmentOrder(context, order, '2026-08-10');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/sales/sales-orders/d63d7227-152c-4b61-8a67-1969e596bf51/confirm');
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({ 'If-Match': '"3"' });
    expect(JSON.parse(String(request.body))).toEqual({ requestedDeliveryDate: '2026-08-10' });
  });

  it('posts the operator-selected partial quantity and rejects over-posting', async () => {
    const outbound = {
      id: '5b50de9f-f34f-4e47-bc5f-d219a0b458fb',
      version: 2,
      lines: [{ id: '3d9b7405-4c75-4f43-8786-c8bfedc21e91', orderLineId: '5a3d9048-7846-4a95-973e-57220d98a8ae', productId: 'FG001', reservedQty: '10', postedQty: '2', uom: 'PCS' }],
    };
    expect(buildOutboundPostLines(outbound, { [outbound.lines[0].orderLineId]: '3' })).toEqual([
      { outboundLineId: outbound.lines[0].id, qty: '3', uom: 'PCS' },
    ]);
    expect(() => buildOutboundPostLines(outbound, { [outbound.lines[0].orderLineId]: '9' })).toThrow('不超过 8');

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ outcome: 'SUCCEEDED', outbound: { status: 'PARTIALLY_POSTED' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await postFulfillmentOutbound(context, outbound, { [outbound.lines[0].orderLineId]: '3' });
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).lines).toEqual([
      { outboundLineId: outbound.lines[0].id, qty: '3', uom: 'PCS' },
    ]);
  });
});
