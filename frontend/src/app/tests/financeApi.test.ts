import { afterEach, describe, expect, it, vi } from 'vitest';
import { listPayables, listReceivables, settleReceivable } from '../../api/finance';

describe('finance API client', () => {
  const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-session-token' };

  afterEach(() => vi.restoreAllMocks());

  it('filters AR and AP by the exact source order number', async () => {
    const jsonResponse = () => new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse())
      .mockResolvedValueOnce(jsonResponse());

    await listReceivables(context, {
      page: 1,
      pageSize: 200,
      sourceOrder: 'SO-20261010-001',
    });
    await listPayables(context, {
      page: 1,
      pageSize: 200,
      sourceOrder: 'PO-20261010-001',
    });

    const [receivablePath] = fetchMock.mock.calls[0] as [string];
    const [payablePath] = fetchMock.mock.calls[1] as [string];
    expect(new URL(receivablePath, 'http://localhost').searchParams.get('sourceOrder')).toBe('SO-20261010-001');
    expect(new URL(payablePath, 'http://localhost').searchParams.get('sourceOrder')).toBe('PO-20261010-001');
  });

  it('settles a receivable with a stable document and payment date key', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ document: { id: 'ar-1' } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await settleReceivable(context, 'ar-1', { paymentDate: '2026-10-10' });

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/finance/receivables/ar-1/settlement');
    expect((request.headers as Record<string, string>)['X-Idempotency-Key']).toBe(
      'finance-receivable-settlement:ar-1:2026-10-10',
    );
    expect(JSON.parse(String(request.body))).toEqual({ paymentDate: '2026-10-10' });
  });
});
