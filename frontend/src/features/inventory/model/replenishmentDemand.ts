import { platformApi } from '../../../api/platform/client';
import { productionOperationsApi } from '../../../api/production/operations';
import type { ApiContext } from '../../../api/client';
import type { WarehouseDto } from '../../../api/fulfillment';

export async function resolveFactoryForWarehouse(context: ApiContext, warehouse: WarehouseDto) {
  const [resources, organizations] = await Promise.all([
    platformApi.listResources(context), platformApi.listOrgUnits(context),
  ]);
  const resource = resources.find(item => item.type === 'warehouse' && item.status === 'enabled'
    && [warehouse.id, warehouse.code].includes(item.code));
  const factories = organizations.filter(item => item.type === 'factory' && item.status === 'enabled');
  const factory = resource?.factoryOrgId
    ? factories.find(item => item.id === resource.factoryOrgId)
    : factories.length === 1 ? factories[0] : undefined;
  if (!factory) throw new Error('无法确定仓库所属工厂，请先在平台管理配置仓库与工厂关系');
  return factory.code;
}

export async function createInventoryReplenishmentDemand(
  context: ApiContext, warehouse: WarehouseDto,
  row: { id: string; name: string; unit: string; availQty: number; safetyStock: number; factVersion?: number },
  requestedQty: number, requiredDate: string,
) {
  const factoryResourceId = await resolveFactoryForWarehouse(context, warehouse);
  return productionOperationsApi.createDemand(context, {
    sourceType: 'INVENTORY_REPLENISHMENT', sourceDescription: `库存补货 / ${warehouse.code}`,
    productId: row.id, productName: row.name, qty: String(requestedQty), uom: row.unit,
    dueDate: requiredDate, factoryResourceId, inventoryWarehouseId: warehouse.id,
    priority: row.availQty < row.safetyStock ? 80 : 50,
  }, `inventory-replenishment:${context.tenantId}:${warehouse.id}:${row.id}:${row.factVersion ?? 'unknown'}:${row.availQty}:${row.safetyStock}:${requestedQty}:${requiredDate}`);
}
