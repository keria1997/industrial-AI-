import { apiRequest, type ApiContext } from "../client";

export type DemandTraceability = {
  sourceSystem: string;
  sourceType: string;
  salesOrderId?: string;
  salesOrderLineId?: string;
  shipmentRequestId?: string;
  shipmentRequestLineId?: string;
  inventoryWarehouseId?: string;
  inventoryFactVersion?: number;
  payloadSnapshot?: { warehouseId?: string; inventoryWarehouseId?: string };
  correlationId: string;
  traceId?: string;
};

export type DemandDto = {
  id: string; code: string; sourceType: string; productId: string; productName?: string; qty: string; uom: string;
  dueDate: string; factoryResourceId: string; status: string; blockReasons: string[]; createdBy: string; version: number;
  correlationId: string; updatedAt: string; sourceDescription?: string;
  reviewerId?: string; approvedBy?: string; approvedAt?: string;
  handlerRole?: string; handlerId?: string; assignedAt?: string; acceptedAt?: string; mrpTaskId?: string;
  source?: DemandTraceability;
  inventoryWarehouseId?: string; scheduleCandidateId?: string; workOrderId?: string; workOrderCode?: string;
};

export type BomSnapshot = {
  id: string; productId: string; productName?: string; version: number;
  routingSnapshotId: string; updatedAt?: string; publishedBy?: string; status?: string;
  lines: Array<{ materialId: string; materialName?: string; warehouseId: string; qtyPer: string; uom: string }>;
  routingSnapshot: {
    id: string; productId: string;
    operations: Array<{ sequence: number; code: string; name: string; workCenterResourceId: string; standardMinutes: string }>;
  };
};

export type WorkOrderDto = {
  id: string; code: string; productId: string; productName?: string; factoryResourceId: string; workCenterResourceId: string;
  plannedQty: string; inputQty: string; reportedGoodQty: string; reportedDefectQty: string; reportedScrapQty: string;
  postedQty: string; uom: string; dueDate: string; status: string; kittingStatus?: string; correlationId: string;
  parameterSnapshot?: { inventoryWarehouseId?: string; demandIds?: Array<{ demandId: string; allocatedQty: string }> };
  createdBy: string; version: number; updatedAt: string;
  qualityRecoveredQty?: string;
};

export type InspectionDto = {
  id: string; code: string; workOrderId: string; sampleQty: string; passedQty: string; failedQty: string;
  status: string; inspectorId?: string; version: number; createdAt: string;
  parentInspectionId?: string; reworkOrderId?: string; reinspectionId?: string;
};

export type DashboardDto = {
  kpis: { activeWorkOrders: number; overdueWorkOrders: number; completionRatePercent: number; pendingDemands: number; openFqc: number };
  risks: Array<{ type: string; workOrderId: string; code: string; dueDate: string; status: string }>;
  updatedAt: string;
};

export type CompletionDto = {
  id: string; code: string; workOrderId: string; inspectionId: string; qty: string; uom: string; status: string;
  taskId: string; externalTransactionId?: string; failureMessage?: string; version: number; updatedAt: string;
};

export type CloseRequestDto = { id: string; workOrderId: string; status: string; submittedBy: string; version: number };
export type ReportQuantities = { goodQty: string; defectQty: string; scrapQty: string; inputQty: string; remark?: string };

export type OperationTaskDto = {
  id: string; taskType: string; aggregateType?: string; aggregateId?: string; status: string; progress: number;
  retryCount: number; maxRetryCount: number; input: Record<string, unknown>; result?: unknown; errorCode?: string;
  errorMessage?: string; traceId: string; createdBy: string; createdAt: string; updatedAt: string;
};

export type PlanningTaskAcceptedDto = {
  taskId: string; status: string; progress: number; traceId: string;
  result?: {
    solver?: string;
    canProceedToAps?: boolean;
    materialShortages?: Array<{ demandId: string; demandCode: string; materialId: string; materialName?: string; warehouseId: string; grossRequiredQty: string; availableQty: string; shortageQty: string; uom: string; requiredDate: string; inventoryFactVersion: number }>;
    mpsLines?: Array<{ demandId: string; demandCode: string; productId: string; plannedQty: string; uom: string; dueDate: string }>;
    scheduleCandidates?: Array<{ id: string; demandIds: string[]; factoryResourceIds: string[]; startAt: string; dueDate: string; published: boolean }>;
    completedAt?: string;
  };
};

