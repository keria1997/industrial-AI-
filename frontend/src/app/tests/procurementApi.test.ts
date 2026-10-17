import { afterEach, describe, expect, it, vi } from 'vitest';
import { procurementApi, type PurchaseOrderDto, type PurchaseRequestDto } from '../../api/procurement';

describe('procurement API client', () => {
  const context = { tenantId: 'TENANT-SHWS', accessToken: 'signed-session-token' };

  afterEach(() => vi.restoreAllMocks());

  it('creates a purchase request from stable MRP shortage identifiers', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'pr-1' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await procurementApi.createRequest(context, { mrpTaskId: 'task-1', demandId: 'demand-1', materialId: 'RM201' });

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/procurement/purchase-requests');
    expect(request.headers).toMatchObject({
      Authorization: 'Bearer signed-session-token',
      'X-Tenant-Id': 'TENANT-SHWS',
    });
    expect((request.headers as Record<string, string>)['X-Idempotency-Key']).toMatch(/^purchase-request:task-1:demand-1:RM201:/);
    expect(JSON.parse(String(request.body))).toEqual({ mrpTaskId: 'task-1', demandId: 'demand-1', materialId: 'RM201' });
  });

  it('approves a PR with optimistic locking and maker-checker input', async () => {
    const requestDto = {
      id: 'pr-1', requestNo: 'PR-001', mrpTaskId: 'task-1', demandId: 'demand-1', materialId: 'RM201',
      warehouseId: 'WH-RM-01', requiredQty: '20', uom: 'PCS', requiredDate: '2026-08-01',
      status: 'PENDING_APPROVAL', version: 3, createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
    } satisfies PurchaseRequestDto;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ request: requestDto, order: {} }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await procurementApi.approveRequest(context, requestDto, { supplierId: 'API-SUPPLIER', supplierName: '接口供应商' });

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/procurement/purchase-requests/pr-1/approve');
    expect(request.headers).toMatchObject({ 'If-Match': '"3"' });
    expect(JSON.parse(String(request.body))).toEqual({
      supplierId: 'API-SUPPLIER', supplierName: '接口供应商', promisedDate: '2026-08-01',
    });
  });

  it('receives a PO using its current version and a stable external transaction id', async () => {
    const order = {
      id: 'po-1', orderNo: 'PO-001', purchaseRequestId: 'pr-1', demandId: 'demand-1', materialId: 'RM201',
      warehouseId: 'WH-RM-01', orderedQty: '20', receivedQty: '0', uom: 'PCS', supplierId: 'SUP-001',
      supplierName: '深圳华芯科技', promisedDate: '2026-08-01',
      unitPrice: '50.00', taxRate: '13', currency: 'CNY', totalAmount: '1130.00',
      status: 'CONFIRMED', version: 2,
      createdAt: '2026-07-27T00:00:00.000Z', updatedAt: '2026-07-27T00:00:00.000Z',
    } satisfies PurchaseOrderDto;
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ order, receipt: {} }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    }));

    await procurementApi.receiveOrder(context, order);

    const [path, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(path).toBe('/api/v1/procurement/purchase-orders/po-1/receipts');
    expect(request.headers).toMatchObject({ 'If-Match': '"2"' });
    expect(JSON.parse(String(request.body))).toMatchObject({ externalTransactionId: 'WEB-PRCV-po-1' });
  });
});
