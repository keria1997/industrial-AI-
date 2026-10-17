import type { CompletionDto, InspectionDto, WorkOrderDto } from "../../../api/production/operations";

export function formalProductionOrder(order: WorkOrderDto) {
  const status: Record<string, string> = {
    PLANNED: order.kittingStatus === "READY" ? "齐套待下发" : "待检查",
    SCHEDULED: "齐套待下发", KITTING: "待检查", RELEASED: "已下达",
    IN_PROGRESS: "执行中", PAUSED: "已暂停", COMPLETED: "已完工", CLOSING: "结案待复核", CLOSED: "已结案",
  };
  return {
    id: order.code, apiId: order.id, formalOrder: order, source: "生产需求",
    product: `${order.productId} - ${order.productName || order.productId}`,
    quantity: Number(order.plannedQty), dueDate: order.dueDate, startDate: undefined, endDate: undefined,
    status: status[order.status] || order.status, kitting: order.kittingStatus === "READY" ? "100%" : "-",
    completedQty: Number(order.reportedGoodQty),
  };
}

export function formalProductionJob(order: WorkOrderDto) {
  const status = order.status === "RELEASED" ? "未开工" : order.status === "PAUSED" ? "已暂停"
    : ["COMPLETED", "CLOSING", "CLOSED"].includes(order.status) ? "已完工"
    : order.status === "IN_PROGRESS" ? "进行中" : "状态待核实";
  return {
    id: `JOB-${order.code}`, orderId: order.code, apiId: order.id, formalOrder: order,
    opName: `${order.productName || order.productId} · 工单汇总`,
    targetQty: Number(order.plannedQty), okQty: Number(order.reportedGoodQty), ngQty: Number(order.reportedDefectQty),
    scrapQty: Number(order.reportedScrapQty), status, machineId: order.workCenterResourceId,
    uom: order.uom,
  };
}

export function formalProductionInspection(inspection: InspectionDto, orders: WorkOrderDto[] = [], completions: CompletionDto[] = []) {
  const order = orders.find(value => value.id === inspection.workOrderId);
  const completion = completions.find(value => value.inspectionId === inspection.id);
  const status = completion ? completion.status === "POSTED" ? "已入库" : completion.status === "FAILED" ? "入库失败" : "入库处理中"
    : ["CREATED", "REINSPECTION"].includes(inspection.status) ? "待检验"
    : ["PASSED", "SCRAPPED", "REWORKED"].includes(inspection.status) ? Number(inspection.passedQty) > 0 ? "待入库" : "已处置"
    : inspection.status === "REWORK" ? inspection.reinspectionId ? "复检处理中" : "返工处理中" : "待质量处置";
  return {
    id: inspection.code, apiId: inspection.id, formalInspection: inspection, completionId: completion?.id,
    orderId: order?.code || inspection.workOrderId, product: order?.productName || order?.productId || "FQC",
    type: "FQC(完工检)", sampleQty: Number(inspection.sampleQty), status,
    okQty: Number(inspection.passedQty), ngQty: Number(inspection.failedQty),
    stockTx: completion?.externalTransactionId,
    result: completion?.failureMessage || (inspection.failedQty === "0" ? ""
      : inspection.status === "REWORKED" ? "返工复检已完成"
      : inspection.status === "SCRAPPED" ? "已审批报废"
      : inspection.status === "REWORK" ? inspection.reinspectionId ? "等待复检结果" : "返工处理中"
      : "待质量主管处置"),
  };
}
