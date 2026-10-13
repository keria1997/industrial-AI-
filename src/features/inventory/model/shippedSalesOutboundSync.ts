import { addQuantity, compareQuantity } from '../../../shared/decimal';
import { salesWorkspaceStorageKey } from '../../sales/model/salesShipmentBridge';
import { loadSalesOutboundTasks, saveSalesOutboundTasks, type SalesOutboundTask, type StoragePort } from './salesOutboundBridge';

type ShippedSalesLine = {
  productId?: string;
  productName?: string;
  spec?: string;
  qty?: number | string;
  quantity?: number | string;
  unit?: string;
  unitPrice?: number;
};

export type ShippedSalesOrder = {
  id: string;
  status: string;
  outStatus?: string;
  aggregateId?: string;
  formalOrder?: unknown;
  client?: string;
  salesman?: string;
  product?: string;
  productName?: string;
  productId?: string;
  qty?: number | string;
  unit?: string;
  amount?: string;
  warehouse?: string;
  warehouseId?: string;
  deliveryDate?: string;
  outboundNo?: string;
  shippedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  lines?: ShippedSalesLine[];
};

// Formal orders already own a server outbound; only recover historical local records.
export const syncShippedSalesOutbounds = (
  storage: StoragePort,
  tenantId: string | undefined,
  orders: ShippedSalesOrder[],
  now = new Date(),
): SalesOutboundTask[] => {
  const tasks = loadSalesOutboundTasks(storage, tenantId);
  let changed = false;
  for (const order of orders) {
    if (!order.id || order.aggregateId || order.formalOrder
      || !(order.status === '已发货' || (order.status === '已完成' && order.outStatus === '全部发货'))) continue;
    const existingIndex = tasks.findIndex(task => task.source === order.id && task.status !== '已取消');
    const existing = tasks[existingIndex];
    if (existing?.status === '已出库') continue;

    const sourceLines = order.lines?.length ? order.lines : [{
      productId: order.productId,
      productName: order.productName || order.product,
      qty: order.qty,
      unit: order.unit,
    }];
    const lines = sourceLines.map(line => ({
      productId: line.productId || '',
      productName: line.productName || line.productId || order.productName || order.product || '-',
      spec: line.spec,
      qty: Number(line.qty ?? line.quantity ?? 0),
      unit: line.unit || order.unit || '件',
      unitPrice: line.unitPrice,
      shippedQty: Number(line.qty ?? line.quantity ?? 0),
    }));
    let total = '0';
    try {
      for (const line of lines) {
        if (compareQuantity(String(line.qty), '0') <= 0) throw new Error('Invalid shipped quantity');
        total = addQuantity(total, String(line.qty));
      }
    } catch {
      continue;
    }
    const shippedAt = order.shippedAt || order.updatedAt || order.createdAt || now.toISOString();
    const task: SalesOutboundTask = {
      ...existing,
      id: existing?.id || order.outboundNo || `OUT-SALES-${order.id}`,
      type: '销售发货',
      source: order.id,
      customer: order.client || existing?.customer || '-',
      amount: order.amount || existing?.amount,
      item: order.product || lines.map(line => `${line.productId} ${line.productName}`.trim()).join('；'),
      productId: lines[0]?.productId || existing?.productId,
      qty: Number(total),
      shippedQty: Number(total),
      unit: order.unit || lines[0]?.unit || '件',
      warehouse: order.warehouseId || order.warehouse || existing?.warehouse || '成品主仓',
      dueDate: order.deliveryDate || existing?.dueDate,
      lines,
      date: existing?.date || shippedAt,
      status: '已出库',
      shortageQty: 0,
      operator: existing?.operator || order.salesman || '销售同步',
      shippedAt,
    };
    if (existingIndex >= 0) tasks[existingIndex] = task;
    else tasks.unshift(task);
    changed = true;
  }
  if (changed) {
    saveSalesOutboundTasks(storage, tenantId, tasks);
  }
  return tasks;
};

export const restoreShippedSalesOutbounds = (
  storage: StoragePort,
  tenantId?: string,
): SalesOutboundTask[] => {
  let orders: ShippedSalesOrder[] = [];
  try {
    const workspace = JSON.parse(storage.getItem(salesWorkspaceStorageKey(tenantId)) || '{}');
    if (Array.isArray(workspace.orders)) {
      orders = workspace.orders.filter(order => order && typeof order === 'object');
    }
  } catch {
    // Damaged sales history must not hide existing outbound records.
  }
  try {
    return syncShippedSalesOutbounds(storage, tenantId, orders);
  } catch {
    return loadSalesOutboundTasks(storage, tenantId);
  }
};
