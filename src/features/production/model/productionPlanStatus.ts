export type ProductionDemandLike = {
  status: string;
  acceptedAt?: string | null;
};

export const mapProductionDemandStatus = (demand: ProductionDemandLike) => {
  if (['RECEIVED', 'BLOCKED'].includes(demand.status)) return '待校验';
  if (demand.status === 'PENDING_REVIEW') return '待审批';
  if (demand.status === 'APPROVED') return demand.acceptedAt ? '待展算' : '待接收';
  if (demand.status === 'PLANNED') return '已展算';
  if (demand.status === 'REJECTED') return '已驳回';
  return demand.status;
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
  source?: {
    salesOrderId?: string;
    inventoryFactVersion?: number;
  };
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
    status: "已展算",
    formalMps: true,
    priority: "紧急",
    sourceSalesOrder: demand.source?.salesOrderId || "",
    sourceFactVersion: demand.source?.inventoryFactVersion,
    sourceCustomer: "业务来源",
    demandId: demand.id,
  };
};
