import { describe, expect, it } from 'vitest';
import {
  formatSalesOutboundDateTime,
} from '../../features/inventory/model/salesOutboundBridge';

describe('sales outbound bridge', () => {
  it('formats ISO task dates for the operations list', () => {
    expect(formatSalesOutboundDateTime('2026-10-13T08:50:55.973Z'))
      .toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    expect(formatSalesOutboundDateTime('')).toBe('-');
  });

});
