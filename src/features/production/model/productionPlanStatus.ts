export type ProductionDemandLike = {
  status: string;
  acceptedAt?: string | null;
};

export const mapProductionDemandStatus = (demand: ProductionDemandLike) => {
  if (demand.status === 'RECEIVED') return '待校验';
  if (demand.status === 'BLOCKED') return '校验阻断';
  if (demand.status === 'PENDING_REVIEW') return '待审批';
  if (demand.status === 'APPROVED') return demand.acceptedAt ? '待展算' : '待接收';
  if (demand.status === 'PLANNED') return '已展算';
  if (demand.status === 'REJECTED') return '已驳回';
  return demand.status;
};

type DemandSource = {
  sourceId?: string; sourceLineId?: string; salesOrderId?: string; salesOrderLineId?: string;
  shipmentRequestId?: string; shipmentRequestLineId?: string; inventoryWarehouseId?: string;
  inventoryFactVersion?: number; correlationId?: string; traceId?: string;
  payloadSnapshot?: {
    salesOrderId?: string; salesOrderLineId?: string; warehouseId?: string; inventoryWarehouseId?: string;
    inventoryFactVersion?: number; correlationId?: string; traceId?: string;
  };
};

export const normalizeProductionDemandTrace = (demand: { source?: DemandSource | null; correlationId?: string }) => {
  if (!demand.source) return null;
  const source = demand.source;
  const payload = source.payloadSnapshot;
  return {
    ...source,
    salesOrderId: source.salesOrderId || payload?.salesOrderId || source.sourceId || "",
    salesOrderLineId: source.salesOrderLineId || payload?.salesOrderLineId || source.sourceLineId || "",
    inventoryWarehouseId: source.inventoryWarehouseId || payload?.inventoryWarehouseId || payload?.warehouseId || "",
    inventoryFactVersion: source.inventoryFactVersion ?? payload?.inventoryFactVersion,
    correlationId: source.correlationId || payload?.correlationId || demand.correlationId || "",
    traceId: source.traceId || payload?.traceId || "",
  };
};

export const planningResultCoversDemand = (result: unknown, demandId: string) => {
  const mpsLines = (result as { mpsLines?: Array<{ demandId?: string }> } | undefined)?.mpsLines;
  return Array.isArray(mpsLines) && mpsLines.some((line) => line.demandId === demandId);
};

export const scheduleResultCoversDemand = (result: unknown, demandId: string) => {
  const candidates = (result as { scheduleCandidates?: Array<{ demandIds?: string[]; published?: boolean }> } | undefined)?.scheduleCandidates;
  return Array.isArray(candidates) && candidates.some((candidate) =>
    candidate.published !== false && (candidate.demandIds ?? []).includes(demandId),
  );
};

export const planningMaterialShortages = (result: unknown) =>
  (result as { materialShortages?: Array<Record<string, unknown>> } | undefined)?.materialShortages ?? [];

type PlannedDemandLike = {
  id: string;
  code: string;
  sourceType: string;
  productId: string;
  productName?: string;
  status: string;
  mrpTaskId?: string;
  scheduleCandidateId?: string;
  workOrderId?: string;
  workOrderCode?: string;
  source?: DemandSource;
};

type PlanningTaskLike = {
  id: string;
  status: string;
  result?: unknown;
};

export const recoverMpsFromPlannedDemand = (demand: PlannedDemandLike, task: PlanningTaskLike) => {
  if (demand.status !== "PLANNED" || !demand.mrpTaskId || task.id !== demand.mrpTaskId || task.status !== "SUCCEEDED") {
    return null;
  }
  const mpsLines = (task.result as { mpsLines?: Array<{
    demandId?: string; plannedQty?: string; dueDate?: string;
  }> } | undefined)?.mpsLines;
  const line = mpsLines?.find((item) => item.demandId === demand.id);
  if (!line || !planningResultCoversDemand(task.result, demand.id)) return null;

  return {
    id: `MPS-${demand.id.slice(0, 8)}`,
    taskId: task.id,
    demandSource: demand.sourceType === "SALES_ORDER_SHORTAGE"
      ? "销售缺货"
      : demand.sourceType === "RUSH_ORDER" ? "订单加急" : "普通生产",
    source: `${demand.sourceType === "SALES_ORDER_SHORTAGE" ? "销售缺货" : "普通生产"} (销售订单 / 生产服务)`,
    product: `${demand.productId} - ${demand.productName || demand.productId}`,
    quantity: Number(line.plannedQty || 0),
    date: line.dueDate || "",
    status: demand.workOrderId ? "已建工单" : demand.scheduleCandidateId ? "已排程" : "已展算",
    scheduleCandidateId: demand.scheduleCandidateId,
    workOrderId: demand.workOrderId,
    workOrderCode: demand.workOrderCode,
    formalMps: true,
    priority: "紧急",
    sourceSalesOrder: normalizeProductionDemandTrace(demand)?.salesOrderId || "",
    sourceFactVersion: normalizeProductionDemandTrace(demand)?.inventoryFactVersion,
    sourceCustomer: "业务来源",
    demandId: demand.id,
  };
};
