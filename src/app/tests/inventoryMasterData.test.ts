import { describe, expect, it } from 'vitest';
import {
  createInventoryMasterDataSeed,
  getInventoryStockQueryRows,
  getWarehouseInventoryRows,
  inventoryMasterDataStorageKey,
  isInventoryCodeAvailable,
  loadInventoryMasterData,
  queryInventoryStock,
  saveInventoryMasterData,
} from '../../features/inventory/model/inventoryMasterData';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe('inventory master data workspace', () => {
  it('keeps warehouse, product and material data isolated by tenant', () => {
    const storage = new MemoryStorage();
    const first = createInventoryMasterDataSeed();
    first.warehouses[0].name = '租户甲原料仓';
    saveInventoryMasterData(storage, 'TENANT-A', first);

    expect(loadInventoryMasterData(storage, 'TENANT-A').warehouses[0].name).toBe('租户甲原料仓');
    expect(loadInventoryMasterData(storage, 'TENANT-B').warehouses[0].name).toBe('一号原材料仓');
    expect(storage.getItem(inventoryMasterDataStorageKey('TENANT-A'))).not.toBeNull();
  });

  it('rejects duplicate codes across warehouses, products and materials', () => {
    const data = createInventoryMasterDataSeed();
    expect(isInventoryCodeAvailable(data, 'fg001')).toBe(false);
    expect(isInventoryCodeAvailable(data, 'RM201')).toBe(false);
    expect(isInventoryCodeAvailable(data, 'WH-NEW-01')).toBe(true);
    expect(isInventoryCodeAvailable(data, 'FG001', 'FG001')).toBe(true);
  });

  it('shows stocked items and assigned zero-stock products in a warehouse', () => {
    const data = createInventoryMasterDataSeed();
    const warehouse = data.warehouses.find((item) => item.id === 'WH-FG-01');
    expect(warehouse).toBeDefined();
    const rows = getWarehouseInventoryRows(warehouse!, data, [{
      id: 'FG001', name: '工业控制器顶配版', category: '成品', warehouseId: 'WH-FG-01',
      warehouse: '成品主仓', location: 'F-02-05', stockQty: 3500, lockQty: 1200,
      availQty: 2300, unit: '台', status: '积压呆滞',
    }]);

    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'FG001', kind: '产品', stockQty: 3500, availQty: 2300, unitPrice: 500 }),
      expect.objectContaining({ id: 'FG002', kind: '产品', stockQty: 0, status: '未入库', unitPrice: 1200 }),
    ]));
  });

  it('migrates legacy seed records to reference prices and custom records to zero', () => {
    const storage = new MemoryStorage();
    const legacy = createInventoryMasterDataSeed();
    delete (legacy.products[0] as { unitPrice?: number }).unitPrice;
    delete (legacy.materials[0] as { unitPrice?: number }).unitPrice;
    saveInventoryMasterData(storage, 'TENANT-A', legacy);

    const loaded = loadInventoryMasterData(storage, 'TENANT-A');
    expect(loaded.products[0].unitPrice).toBe(500);
    expect(loaded.materials[0].unitPrice).toBe(125);

    legacy.products[0].unitPrice = 0;
    saveInventoryMasterData(storage, 'TENANT-A', legacy);
    expect(loadInventoryMasterData(storage, 'TENANT-A').products[0].unitPrice).toBe(0);
  });

  it('queries everything assigned to one warehouse, including zero-stock records', () => {
    const data = createInventoryMasterDataSeed();
    const rows = getInventoryStockQueryRows(data, [{
      id: 'FG001', name: '工业控制器顶配版', category: '成品', warehouseId: 'WH-FG-01',
      warehouse: '成品主仓', location: 'F-02-05', stockQty: 3500, lockQty: 1200,
      availQty: 2300, unit: '台', status: '积压呆滞',
    }]);

    expect(queryInventoryStock(rows, { warehouseId: 'WH-FG-01' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'FG001', kind: '产品', warehouseId: 'WH-FG-01', hasStockFact: true }),
      expect.objectContaining({ id: 'FG002', kind: '产品', warehouseId: 'WH-FG-01', status: '未入库', hasStockFact: false }),
      expect.objectContaining({ id: 'FG003', kind: '产品', warehouseId: 'WH-FG-01', status: '未入库', hasStockFact: false }),
      expect.objectContaining({ id: 'FG004', kind: '产品', warehouseId: 'WH-FG-01', status: '未入库', hasStockFact: false }),
    ]));
    expect(queryInventoryStock(rows, { warehouseId: 'WH-FG-01' })).toHaveLength(4);
  });

  it('filters products and materials across warehouses', () => {
    const rows = getInventoryStockQueryRows(createInventoryMasterDataSeed(), []);

    expect(queryInventoryStock(rows, { kind: '产品' })).toHaveLength(4);
    expect(queryInventoryStock(rows, { kind: '产品' }).every((row) => row.kind === '产品')).toBe(true);
    expect(queryInventoryStock(rows, { kind: '物料' })).toHaveLength(3);
    expect(queryInventoryStock(rows, { kind: '物料' }).every((row) => row.kind === '物料')).toBe(true);
  });

  it('searches inventory by code, name and combines warehouse and kind filters', () => {
    const rows = getInventoryStockQueryRows(createInventoryMasterDataSeed(), []);

    expect(queryInventoryStock(rows, { query: 'fg002' }).map((row) => row.id)).toEqual(['FG002']);
    expect(queryInventoryStock(rows, { query: '算力芯片' }).map((row) => row.id)).toEqual(['RM201']);
    expect(queryInventoryStock(rows, { warehouseId: 'WH-RM-01', kind: '产品' })).toEqual([]);
  });
});
