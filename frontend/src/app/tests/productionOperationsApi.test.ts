import { afterEach, describe, expect, it, vi } from 'vitest';
import { productionOperationsApi, type DemandDto } from '../../api/production/operations';

describe('production operations API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-session-token' };

  it('loads production dashboard through the signed production API boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      kpis: { activeWorkOrders: 1, overdueWorkOrders: 0, completionRatePercent: 50, pendingDemands: 2, openFqc: 0 },
      risks: [], updatedAt: '2026-07-26T00:00:00.000Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await productionOperationsApi.dashboard(context);
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/production/dashboard/kpis', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer signed-session-token', 'X-Tenant-Id': 'TENANT-SHWS' }),
    }));
  });

  it('sends demand validation with version and stable idempotency headers', async () => {
    const demand: DemandDto = {
      id: 'demand-1', code: 'DM-001', sourceType: 'SALES_ORDER', productId: 'FG001', productName: '工业控制器',
      qty: '2', uom: 'PCS', dueDate: '2026-08-01', factoryResourceId: 'FAC-SH-01', status: 'RECEIVED',
      blockReasons: [], createdBy: 'warehouse', version: 3, correlationId: 'corr-1', updatedAt: '2026-07-26T00:00:00.000Z',
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...demand, status: 'PENDING_REVIEW', version: 4 }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await productionOperationsApi.validateDemand(context, demand);
    const [, request] = fetchMock.mock.calls[0];
    expect(request.headers.Authorization).toBe('Bearer signed-session-token');
    expect(request.headers['If-Match']).toBe('"3"');
    expect(request.headers['X-Idempotency-Key']).toBe('demand-validate:TENANT-SHWS:demand-1:3');
    expect(request.headers['Idempotency-Key']).toBe(request.headers['X-Idempotency-Key']);
    expect(JSON.parse(request.body)).toEqual({});
    expect(request.headers['X-Permissions']).toBeUndefined();
  });

  it('creates and queries planning task records through formal APIs', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ taskId: 'task-1', status: 'SUCCEEDED', progress: 100, result: { canProceedToAps: true }, traceId: 'trace-1' }), {
        status: 202, headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'task-1', taskType: 'MRP_RUN', status: 'RUNNING', progress: 0, retryCount: 0, maxRetryCount: 4,
        input: {}, traceId: 'trace-1', createdBy: 'admin', createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    await productionOperationsApi.startPlanningTask(context, 'MRP', ['demand-1'], 'run-1');
    await productionOperationsApi.getTask(context, 'task-1');

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/production/mrp-runs');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ demandIds: ['demand-1'] });
    expect(fetchMock.mock.calls[0][1].headers['X-Idempotency-Key']).toBe('planning-mrp:TENANT-SHWS:run-1');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/production/tasks/task-1');
  });
});
