import type { AvailabilityFactDto, MaterialDto, ProductDto, WarehouseDto } from '../../../api/fulfillment';
import { addQuantity, compareQuantity } from '../../../shared/decimal';
import type { InventoryMasterData, InventoryStockFact, InventoryWarehouse } from './inventoryMasterData';

export const resolveWarehouse = (warehouses: WarehouseDto[], idOrCode: string) =>
  warehouses.find(warehouse => warehouse.id === idOrCode)
  || warehouses.find(warehouse => warehouse.code === idOrCode);

export const mapFormalWarehouse = (warehouse: WarehouseDto): InventoryWarehouse => ({
  id: warehouse.code,
  code: warehouse.code,
  serverId: warehouse.id,
  serverVersion: warehouse.version,
  name: warehouse.name,
  type: warehouse.type,
  organization: warehouse.organization || '',
  manager: warehouse.manager || '',
  phone: warehouse.phone || '',
  address: warehouse.address || '',
  capacity: Number(warehouse.capacity || 0),
  usedCapacity: Number(warehouse.usedCapacity || 0),
  status: warehouse.status === 'active' ? '启用' : '停用',
  remark: warehouse.remark || '',
  updatedAt: (warehouse.updatedAt || '').slice(0, 16).replace('T', ' '),
});

export const buildFormalInventory = (
  local: InventoryMasterData,
  warehouses: WarehouseDto[],
  facts: AvailabilityFactDto[],
  products: ProductDto[],
  materials: MaterialDto[],
): { masterData: InventoryMasterData; stockData: InventoryStockFact[] } => {
  const masterData: InventoryMasterData = { ...local, stockSource: 'formal', warehouses: warehouses.map(mapFormalWarehouse) };
  const stockData = facts.map(fact => {
    const warehouse = resolveWarehouse(warehouses, fact.warehouseId);
    const product = products.find(item => item.id === fact.productId || item.code === fact.productId);
    const material = materials.find(item => item.id === fact.productId || item.code === fact.productId);
    const localProduct = local.products.find(item => item.id === fact.productId);
    const localMaterial = local.materials.find(item => item.id === fact.productId);
    const kind = product || localProduct ? '产品' as const : '物料' as const;
    const metadata = product || material;
    return {
      id: fact.productId,
      kind,
      name: metadata?.name || localProduct?.name || localMaterial?.name || fact.productId,
      category: metadata?.category || localProduct?.category || localMaterial?.materialType || kind,
      specification: metadata?.specification,
      unitPrice: metadata?.unitPrice,
      warehouseId: warehouse?.id || fact.warehouseId,
      warehouse: warehouse?.name || fact.warehouseId,
      location: '-',
      stockQty: Number(fact.qualifiedOnHandQty),
      lockQty: Number(addQuantity(fact.allocatedReservedQty, fact.frozenQty)),
      availQty: Number(fact.fulfillableQty),
      safetyStock: Number(fact.safetyStockQty),
      unit: fact.uom,
      status: compareQuantity(fact.fulfillableQty, '0') > 0 ? '正常' : '低库存',
      factVersion: fact.factVersion,
    };
  });
  return { masterData, stockData };
};
