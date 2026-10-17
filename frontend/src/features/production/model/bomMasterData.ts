import type { ApiContext } from '../../../api/client';
import { inventoryApi } from '../../../api/fulfillment';
import { platformApi } from '../../../api/platform/client';

// Existing inventory master endpoints return an authorized full collection, not stock facts.
function complete<T extends { id: string }>(result: { items: T[]; total: number }) {
  if (!Array.isArray(result?.items) || !Number.isSafeInteger(result.total)
    || result.items.length !== result.total || result.items.some(item => !item.id)
    || new Set(result.items.map(item => item.id)).size !== result.items.length) {
    throw new Error('主数据列表不完整，请刷新后重试');
  }
  return result.items;
}
export const bomMasterData = {
  products: async (context: ApiContext) => complete(await inventoryApi.listProducts(context)),
  materials: async (context: ApiContext) => complete(await inventoryApi.listMaterials(context)),
  warehouses: async (context: ApiContext) => complete(await inventoryApi.listWarehouses(context)),
  workCenters: async (context: ApiContext) => {
    const resources = await platformApi.listResources(context);
    if (!Array.isArray(resources)) throw new Error('工作中心列表响应不符合契约');
    return resources.filter(resource => resource.type === 'work_center' && resource.status === 'enabled');
  },
};
