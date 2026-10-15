import { describe, expect, it } from 'vitest';
import {
  completeSalesOutbound,
  createInventoryTabUrl,
  createInventoryWarehouseUrl,
  createSalesOutboundNavigationQuery,
  loadSalesOutboundTasks,
  recordWarehouseProductionResult,
  requestSalesOutbound,
  resolveInventoryTab,
  resolveInventoryWarehouseId,
  resolveSalesOutboundOrderId,
  type StoragePort,
} from '../../features/inventory/model/salesOutboundBridge';
import {
  recordSalesOrderProductionRequested,
  recordSalesOrderShipped,
  salesWorkspaceStorageKey,
} from '../../features/sales/model/salesShipmentBridge';

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('sales to inventory outbound navigation', () => {
  it('restores the outbound tab and source sales order from the URL', () => {
    const search = '?module=inventory&inventory=outbound&sourceOrder=SO-20260615-001';
    expect(resolveInventoryTab(search)).toBe('outbound');
    expect(resolveSalesOutboundOrderId(search)).toBe('SO-20260615-001');
    expect(createSalesOutboundNavigationQuery('SO-20260615-001')).toEqual({
      inventory: 'outbound',
      sourceOrder: 'SO-20260615-001',
    });
  });

  it('clears sales context when leaving outbound management', () => {
    const url = createInventoryTabUrl({
      pathname: '/',
      search: '?module=inventory&inventory=outbound&sourceOrder=SO-1&focusOrder=SO-2',
      hash: '',
    }, 'stock');
    expect(url).toBe('/?module=inventory&inventory=stock');
  });

  it('restores a selected warehouse and clears it when switching tabs', () => {
    const location = {
      pathname: '/',
      search: '?module=inventory&inventory=warehouses',
      hash: '',
    };
    const warehouseUrl = createInventoryWarehouseUrl(location, 'WH-FG-01');
    expect(warehouseUrl).toBe('/?module=inventory&inventory=warehouses&warehouseId=WH-FG-01');
    expect(resolveInventoryTab(warehouseUrl.split('?')[1] || '')).toBe('warehouses');
    expect(resolveInventoryWarehouseId(warehouseUrl.split('?')[1] || '')).toBe('WH-FG-01');
    expect(createInventoryTabUrl({ ...location, search: warehouseUrl.split('?')[1] || '' }, 'products'))
      .toBe('/?module=inventory&inventory=products');
  });
});

describe('sales outbound task bridge', () => {
  it('creates one outbound task per sales order and completes it', () => {
    const storage = new MemoryStorage();
    const request = {
      orderId: 'SO-20260615-001',
      customer: '商洛墨翠宝石开发有限公司',
      item: 'FG001 工业控制器顶配版',
      qty: 1,
      unit: '件',
      availableQty: 10,
    };
    const first = requestSalesOutbound(storage, 'TENANT-SHWS', request, new Date('2026-07-26T01:00:00.000Z'));
    const repeated = requestSalesOutbound(storage, 'TENANT-SHWS', request, new Date('2026-07-26T02:00:00.000Z'));

    expect(repeated.id).toBe(first.id);
    expect(loadSalesOutboundTasks(storage, 'TENANT-SHWS')).toHaveLength(1);
    expect(first.status).toBe('待发货');

    const completed = completeSalesOutbound(storage, 'TENANT-SHWS', first.id, new Date('2026-07-26T03:00:00.000Z'));
    expect(completed).toMatchObject({
      id: first.id,
      source: request.orderId,
      status: '已出库',
      shippedAt: '2026-07-26T03:00:00.000Z',
    });
  });

  it('blocks shipment when stock is short and records the warehouse production request', () => {
    const storage = new MemoryStorage();
    const task = requestSalesOutbound(storage, 'TENANT-SHWS', {
      orderId: 'SO-20260508-001',
      customer: 'test01客户',
      amount: '¥8,075.00',
      item: 'FG001 工业控制器顶配版',
      productId: 'FG001',
      qty: 17,
      unit: '件',
      availableQty: 8,
    });

    expect(task).toMatchObject({ status: '库存不足', availableQty: 8, shortageQty: 9, amount: '¥8,075.00' });
    expect(completeSalesOutbound(storage, 'TENANT-SHWS', task.id)).toBeNull();

    const requested = recordWarehouseProductionResult(storage, 'TENANT-SHWS', task.id, {
      availableQty: 8,
      shortageQty: 9,
      inventoryFactVersion: 3,
      intakeId: 'INTAKE-001',
      productionDemandId: 'DEMAND-001',
      productionDemandCode: 'PD-20260726-001',
    });
    expect(requested).toMatchObject({
      status: '生产申请中',
      productionDemandCode: 'PD-20260726-001',
    });
  });

  it('writes a completed outbound task back to the sales order workspace', () => {
    const storage = new MemoryStorage();
    storage.setItem(salesWorkspaceStorageKey('TENANT-SHWS'), JSON.stringify({
      schemaVersion: 8,
      orders: [{
        id: 'SO-20260615-001',
        amount: '¥500.00',
        status: '已确认',
        outStatus: '未发货',
        receivable: '待生成',
      }],
      audits: [],
    }));

    expect(recordSalesOrderShipped(storage, 'TENANT-SHWS', {
      orderId: 'SO-20260615-001',
      outboundId: 'OUT-20260615-001',
      shippedAt: '2026-07-26T03:00:00.000Z',
      operator: '王仓管',
    })).toBe(true);

    const workspace = JSON.parse(storage.getItem(salesWorkspaceStorageKey('TENANT-SHWS')) || '{}');
    expect(workspace.orders[0]).toMatchObject({
      status: '已发货',
      outStatus: '全部发货',
      receivable: '¥500.00',
      outboundNo: 'OUT-20260615-001',
    });
    expect(workspace.audits[0]).toMatchObject({
      action: '库存确认销售出库',
      entityId: 'SO-20260615-001',
    });
  });

  it('writes a warehouse production request back to the sales order workspace', () => {
    const storage = new MemoryStorage();
    storage.setItem(salesWorkspaceStorageKey('TENANT-SHWS'), JSON.stringify({
      schemaVersion: 8,
      orders: [{ id: 'SO-20260508-001', status: '已确认', outStatus: '未发货' }],
      audits: [],
    }));

    expect(recordSalesOrderProductionRequested(storage, 'TENANT-SHWS', {
      orderId: 'SO-20260508-001',
      availableQty: 8,
      shortageQty: 9,
      inventoryFactVersion: 3,
      intakeId: 'INTAKE-001',
      productionDemandId: 'DEMAND-001',
      productionDemandCode: 'PD-20260726-001',
      requestedAt: '2026-07-26T04:00:00.000Z',
      operator: '王仓管',
    })).toBe(true);

    const workspace = JSON.parse(storage.getItem(salesWorkspaceStorageKey('TENANT-SHWS')) || '{}');
    expect(workspace.orders[0]).toMatchObject({
      status: '生产中',
      availableStock: 8,
      shortage: 9,
      productionDemandCode: 'PD-20260726-001',
    });
    expect(workspace.audits[0]).toMatchObject({
      action: '仓库发起生产申请',
      entityId: 'SO-20260508-001',
    });
  });
});
