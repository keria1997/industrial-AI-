import type {
  InventoryMasterData,
  InventoryStockFact,
} from '../../inventory/model/inventoryMasterData';

export type SalesQuoteWarehouseOption = {
  warehouseId: string;
  warehouse: string;
};

export type SalesQuoteProductOption = {
  id: string;
  name: string;
  warehouseId: string;
  warehouse: string;
  spec: string;
  unit: string;
  unitPrice: number;
  availQty: number;
};

const stockFactKey = (warehouseId: string, productId: string) => `${warehouseId}:${productId}`;

const quoteUnit = (unit: string) => (unit === 'PCS' ? '件' : unit || '件');

export const mapInventoryMasterToQuoteOptions = (
  data: InventoryMasterData,
  stockFacts: InventoryStockFact[],
): { warehouses: SalesQuoteWarehouseOption[]; products: SalesQuoteProductOption[] } => {
  const warehouses = data.warehouses.filter((item) => item.status === '启用');
  const warehouseById = new Map(warehouses.flatMap((item) =>
    [item.id, item.code, item.serverId].filter(Boolean).map((id) => [id, item] as const)));
  const availability = new Map(
    stockFacts.map((fact) => {
      const warehouseId = fact.warehouseId
        || data.warehouses.find((warehouse) => warehouse.name === fact.warehouse)?.id
        || fact.warehouse;
      return [stockFactKey(warehouseById.get(warehouseId)?.id || warehouseId, fact.id), Number(fact.availQty || 0)];
    }),
  );

  return {
    warehouses: warehouses.map((warehouse) => ({
      warehouseId: warehouse.id,
      warehouse: `${warehouse.name} (${warehouse.id})`,
    })),
    products: data.products
      .filter((product) => product.status === '启用' && warehouseById.has(product.defaultWarehouseId))
      .map((product) => ({
        id: product.id,
        name: product.name,
        warehouseId: product.defaultWarehouseId,
        warehouse: warehouseById.get(product.defaultWarehouseId)?.name || product.defaultWarehouseId,
        spec: product.specification,
        unit: quoteUnit(product.unit),
        unitPrice: Number(product.unitPrice || 0),
        availQty: availability.get(stockFactKey(product.defaultWarehouseId, product.id)) || 0,
      })),
  };
};
