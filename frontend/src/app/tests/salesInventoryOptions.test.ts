import { describe, expect, it } from 'vitest';
import { createInventoryMasterDataSeed } from './fixtures/inventoryMasterData';
import { mapInventoryMasterToQuoteOptions } from '../../features/sales/model/salesInventoryOptions';

describe('mapInventoryMasterToQuoteOptions', () => {
  it('uses inventory master data for warehouses and products', () => {
    const data = createInventoryMasterDataSeed();
    const stockFacts = [
      { id: 'FG001', name: '工业控制器顶配版', category: '成品', warehouseId: 'WH-FG-01', warehouse: '成品主仓', location: 'F-01', stockQty: 100, lockQty: 20, availQty: 80, unit: '台', status: '正常' },
    ];

    const options = mapInventoryMasterToQuoteOptions(data, stockFacts);

    expect(options.warehouses.map((warehouse) => warehouse.warehouseId)).toEqual([
      'WH-RM-01',
      'WH-FG-01',
      'WH-WIP-01',
      'WH-TR-01',
    ]);
    expect(options.products).toHaveLength(4);
    expect(options.products.find((product) => product.id === 'FG001')).toMatchObject({
      name: '工业控制器顶配版',
      warehouseId: 'WH-FG-01',
      spec: 'IC-X900 / 32G / 双网口',
      unit: '台',
      unitPrice: 500,
      availQty: 80,
    });
    expect(options.products.find((product) => product.id === 'FG004')).toMatchObject({
      warehouseId: 'WH-FG-01',
      unit: '套',
      availQty: null,
    });
  });

  it('matches server warehouse IDs in stock facts to configured product warehouse codes', () => {
    const data = createInventoryMasterDataSeed();
    data.warehouses.find(item => item.id === 'WH-FG-01')!.serverId = 'warehouse-server-id';
    const options = mapInventoryMasterToQuoteOptions(data, [{
      id: 'FG001', name: '产品', category: '成品', warehouseId: 'warehouse-server-id', warehouse: '成品主仓',
      location: '-', stockQty: 8, lockQty: 0, availQty: 8, unit: '台', status: '正常',
    }]);
    expect(options.products.find(item => item.id === 'FG001'))
      .toMatchObject({ warehouseId: 'WH-FG-01', availQty: 8 });
  });
  it('preserves missing units, raw PCS and the difference between zero and unknown stock', () => {
    const data = createInventoryMasterDataSeed();
    data.products[0].unit = '';
    data.products[1].unit = 'PCS';
    let options = mapInventoryMasterToQuoteOptions(data, []);
    expect(options.products.find(item => item.id === data.products[0].id)?.unit).toBe('');
    expect(options.products.find(item => item.id === data.products[1].id)?.unit).toBe('PCS');
    const fact = { id: data.products[0].id, warehouseId: data.products[0].defaultWarehouseId, availQty: 0 } as any;
    options = mapInventoryMasterToQuoteOptions(data, [fact]);
    expect(options.products.find(item => item.id === fact.id)?.availQty).toBe(0);
    expect(mapInventoryMasterToQuoteOptions(data, [{ ...fact, hasStockFact: false }]).products.find(item => item.id === fact.id)?.availQty).toBeNull();
    expect(mapInventoryMasterToQuoteOptions(data, [{ ...fact, availQty: '' }]).products.find(item => item.id === fact.id)?.availQty).toBeNull();
  });
});
