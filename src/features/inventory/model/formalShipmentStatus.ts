import type { FulfillmentShipmentTask } from '../../../api/fulfillment';

export const mapFormalShipmentStatus = (task: FulfillmentShipmentTask) => {
  const fullyPosted = task.postingStatus === 'POSTED'
    && task.workflowStatus === 'COMPLETED'
    && task.lines.length > 0
    && task.lines.every((line) => Number(line.postedQty) === Number(line.requestedQty));

  if (fullyPosted) return '已出库';
  if (task.availabilityStatus === 'RECHECKING' || task.replenishmentStatus === 'AVAILABLE') {
    return '待重新校验库存';
  }
  if (task.replenishmentStatus === 'IN_PROGRESS') {
    return task.postingStatus === 'PARTIALLY_POSTED' ? '部分发货 · 生产补货中' : '生产补货中';
  }
  if (task.postingStatus === 'PARTIALLY_POSTED') {
    return task.replenishmentStatus === 'REQUIRED' ? '部分发货 · 库存不足' : '部分发货';
  }
  if (task.replenishmentStatus === 'REQUIRED') return '库存不足';
  if (task.availabilityStatus === 'RESERVED') return '待出库';
  return '待校验';
};
