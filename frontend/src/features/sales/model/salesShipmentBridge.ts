import type { StoragePort } from '../../inventory/model/salesOutboundBridge';

export type SalesShipmentResult = {
  orderId: string;
  outboundId: string;
  shippedAt: string;
  operator: string;
  partial?: boolean;
  shippedQty?: number;
  lineShipments?: Array<{ productId: string; shipQty: number }>;
};

export type SalesProductionRequestResult = {
  orderId: string;
  availableQty: number;
  shortageQty: number;
  inventoryFactVersion: number;
  intakeId: string;
  productionDemandId?: string;
  productionDemandCode?: string;
  requestedAt: string;
  operator: string;
};

export const salesWorkspaceStorageKey = (tenantId?: string) =>
  `industrial-ai-sales:v8:${tenantId || 'default'}`;

type SalesWorkspace = {
  schemaVersion: number;
  orders: Array<Record<string, unknown> & { id: string }>;
  audits: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

const updateWorkspace = (
  storage: StoragePort,
  tenantId: string | undefined,
  orderId: string,
  update: (order: SalesWorkspace['orders'][number]) => SalesWorkspace['orders'][number],
  audit: Record<string, unknown>,
) => {
  try {
    const key = salesWorkspaceStorageKey(tenantId);
    const workspace = JSON.parse(storage.getItem(key) || '{}') as Partial<SalesWorkspace>;
    if (!Array.isArray(workspace.orders)) return false;
    let found = false;
    const orders = workspace.orders.map((order) => {
      if (order.id !== orderId) return order;
      found = true;
      return update(order);
    });
    if (!found) return false;
    storage.setItem(key, JSON.stringify({
      ...workspace,
      schemaVersion: 8,
      orders,
      audits: [audit, ...(Array.isArray(workspace.audits) ? workspace.audits : [])],
    }));
    return true;
  } catch {
    return false;
  }
};

export const recordSalesOrderShipped = (
  storage: StoragePort,
  tenantId: string | undefined,
  result: SalesShipmentResult,
): boolean => {
  return updateWorkspace(
    storage,
    tenantId,
    result.orderId,
    (order) => {
      const prevShippedQty = Number(order.shippedQty || 0);
      const currentShippedQty = Number(result.shippedQty || 0);
      const accumulatedShippedQty = prevShippedQty + currentShippedQty;

      // Update per-line shippedQty if lines exist and lineShipments provided
      let updatedLines = order.lines;
      if (Array.isArray(order.lines) && result.lineShipments && result.lineShipments.length > 0) {
        updatedLines = order.lines.map((line) => {
          const shipment = result.lineShipments.find((ls) => ls.productId === line.productId);
          if (!shipment) return line;
          const prevLineShipped = Number(line.shippedQty || 0);
          return { ...line, shippedQty: prevLineShipped + shipment.shipQty };
        });
      }

      // Determine full vs partial: check if all lines are fully shipped
      let isFullShipment = false;
      if (Array.isArray(updatedLines) && updatedLines.length > 0) {
        isFullShipment = updatedLines.every((line) => Number(line.shippedQty || 0) >= Number(line.qty || 0));
      } else {
        isFullShipment = accumulatedShippedQty >= Number(order.qty || 0);
      }
      const isPartial = !isFullShipment;

      return {
        ...order,
        lines: updatedLines,
        status: isPartial ? '部分发货' : '已发货',
        outStatus: isPartial ? '部分发货' : '全部发货',
        shippedQty: accumulatedShippedQty,
        receivable: order.amount || '待生成',
        outboundNo: result.outboundId,
        shippedAt: result.shippedAt,
        updatedAt: result.shippedAt,
      };
    },
    { action: '库存确认销售出库', entityId: result.orderId, operator: result.operator, time: result.shippedAt },
  );
};

export const recordSalesOrderProductionRequested = (
  storage: StoragePort,
  tenantId: string | undefined,
  result: SalesProductionRequestResult,
): boolean => updateWorkspace(
  storage,
  tenantId,
  result.orderId,
  (order) => ({
    ...order,
    status: Number(order.shippedQty || 0) > 0 ? '部分发货' : '生产中',
    availableStock: result.availableQty,
    shortage: result.shortageQty,
    inventoryFactVersion: result.inventoryFactVersion,
    intakeId: result.intakeId,
    productionDemandId: result.productionDemandId,
    productionDemandCode: result.productionDemandCode,
    updatedAt: result.requestedAt,
  }),
  { action: '仓库发起生产申请', entityId: result.orderId, operator: result.operator, time: result.requestedAt },
);
