import { describe, expect, it } from 'vitest';
import {
  completeProductionMaterialIssueTask,
  createInventoryProductionPlan,
  createInventoryPurchaseRequest,
  createProductionMaterialIssueTask,
  loadInventoryPurchaseRequests,
  loadProductionMaterialIssueTasks,
  markProductionMaterialIssueTaskShortage,
  suggestInventoryReplenishmentQty,
} from '../../features/inventory/model/inventoryActionBridge';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const productRow = {
  id: 'FG002', name: '边缘计算网关标准版', warehouseId: 'WH-FG-01',
  availQty: 0, safetyStock: 120, unit: '台',
};

const materialRow = {
  id: 'RM202', name: '12层空PCB板', warehouseId: 'WH-RM-01',
  availQty: 80, safetyStock: 300, unit: 'PCS', procurementType: '外购',
};

describe('inventory cross-module action bridge', () => {
  it('creates one recoverable MPS for the same inventory snapshot', () => {
    const storage = new MemoryStorage();
    const first = createInventoryProductionPlan(storage, 'TENANT-A', productRow, {
      requestedQty: 120, requiredDate: '2026-08-05', priority: '紧急', actor: '仓库管理员',
    }, 1785500000000);
    const duplicate = createInventoryProductionPlan(storage, 'TENANT-A', productRow, {
      requestedQty: 120, requiredDate: '2026-08-05', priority: '紧急', actor: '仓库管理员',
    }, 1785500000100);

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.request.mpsId).toBe(first.request.mpsId);
    const production = JSON.parse(storage.getItem('industrial-ai-production-legacy:TENANT-A') || '{}');
    expect(production.mps).toEqual([
      expect.objectContaining({
        id: first.request.mpsId,
        source: expect.stringContaining(first.request.id),
        status: '待展算',
        warehouseId: productRow.warehouseId,
        availableQty: productRow.availQty,
        safetyStock: productRow.safetyStock,
        createdBy: '仓库管理员',
      }),
    ]);
  });

  it('creates a tenant-isolated purchase request and rejects self-made material', () => {
    const storage = new MemoryStorage();
    const first = createInventoryPurchaseRequest(storage, 'TENANT-A', materialRow, {
      requestedQty: 220, requiredDate: '2026-08-05', actor: '仓库管理员',
    }, 1785500000000);
    const duplicate = createInventoryPurchaseRequest(storage, 'TENANT-A', materialRow, {
      requestedQty: 220, requiredDate: '2026-08-05', actor: '仓库管理员',
    }, 1785500000100);

    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(loadInventoryPurchaseRequests(storage, 'TENANT-A')).toHaveLength(1);
    expect(loadInventoryPurchaseRequests(storage, 'TENANT-B')).toEqual([]);
    expect(() => createInventoryPurchaseRequest(storage, 'TENANT-A', { ...materialRow, procurementType: '自制' }, {
      requestedQty: 10, requiredDate: '2026-08-05', actor: '仓库管理员',
    })).toThrow('自制物料不能发起采购');
  });

  it('keeps production waiting until the inventory issue task is completed', () => {
    const storage = new MemoryStorage();
    const created = createProductionMaterialIssueTask(storage, 'TENANT-A', {
      jobId: 'JOB-001', orderId: 'WO-001', operationName: '总装', materialId: 'RM201',
      materialName: 'AI算力芯片', requestedQty: 300, unit: 'PCS', warehouseId: 'WH-RM-01',
      targetWarehouse: 'WH-WIP-01', actor: '生产计划员',
    }, 1785500000000);

    expect(created.task.status).toBe('待出库');
    expect(markProductionMaterialIssueTaskShortage(storage, 'TENANT-A', created.task.id)?.status).toBe('库存不足');
    expect(completeProductionMaterialIssueTask(storage, 'TENANT-A', created.task.id, 1785500100000)?.status).toBe('已出库');
    expect(loadProductionMaterialIssueTasks(storage, 'TENANT-A')).toEqual([
      expect.objectContaining({ jobId: 'JOB-001', status: '已出库', completedAt: expect.any(String) }),
    ]);
  });

  it('calculates replenishment quantity from safety stock and never returns zero', () => {
    expect(suggestInventoryReplenishmentQty(80, 300)).toBe(220);
    expect(suggestInventoryReplenishmentQty(500, 300)).toBe(1);
  });
});
