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
  // API metadata and facts replace browser snapshots, including empty collections.
  const masterData: InventoryMasterData = {
    schemaVersion: 1, stockSource: 'formal', warehouses: warehouses.map(mapFormalWarehouse),
    products: products.map(product => ({
      id: product.id, code: product.code, serverVersion: product.version, name: product.name, specification: product.specification || '',
      category: product.category || '', unit: product.uom || '', unitPrice: Number(product.unitPrice || 0),
      // Configuration comes from the product API; stock distribution cannot supply a default.
      defaultWarehouseId: product.defaultWarehouseId
        ? resolveWarehouse(warehouses, product.defaultWarehouseId)?.code || product.defaultWarehouseId : '',
      safetyStock: Number(product.safetyStockQty || 0), traceMode: '', status: product.status === 'active' ? '启用' : '停用',
      updatedAt: product.updatedAt || '',
    })),
    materials: materials.map(material => ({
      id: material.id, code: material.code, serverVersion: material.version, name: material.name, specification: material.specification || '',
      materialType: material.materialType || '', unit: material.uom || '', unitPrice: Number(material.unitPrice || 0),
      defaultWarehouseId: material.defaultWarehouseId
        ? resolveWarehouse(warehouses, material.defaultWarehouseId)?.code || material.defaultWarehouseId : '',
      safetyStock: Number(material.safetyStockQty || 0), procurementType: '',
      status: material.status === 'active' ? '启用' : '停用', updatedAt: material.updatedAt || '',
    })),
  };
  const stockData = facts.map(fact => {
    const warehouse = resolveWarehouse(warehouses, fact.warehouseId);
    const product = products.find(item => item.id === fact.productId || item.code === fact.productId);
    const material = materials.find(item => item.id === fact.productId || item.code === fact.productId);
    const kind = product ? '产品' as const : '物料' as const;
    const metadata = product || material;
    return {
      id: fact.productId,
      kind,
      name: metadata?.name || fact.productId,
      category: metadata?.category || kind,
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
