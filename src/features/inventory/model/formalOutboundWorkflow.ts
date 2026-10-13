import {
  checkAndReserveShipmentTask,
  getFulfillmentOutbound,
  postFulfillmentOutbound,
  type ApiContext,
  type FulfillmentOutbound,
  type FulfillmentPostResult,
  type FulfillmentShipmentTask,
} from '../../../api/fulfillment';

export const prepareFormalOutbound = async (
  context: ApiContext,
  task: FulfillmentShipmentTask,
  warehouseId: string,
  expectedFactVersions?: Array<{ productId: string; factVersion: number }>,
): Promise<{ task: FulfillmentShipmentTask; outbound?: FulfillmentOutbound }> => {
  if (task.warehouseId !== warehouseId && task.outboundId) throw new Error('任务已有出库记录，不能切换发货仓库');
  if (task.availabilityStatus !== 'RESERVED') {
    const result = await checkAndReserveShipmentTask(context, task, warehouseId, expectedFactVersions);
    if (!['SUCCEEDED', 'PARTIALLY_SUCCEEDED', 'SHORTAGE'].includes(result.outcome)) {
      throw new Error('库存校验结果尚未确认，请刷新任务后重试');
    }
    return { task: result.task, outbound: result.outbound };
  }
  if (!task.outboundId) throw new Error('库存预留完成但未生成出库单');
  return { task, outbound: await getFulfillmentOutbound(context, task.outboundId) };
};

export const postFormalOutbound = async (
  context: ApiContext,
  outbound: FulfillmentOutbound,
  quantitiesByOrderLineId: Record<string, string>,
): Promise<FulfillmentPostResult> => {
  const result = await postFulfillmentOutbound(context, outbound, quantitiesByOrderLineId);
  if (result.outcome !== 'SUCCEEDED' || !result.task || !result.order) {
    throw new Error('出库结果尚未确认，请刷新任务和销售订单后重试');
  }
  return result;
};
