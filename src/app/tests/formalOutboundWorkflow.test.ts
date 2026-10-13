import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOutboundPostLines, createFulfillmentShipmentRequest, postFulfillmentOutbound, type FulfillmentOrder, type FulfillmentShipmentTask } from '../../api/fulfillment';
import { postFormalOutbound, prepareFormalOutbound } from '../../features/inventory/model/formalOutboundWorkflow';
import { requestSalesShipment } from '../../features/sales/model/formalOrderWorkflow';
import { formalShipmentStock } from '../../features/inventory/model/formalShipmentStock';
import type { AvailabilityFactDto } from '../../api/fulfillment';

const context = { tenantId: 'TENANT-SHWS', accessToken: 'test-token' };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const task = {
  id: 'task-1', shipmentRequestId: 'request-1', salesOrderId: 'order-1', orderRevision: 3,
  warehouseId: 'WH-1', availabilityStatus: 'UNCHECKED', version: 1,
} as FulfillmentShipmentTask;
const outbound = {
  id: 'outbound-new', version: 1,
  lines: [
    { id: 'out-line-1', orderLineId: 'order-line-1', productId: 'FG-1', reservedQty: '0.3', postedQty: '0.1', uom: 'PCS' },
    { id: 'out-line-2', orderLineId: 'order-line-2', productId: 'FG-2', reservedQty: '2', postedQty: '2', uom: 'PCS' },
  ],
};
const order = {
  id: 'order-1', version: 3, fulfillmentWarehouseId: 'WH-1',
  reviewStatus: 'APPROVED', overallStatus: 'CONFIRMED', shipmentStatus: 'REQUESTED',
  lines: [{ id: 'order-line-1', version: 2, remainingQty: '0.3', activeRequestedQty: '0.1', uom: 'PCS', lineStatus: 'OPEN' }],
} as FulfillmentOrder;

afterEach(() => vi.restoreAllMocks());

describe('formal outbound workflow', () => {
  it('uses the first reservation response to post the newly created outbound', async () => {
    const reserved = { ...task, version: 2, availabilityStatus: 'RESERVED', outboundId: outbound.id };
    const posted = { outcome: 'SUCCEEDED', adapterKind: 'REFERENCE', outbound, task: reserved, order };
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ outcome: 'SUCCEEDED', task: reserved, outbound }))
      .mockResolvedValueOnce(response(posted));
    const prepared = await prepareFormalOutbound(context, task, 'WH-1');
    expect(prepared.outbound.id).toBe('outbound-new');
    expect(await postFormalOutbound(context, prepared.outbound, { 'order-line-1': '0.2' })).toEqual(posted);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/inventory/outbounds/outbound-new/post');
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).lines)
      .toEqual([{ outboundLineId: 'out-line-1', qty: '0.2', uom: 'PCS' }]);
  });

  it('does not report shipment success for an unknown result or missing sales projection', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({ outcome: 'PROCESSING_UNKNOWN', outbound }, 202));
    await expect(postFormalOutbound(context, outbound, { 'order-line-1': '0.2' })).rejects.toThrow('尚未确认');
  });

  it('retries an interrupted post with the original key, timestamp and exact quantities', async () => {
    const retryOutbound = { ...outbound, id: 'outbound-retry' };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('network interrupted'))
      .mockResolvedValueOnce(response({ outcome: 'SUCCEEDED', outbound: retryOutbound, task, order }));
    await expect(postFulfillmentOutbound(context, retryOutbound)).rejects.toThrow('network interrupted');
    await postFulfillmentOutbound(context, retryOutbound);
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(fetchMock.mock.calls[1][1]?.headers);
    expect(fetchMock.mock.calls[0][1]?.body).toEqual(fetchMock.mock.calls[1][1]?.body);
  });

  it('keeps decimal quantities exact and skips fully consumed outbound lines', () => {
    expect(buildOutboundPostLines(outbound)).toEqual([{ outboundLineId: 'out-line-1', qty: '0.2', uom: 'PCS' }]);
    expect(buildOutboundPostLines({ ...outbound, lines: [{ ...outbound.lines[0], reservedQty: '999999999999.999999', postedQty: '999999999999.999998' }] }))
      .toEqual([{ outboundLineId: 'out-line-1', qty: '0.000001', uom: 'PCS' }]);
    expect(() => buildOutboundPostLines(outbound, { 'order-line-1': '0.200001' })).toThrow('不超过 0.2');
    expect(() => buildOutboundPostLines(outbound, { 'order-line-1': '0' })).toThrow('至少选择');
  });

  it('combines owned reservations and new stock while allocating shared products only once', () => {
    const stockTask = {
      ...task, lines: [
        { id: 'a', orderLineId: 'a', productId: 'FG-1', requestedQty: '5', postedQty: '2', reservedQty: '3', uom: 'PCS' },
        { id: 'b', orderLineId: 'b', productId: 'FG-1', requestedQty: '2', postedQty: '0', reservedQty: '0', uom: 'PCS' },
      ],
    } as FulfillmentShipmentTask;
    const facts = [{ productId: 'FG-1', warehouseId: 'WH-1', fulfillableQty: '2', uom: 'PCS', factVersion: 4 }] as AvailabilityFactDto[];
    const lines = formalShipmentStock(stockTask, facts);
    expect(lines.map(line => line.availQty)).toEqual([3, 0]);
    expect(lines.map(line => line.shortage)).toEqual([0, 2]);
    expect(formalShipmentStock(stockTask, [])[0].availQty).toBe(1);
  });

  it('recovers an active warehouse request without submitting another empty request', async () => {
    const occupied = { ...order, lines: [{ ...order.lines[0], activeRequestedQty: '0.3' }] };
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(occupied));
    expect(await requestSalesShipment(context, order.id)).toEqual(occupied);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('uses the latest order version and subtracts occupied quantities without floating point loss', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(order))
      .mockResolvedValueOnce(response({}, 202))
      .mockResolvedValueOnce(response({ ...order, version: 4 }));
    await requestSalesShipment(context, order.id);
    const request = fetchMock.mock.calls[1][1];
    expect(request?.headers).toMatchObject({ 'If-Match': '"3"', 'X-Idempotency-Key': 'shipment:order-1:3' });
    expect(JSON.parse(String(request?.body)).lines[0].requestedQty).toBe('0.2');
    fetchMock.mockResolvedValue(response({}, 202));
    await createFulfillmentShipmentRequest(context, order);
    expect(fetchMock.mock.calls[3][1]?.headers).toMatchObject({ 'X-Idempotency-Key': 'shipment:order-1:3' });
  });
});
