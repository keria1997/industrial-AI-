import { afterEach, describe, expect, it, vi } from 'vitest';
import { listCustomerReceipts, listSalesRmas } from '../../api/sales-aftercare';
import { aftercareQuantity, creditNoteAmount, customerReceiptStatus } from '../../features/sales/aftercarePresentation';

const context = { tenantId: 'tenant-read', accessToken: 'read-token' };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => vi.restoreAllMocks());

describe('persisted sales aftercare reads', () => {
  it('uses authorized business API pagination and preserves source fields', async () => {
    const record = { id: 'receipt-db', receiptStatus: 'DISPUTED', signedQty: '0', rejectedQty: null };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ items: [record], total: 21 }));
    expect(await listCustomerReceipts(context, 2, 20)).toEqual({ items: [record], total: 21 });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/fulfillment/customer-receipts?page=2&pageSize=20');
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer read-token', 'X-Tenant-Id': 'tenant-read' } });
  });

  it.each([
    { items: [], total: undefined },
    { items: [{ id: 'a' }], total: 0 },
    { items: [{ id: 'a' }, { id: 'a' }], total: 2 },
    { items: [{ id: null }], total: 1 },
  ])('rejects incomplete collections or ambiguous identities: %j', async value => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(value));
    await expect(listSalesRmas(context)).rejects.toThrow();
  });

  it('does not turn a failed read into an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { message: 'AFTERCARE_UNAVAILABLE' } }, 503));
    await expect(listSalesRmas(context)).rejects.toThrow('AFTERCARE_UNAVAILABLE');
  });

  it('keeps zero distinct from missing quantities and never invents money or currency', () => {
    expect(aftercareQuantity('0')).toBe('0');
    for (const value of [undefined, null, '', 'bad', '-1']) expect(aftercareQuantity(value)).toBe('-');
    expect(creditNoteAmount('-4800.00', undefined)).toBe('-');
    expect(creditNoteAmount('', 'CNY')).toBe('-');
    expect(creditNoteAmount('-4800.00', 'CNY')).toBe('CNY -4800.00');
    expect(creditNoteAmount('0', 'USD')).toBe('USD 0');
  });

  it('recognizes persisted and command receipt states and exposes conflicts', () => {
    expect(customerReceiptStatus('DISPUTED', undefined)).toBe('DISPUTED');
    expect(customerReceiptStatus(undefined, 'SIGNED')).toBe('SIGNED');
    expect(customerReceiptStatus('SIGNED', 'SIGNED')).toBe('SIGNED');
    expect(customerReceiptStatus('DISPUTED', 'SIGNED')).toBe('状态不一致，待核实');
    expect(customerReceiptStatus(null, null)).toBe('-');
  });
});