export const productionOperationsApi = {
  listBoms: (context: ApiContext) => apiRequest<BomSnapshot[]>("/api/v1/production/bom-snapshots", context),
  publishBom: (context: ApiContext, bom: Omit<BomSnapshot, "id" | "version">, version?: number, key?: string) =>
    apiRequest<BomSnapshot>("/api/v1/production/bom-snapshots", context, {
      method: "POST", body: JSON.stringify(bom), expectedVersion: version,
      idempotencyKey: key ?? `bom-publish:${context.tenantId}:${bom.productId}:${crypto.randomUUID()}`,
    }),
  readiness: (context: ApiContext) => apiRequest<{ permissions: string[] }>("/api/v1/production/readiness", context),
  dashboard: (context: ApiContext) => apiRequest<DashboardDto>("/api/v1/production/dashboard/kpis", context),
  listDemands: (context: ApiContext) => apiRequest<{ items: DemandDto[]; total: number }>("/api/v1/production/demands?page=1&pageSize=200", context),
  validateDemand: (context: ApiContext, demand: DemandDto) => apiRequest<DemandDto>(`/api/v1/production/demands/${demand.id}/validate`, context, {
    method: "POST", body: JSON.stringify({ productActive: true, factoryActive: true, bomEffective: true, routingEffective: true }),
    expectedVersion: demand.version, idempotencyKey: `demand-validate:${context.tenantId}:${demand.id}:${demand.version}`,
  }),
  approveDemand: (context: ApiContext, demand: DemandDto) => apiRequest<DemandDto>(`/api/v1/production/demands/${demand.id}/approve`, context, {
    method: "POST", body: JSON.stringify({ remark: "生产作业台复核通过" }), expectedVersion: demand.version,
    idempotencyKey: `demand-approve:${context.tenantId}:${demand.id}:${demand.version}`,
  }),
  claimDemand: (context: ApiContext, demand: DemandDto) => apiRequest<DemandDto>(`/api/v1/production/demands/${demand.id}/claim`, context, {
    method: "POST", expectedVersion: demand.version,
    idempotencyKey: `demand-claim:${context.tenantId}:${demand.id}:${demand.version}`,
  }),
  listWorkOrders: (context: ApiContext) => apiRequest<{ items: WorkOrderDto[]; total: number }>("/api/v1/production/work-orders?page=1&pageSize=200", context),
  getWorkOrder: (context: ApiContext, id: string) => apiRequest<WorkOrderDto>(`/api/v1/production/work-orders/${id}`, context),
  createDemand: (context: ApiContext, input: Record<string, unknown>, key: string) => apiRequest<DemandDto>("/api/v1/production/demands", context, {
    method: "POST", body: JSON.stringify(input), idempotencyKey: key,
  }),
  createWorkOrder: (context: ApiContext, input: Record<string, unknown>, businessKey: string) => apiRequest<WorkOrderDto>("/api/v1/production/work-orders", context, {
    method: "POST", body: JSON.stringify(input), idempotencyKey: businessKey,
  }),
  releaseImpact: (context: ApiContext, orderId: string) => apiRequest<{ canRelease: boolean; blockers: Array<{ code: string; message: string; repairAction: string }>; version: number }>(`/api/v1/production/work-orders/${orderId}/release-impact`, context, { method: "POST" }),
  checkKitting: (context: ApiContext, order: WorkOrderDto) => apiRequest<WorkOrderDto>(`/api/v1/production/work-orders/${order.id}/kitting-check`, context, {
    method: "POST", body: "{}", expectedVersion: order.version, idempotencyKey: `kitting:${context.tenantId}:${order.id}:${order.version}`,
  }),
  workOrderCommand: (context: ApiContext, order: WorkOrderDto, command: "release" | "start" | "pause" | "resume", reason?: string) =>
    apiRequest<WorkOrderDto>(`/api/v1/production/work-orders/${order.id}/${command}`, context, {
      method: "POST", body: JSON.stringify(reason ? { reason } : {}), expectedVersion: order.version,
      idempotencyKey: `work-order-${command}:${context.tenantId}:${order.id}:${order.version}`,
    }),
  submitReport: (context: ApiContext, order: WorkOrderDto, quantities: string | ReportQuantities) => apiRequest<{ workOrder: WorkOrderDto }>(`/api/v1/production/work-orders/${order.id}/report`, context, {
    method: "POST", body: JSON.stringify({ ...(typeof quantities === "string" ? { goodQty: quantities, defectQty: "0", scrapQty: "0", inputQty: "0" } : quantities), uom: order.uom, source: "WEB" }),
    expectedVersion: order.version, idempotencyKey: `work-report:${context.tenantId}:${order.id}:${order.version}`,
  }),
  listInspections: (context: ApiContext) => apiRequest<InspectionDto[]>("/api/v1/production/inspections", context),
  createInspection: (context: ApiContext, order: WorkOrderDto, qty: string) => apiRequest<InspectionDto>("/api/v1/production/inspections", context, {
    method: "POST", body: JSON.stringify({ workOrderId: order.id, sampleQty: qty }),
    idempotencyKey: `inspection-create:${context.tenantId}:${order.id}:${order.version}:${qty}`,
  }),
  passInspection: (context: ApiContext, inspection: InspectionDto) => apiRequest<InspectionDto>(`/api/v1/production/inspections/${inspection.id}/result`, context, {
    method: "POST", body: JSON.stringify({ passedQty: inspection.sampleQty, failedQty: "0", reason: "FQC 检验合格" }),
    expectedVersion: inspection.version, idempotencyKey: `inspection-pass:${context.tenantId}:${inspection.id}:${inspection.version}`,
  }),
  inspectionResult: (context: ApiContext, inspection: InspectionDto, passedQty: string, failedQty: string) =>
    apiRequest<InspectionDto>(`/api/v1/production/inspections/${inspection.id}/result`, context, {
      method: "POST", body: JSON.stringify({ passedQty, failedQty, reason: "FQC 检验结果" }),
      expectedVersion: inspection.version, idempotencyKey: `inspection-result:${context.tenantId}:${inspection.id}:${inspection.version}`,
    }),
  disposition: (context: ApiContext, inspection: InspectionDto, type: "rework" | "scrap") =>
    apiRequest<InspectionDto | { inspection: InspectionDto }>(`/api/v1/production/inspections/${inspection.id}/${type}`, context, {
      method: "POST", body: JSON.stringify({ qty: inspection.failedQty, reason: type === "rework" ? "质量返工" : "质量主管审批报废" }),
      expectedVersion: inspection.version, idempotencyKey: `disposition:${context.tenantId}:${inspection.id}:${type}:${inspection.version}`,
    }),
  completeRework: (context: ApiContext, inspection: InspectionDto) => apiRequest<InspectionDto>(`/api/v1/production/rework-orders/${inspection.reworkOrderId}/complete`, context, {
    method: "POST", body: "{}", idempotencyKey: `rework-complete:${context.tenantId}:${inspection.reworkOrderId}`,
  }),
  retryCompletion: (context: ApiContext, completionId: string) => apiRequest<unknown>(`/api/v1/production/completions/${completionId}/retry`, context, {
    method: "POST", body: "{}", idempotencyKey: `completion-retry:${context.tenantId}:${completionId}:${crypto.randomUUID()}`,
  }),
  createCompletion: (context: ApiContext, order: WorkOrderDto, inspection: InspectionDto, inventoryWarehouseId: string) => apiRequest<{ completionId: string; taskId: string; status: string; traceId: string }>(`/api/v1/production/work-orders/${order.id}/complete`, context, {
    method: "POST",
    body: JSON.stringify({ inspectionId: inspection.id, qty: inspection.passedQty, uom: order.uom, warehouseResourceId: inventoryWarehouseId, inventoryWarehouseId, traceMode: "NONE", productionDate: new Date().toISOString().slice(0, 10), allocationRevision: 1 }),
    idempotencyKey: `completion-create:${context.tenantId}:${order.id}:${inspection.id}:${inspection.version}`,
  }),
  getCompletion: (context: ApiContext, completionId: string) => apiRequest<CompletionDto>(`/api/v1/production/completions/${completionId}`, context),
  waitForCompletion: async (context: ApiContext, completionId: string) => {
    let completion = await productionOperationsApi.getCompletion(context, completionId);
    for (let attempt = 0; completion.status === "POSTING" && attempt < 10; attempt++) {
      await new Promise(resolve => window.setTimeout(resolve, 1000));
      completion = await productionOperationsApi.getCompletion(context, completionId);
    }
    return completion;
  },
  listCompletions: (context: ApiContext) => apiRequest<CompletionDto[]>("/api/v1/production/completions", context),
  listCloses: (context: ApiContext) => apiRequest<CloseRequestDto[]>("/api/v1/production/work-order-closes", context),
  submitClose: (context: ApiContext, order: WorkOrderDto) => apiRequest<CloseRequestDto>(`/api/v1/production/work-orders/${order.id}/close`, context, {
    method: "POST", body: "{}", expectedVersion: order.version, idempotencyKey: `close:${context.tenantId}:${order.id}:${order.version}`,
  }),
  approveClose: (context: ApiContext, close: CloseRequestDto) => apiRequest<unknown>(`/api/v1/production/work-order-closes/${close.id}/approve`, context, {
    method: "POST", body: "{}", expectedVersion: close.version, idempotencyKey: `close-approve:${context.tenantId}:${close.id}:${close.version}`,
  }),
  startPlanningTask: (context: ApiContext, type: "MRP" | "APS", demandIds: string[], runId: string) =>
    apiRequest<PlanningTaskAcceptedDto>(type === "MRP" ? "/api/v1/production/mrp-runs" : "/api/v1/production/schedule-runs", context, {
      method: "POST",
      body: JSON.stringify({ demandIds }),
      idempotencyKey: `planning-${type.toLowerCase()}:${context.tenantId}:${runId}`,
    }),
  getTask: (context: ApiContext, taskId: string) => apiRequest<OperationTaskDto>(`/api/v1/production/tasks/${taskId}`, context),
};
