import { describe, expect, it } from 'vitest';
import { classifyOutboundShipment } from '../../features/inventory/model/outboundShipmentAction';

const line = (overrides: Record<string, unknown> = {}) => ({
  productId: 'FG001',
  requestedQty: 10,
  postedQty: 0,
  remainingQty: 10,
  availQty: 10,
  factVersion: 1,
  warehouseId: 'WH-01',
  allowPartialShipment: true,
  ...overrides,
});

describe('classifyOutboundShipment', () => {
  it('blocks a warehouse that has no stock fact for any task product', () => {
    const decision = classifyOutboundShipment([line({ availQty: 0, factVersion: undefined, warehouseId: undefined })]);
    expect(decision.action).toBe('missing-product');
    expect(decision.missingProductIds).toEqual(['FG001']);
  });

  it('uses production-only when the product exists but has no availability', () => {
    const decision = classifyOutboundShipment([line({ availQty: 0 })]);
    expect(decision.action).toBe('production-only');
    expect(decision.shortageLines).toHaveLength(1);
  });

  it('offers partial shipment and production when only part is available', () => {
    const decision = classifyOutboundShipment([line({ availQty: 4 })]);
    expect(decision.action).toBe('partial-shipment');
    expect(decision.allowPartial).toBe(true);
  });

  it('offers shipment when every remaining quantity is available', () => {
    expect(classifyOutboundShipment([line(), line({ productId: 'FG002', requestedQty: 2, remainingQty: 2, availQty: 2 })]).action).toBe('ship');
  });

  it('does not split a shipment when partial fulfillment is disabled', () => {
    const decision = classifyOutboundShipment([line({ availQty: 4 })], { allowPartialShipment: false });
    expect(decision.action).toBe('production-only');
    expect(decision.allowPartial).toBe(false);
  });
});
