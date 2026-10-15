import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSalesOrderIntake, listProductionDemands } from '../../api/production/salesProduction';

describe('sales to production API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-session-token' };
  const input = {
    salesOrderId: 'SO-001', sourceLineId: '1', sourceRevision: 1, productId: 'FG001',
    productName: '工业控制器', orderedQty: '17', uom: 'PCS', dueDate: '2026-08-01',
    factoryResourceId: 'FAC-SH-01', inventoryWarehouseId: 'WH-FG-01',
  };

  it('uses a stable business idempotency key and sends no client-calculated stock value', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      intake: { id: 'intake-1', salesOrderId: 'SO-001', sourceLineId: '1', orderedQty: '17', availableQty: '8',
        shortageQty: '9', decision: 'CREATE_PRODUCTION_DEMAND', inventoryFactVersion: 4, correlationId: 'corr-1' },
      recovered: false,
    }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await createSalesOrderIntake(context, input);
    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers['X-Idempotency-Key']).toBe('sales-intake:TENANT-SHWS:SO-001:1:1');
    expect(request.headers.Authorization).toBe('Bearer signed-session-token');
    expect(request.headers['X-Actor-Id']).toBeUndefined();
    expect(request.headers['X-Permissions']).toBeUndefined();
    expect(JSON.parse(request.body)).toEqual(input);
    expect(request.body).not.toContain('availableStock');
    expect(request.body).not.toContain('shortageQty');
  });

  it('preserves retry guidance and trace id from structured API errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'PRODUCTION_424_DEPENDENCY_FAILED', message: '库存事实缺失', suggestion: '等待库存同步后重试', retryable: true, traceId: 'trace-1' },
    }), { status: 424, headers: { 'Content-Type': 'application/json' } })));
    await expect(createSalesOrderIntake(context, input)).rejects.toMatchObject({
      code: 'PRODUCTION_424_DEPENDENCY_FAILED', suggestion: '等待库存同步后重试', retryable: true, traceId: 'trace-1',
    });
  });

  it('loads persisted production demands for the production demand pool', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], total: 0 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await listProductionDemands(context)).toEqual({ items: [], total: 0 });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/production/demands?page=1&pageSize=200', expect.any(Object));
  });
});
