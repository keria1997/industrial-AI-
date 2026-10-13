import { describe, expect, it } from 'vitest';
import type { AvailabilityFactDto, ProductDto, WarehouseDto } from '../../api/fulfillment';
import { buildFormalInventory, resolveWarehouse } from '../../features/inventory/model/formalInventory';
import { createInventoryMasterDataSeed, getInventoryStockQueryRows, getWarehouseInventoryRows } from '../../features/inventory/model/inventoryMasterData';
import { formalShipmentStock } from '../../features/inventory/model/formalShipmentStock';
import type { FulfillmentShipmentTask } from '../../api/fulfillment';

const warehouse = { id: 'server-fg-id', code: 'WH-FG-01', name: '成品主仓', status: 'active', updatedAt: '' } as WarehouseDto;
const other = { ...warehouse, id: 'other-id', code: 'WH-OTHER' };
const fact: AvailabilityFactDto = {
  warehouseId: warehouse.id, productId: 'FG003', qualifiedOnHandQty: '150',
  allocatedReservedQty: '30', frozenQty: '5', safetyStockQty: '10', inTransitQty: '100',
  fulfillableQty: '105', uom: '台', factVersion: 7,
};
const snapshot = (facts: AvailabilityFactDto[]) =>
  buildFormalInventory(createInventoryMasterDataSeed(), [warehouse, other], facts, [], []);

describe('formal inventory authority', () => {
  it('resolves both warehouse ID and code, without using the warehouse name as identity', () => {
    expect(resolveWarehouse([warehouse], warehouse.id)).toBe(warehouse);
    expect(resolveWarehouse([warehouse], warehouse.code)).toBe(warehouse);
    expect(resolveWarehouse([warehouse], warehouse.name)).toBeUndefined();
  });

  it('uses the same fact for warehouse detail, stock query and shipment validation', () => {
    const { masterData, stockData } = snapshot([fact]);
    const rows = getWarehouseInventoryRows(masterData.warehouses[0], masterData, stockData);
    const ledger = getInventoryStockQueryRows(masterData, stockData);
    expect(rows.find(row => row.id === 'FG003')).toMatchObject({ stockQty: 150, lockQty: 35, availQty: 105 });
    expect(ledger.find(row => row.id === 'FG003' && row.hasStockFact)).toMatchObject({ availQty: 105, safetyStock: 10 });
    const task = { warehouseId: warehouse.id, lines: [{
      id: 'line', orderLineId: 'order-line', productId: 'FG003',
      requestedQty: '110', postedQty: '0', reservedQty: '0',
    }] } as FulfillmentShipmentTask;
    expect(formalShipmentStock(task, [fact])[0]).toMatchObject({ availQty: 105, shortage: 5, factVersion: 7 });
    expect(getWarehouseInventoryRows(masterData.warehouses[1], masterData, stockData)).toEqual([]);
  });

  it('does not replace a missing backend fact with the frontend seed quantity', () => {
    const { masterData, stockData } = snapshot([]);
    expect(stockData).toEqual([]);
    expect(getWarehouseInventoryRows(masterData.warehouses[0], masterData, stockData)
      .find(row => row.id === 'FG003')).toMatchObject({ hasStockFact: false, status: '未查询到库存记录', availQty: 0 });
  });

  it('keeps backend zero stock distinct from a missing fact and handles legacy warehouse codes', () => {
    const { masterData, stockData } = snapshot([{ ...fact, warehouseId: warehouse.code,
      qualifiedOnHandQty: '0', allocatedReservedQty: '0', frozenQty: '0', fulfillableQty: '0' }]);
    expect(getInventoryStockQueryRows(masterData, stockData).find(row => row.id === 'FG003'))
      .toMatchObject({ hasStockFact: true, stockQty: 0, availQty: 0 });
  });

  it('uses server item metadata without changing the exact product ID used by shipment facts', () => {
    const product = { id: 'uuid-product', code: 'NEW-FG', name: '新品', specification: '规格', unitPrice: '5' } as ProductDto;
    const { masterData, stockData } = buildFormalInventory(createInventoryMasterDataSeed(), [warehouse],
      [{ ...fact, productId: product.id }], [product], []);
    expect(getWarehouseInventoryRows(masterData.warehouses[0], masterData, stockData).find(row => row.id === product.id))
      .toMatchObject({ id: product.id, kind: '产品', name: '新品', specification: '规格', unitPrice: 5 });
  });

  it('adds frozen and reserved decimal quantities without floating point arithmetic', () => {
    expect(snapshot([{ ...fact, allocatedReservedQty: '0.1', frozenQty: '0.2' }]).stockData[0].lockQty).toBe(0.3);
  });
});
