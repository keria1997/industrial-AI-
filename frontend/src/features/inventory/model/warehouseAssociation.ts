import type { InventoryWarehouse } from './inventoryMasterData';

/** UI warehouse code -> authorized server ID. Changing this reference never moves stock. */
export function warehouseAssociation(
  warehouses: InventoryWarehouse[],
  requested: string,
  previous: string,
  entity: 'product' | 'material',
  creating: boolean,
): { defaultWarehouseId?: string } {
  if (!requested) {
    if (entity === 'material') throw new Error('请选择物料的库存仓库');
    if (!creating && previous) throw new Error('当前接口暂不支持取消库存仓库关联，请保留或选择其他仓库');
    return {};
  }
  if (!creating && requested === previous) return {};
  const warehouse = warehouses.find(item => item.id === requested || item.serverId === requested);
  if (!warehouse?.serverId || warehouse.status !== '启用') throw new Error('请选择可用的库存仓库');
  return { defaultWarehouseId: warehouse.serverId };
}
