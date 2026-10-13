import { describe, expect, it } from 'vitest';
import { mapFormalShipmentStatus } from '../../features/inventory/model/formalShipmentStatus';
import type { FulfillmentShipmentTask } from '../../api/fulfillment';

const buildTask = (overrides: Partial<FulfillmentShipmentTask> = {}): FulfillmentShipmentTask => ({
  id: 'TASK-1',
  shipmentRequestId: 'REQUEST-1',
  salesOrderId: 'SO-1',
  requestNo: 'REQ-001',
  warehouseId: 'WH-1',
  salesOrderNo: 'SO-20260101-001',
  orderRevision: 1,
  allowPartialShipment: true,
  workflowStatus: 'ACTIVE',
  availabilityStatus: 'SHORTAGE',
  replenishmentStatus: 'REQUIRED',
  postingStatus: 'NOT_STARTED',
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  lines: [{
    id: 'LINE-1',
    orderLineId: 'ORDER-LINE-1',
    productId: 'FG001',
    requestedQty: '10',
    reservedQty: '0',
    postedQty: '0',
    shortageQty: '10',
    uom: 'PCS',
  }],
  ...overrides,
});

describe('formal shipment status', () => {
  it('keeps a shortage task in the shortage state', () => {
    expect(mapFormalShipmentStatus(buildTask())).toBe('库存不足');
  });

  it('keeps a task replenishing after a production request is created', () => {
    expect(mapFormalShipmentStatus(buildTask({
      availabilityStatus: 'SHORTAGE',
      replenishmentStatus: 'IN_PROGRESS',
    }))).toBe('生产补货中');
  });

  it('shows partial shipment and replenishment together', () => {
    expect(mapFormalShipmentStatus(buildTask({
      availabilityStatus: 'PARTIALLY_RESERVED',
      replenishmentStatus: 'IN_PROGRESS',
      postingStatus: 'PARTIALLY_POSTED',
      lines: [buildTask().lines[0], {
        ...buildTask().lines[0],
        id: 'LINE-2',
        orderLineId: 'ORDER-LINE-2',
        productId: 'FG002',
        requestedQty: '5',
        reservedQty: '5',
        postedQty: '5',
        shortageQty: '0',
      }],
    }))).toBe('部分发货 · 生产补货中');
  });

  it('keeps a partially shipped task actionable when stock is still short', () => {
    expect(mapFormalShipmentStatus(buildTask({
      availabilityStatus: 'PARTIALLY_RESERVED',
      replenishmentStatus: 'REQUIRED',
      postingStatus: 'PARTIALLY_POSTED',
      lines: [{ ...buildTask().lines[0], reservedQty: '3', postedQty: '3', shortageQty: '7' }],
    }))).toBe('部分发货 · 库存不足');
  });

  it('requires inventory recheck after production completion inbound', () => {
    expect(mapFormalShipmentStatus(buildTask({
      availabilityStatus: 'RECHECKING',
      replenishmentStatus: 'AVAILABLE',
      postingStatus: 'PARTIALLY_POSTED',
    }))).toBe('待重新校验库存');
  });

  it('completes only after every line is fully posted', () => {
    expect(mapFormalShipmentStatus(buildTask({
      workflowStatus: 'COMPLETED',
      availabilityStatus: 'RESERVED',
      replenishmentStatus: 'NOT_REQUIRED',
      postingStatus: 'POSTED',
      lines: [{ ...buildTask().lines[0], postedQty: '10', shortageQty: '0' }],
    }))).toBe('已出库');
  });
});
