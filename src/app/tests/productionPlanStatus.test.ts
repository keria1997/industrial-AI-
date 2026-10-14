import { describe, expect, it } from 'vitest';
import {
  mapProductionDemandStatus,
  normalizeProductionDemandTrace,
  planningResultCoversDemand,
  scheduleResultCoversDemand,
} from '../../features/production/model/productionPlanStatus';

describe('production plan status', () => {
  it('recovers sales trace from the persisted fulfillment payload without losing fact version zero', () => {
    expect(normalizeProductionDemandTrace({
      correlationId: 'DEMAND-CORRELATION',
      source: { sourceId: 'ORDER-1', sourceLineId: 'LINE-1',
        payloadSnapshot: { salesOrderId: 'ORDER-1', warehouseId: 'WH-1', inventoryFactVersion: 0, traceId: 'TRACE-1' } },
    })).toMatchObject({
      salesOrderId: 'ORDER-1', salesOrderLineId: 'LINE-1', inventoryWarehouseId: 'WH-1',
      inventoryFactVersion: 0, correlationId: 'DEMAND-CORRELATION', traceId: 'TRACE-1',
    });
    expect(normalizeProductionDemandTrace({})).toBeNull();
  });
  it('maps formal demand states without treating approval as planning success', () => {
    expect(mapProductionDemandStatus({ status: 'RECEIVED' })).toBe('待校验');
    expect(mapProductionDemandStatus({ status: 'BLOCKED' })).toBe('校验阻断');
    expect(mapProductionDemandStatus({ status: 'PENDING_REVIEW' })).toBe('待审批');
    expect(mapProductionDemandStatus({ status: 'APPROVED' })).toBe('待接收');
    expect(mapProductionDemandStatus({ status: 'APPROVED', acceptedAt: '2026-01-01' })).toBe('待展算');
    expect(mapProductionDemandStatus({ status: 'PLANNED' })).toBe('已展算');
  });

  it('accepts only planning and schedule results that cover the demand', () => {
    const demandId = 'DEMAND-1';
    expect(planningResultCoversDemand({ mpsLines: [{ demandId }] }, demandId)).toBe(true);
    expect(planningResultCoversDemand({ mpsLines: [{ demandId: 'OTHER' }] }, demandId)).toBe(false);
    expect(scheduleResultCoversDemand({ scheduleCandidates: [{ demandIds: [demandId] }] }, demandId)).toBe(true);
    expect(scheduleResultCoversDemand({ scheduleCandidates: [{ demandIds: [demandId], published: false }] }, demandId)).toBe(false);
  });
});
