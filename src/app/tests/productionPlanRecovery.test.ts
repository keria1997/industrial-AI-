import { describe, expect, it } from 'vitest';
import { recoverMpsFromPlannedDemand } from '../../features/production/model/productionPlanStatus';

describe('production plan recovery', () => {
  const demand = {
    id: '583cf2e9-0000-0000-0000-000000000000',
    code: 'DM-RECOVER',
    sourceType: 'SALES_ORDER_SHORTAGE',
    productId: 'FG001',
    productName: '工业控制器',
    status: 'PLANNED',
    mrpTaskId: 'task-1',
    source: { salesOrderId: 'SO-001', inventoryFactVersion: 3 },
  };
  const task = {
    id: 'task-1',
    status: 'SUCCEEDED',
    result: { mpsLines: [{ demandId: demand.id, plannedQty: '2880', dueDate: '2026-10-18' }] },
  };

  it('restores a successful MRP result after a page refresh', () => {
    expect(recoverMpsFromPlannedDemand(demand, task)).toMatchObject({
      id: 'MPS-583cf2e9',
      taskId: 'task-1',
      demandId: demand.id,
      quantity: 2880,
      status: '已展算',
      formalMps: true,
    });
  });

  it('does not restore incomplete or mismatched tasks', () => {
    expect(recoverMpsFromPlannedDemand(demand, { ...task, status: 'RUNNING' })).toBeNull();
    expect(recoverMpsFromPlannedDemand({ ...demand, status: 'APPROVED' }, task)).toBeNull();
    expect(recoverMpsFromPlannedDemand(demand, { ...task, id: 'other-task' })).toBeNull();
  });
});
