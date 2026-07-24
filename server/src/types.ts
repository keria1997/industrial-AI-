export type DemandStatus =
  | "RECEIVED" | "VALIDATING" | "PENDING_REVIEW" | "APPROVED" | "PLANNED" | "FULFILLED"
  | "BLOCKED" | "REJECTED" | "CANCELLED" | "MERGED";

export type WorkOrderStatus =
  | "DRAFT" | "PLANNED" | "SCHEDULED" | "KITTING" | "RELEASED" | "IN_PROGRESS" | "PAUSED"
  | "COMPLETED" | "CLOSING" | "CLOSED" | "CANCELLING" | "CANCELLED";

export type InspectionStatus =
  | "CREATED" | "SAMPLING" | "INSPECTING" | "PASSED" | "FAILED" | "DISPOSITION_PENDING"
  | "REWORK" | "REINSPECTION" | "SCRAP_PENDING" | "SCRAPPED";

export type CompletionStatus = "DRAFT" | "SUBMITTED" | "POSTING" | "POSTED" | "FAILED" | "REVERSING" | "REVERSED";
export type TaskStatus = "PENDING" | "RUNNING" | "RETRY_WAIT" | "SUCCEEDED" | "DEAD_LETTER" | "MANUAL_INTERVENTION" | "CANCELLED";

export interface RequestContext {
  tenantId: string;
  actorId: string;
  employeeId?: string;
  permissions: Set<string>;
  permissionVersion: string;
  traceId: string;
  idempotencyKey?: string;
  expectedVersion?: number;
  ipAddress?: string;
  userAgent?: string;
}

export interface Demand {
  id: string; tenantId: string; code: string; sourceType: string; productId: string; productName?: string;
  qty: string; uom: string; dueDate: string; priority: number; factoryResourceId: string; status: DemandStatus;
  revision: number; correlationId: string; blockReasons: string[]; createdBy: string; version: number;
  createdAt: string; updatedAt: string;
}

export interface DemandSource {
  id: string; tenantId: string; demandId: string; sourceSystem: string; sourceType: string; sourceId: string;
  sourceLineId?: string; sourceRevision: number; qty: string; payloadSnapshot: Record<string, unknown>;
}

export interface WorkOrderDemand {
  id: string; tenantId: string; workOrderId: string; demandId: string; allocatedQty: string;
  priorityRank: number; customerLocked: boolean; promisedDate?: string;
}

export interface WorkOrder {
  id: string; tenantId: string; code: string; productId: string; productName?: string; factoryResourceId: string;
  workshopResourceId?: string; lineResourceId?: string; workCenterResourceId: string; plannedQty: string; inputQty: string;
  reportedGoodQty: string; reportedDefectQty: string; reportedScrapQty: string; postedQty: string; uom: string;
  dueDate: string; status: WorkOrderStatus; bomSnapshotId?: string; routingSnapshotId?: string;
  scheduleCandidateId?: string; kittingCheckId?: string; kittingStatus?: "READY" | "PARTIAL_READY" | "SHORTAGE" | "EXPIRED";
  assigneeEmployeeId?: string; correlationId: string; parameterSnapshot: Record<string, unknown>;
  createdBy: string; version: number; createdAt: string; updatedAt: string;
}

export interface WorkReport {
  id: string; tenantId: string; workOrderId: string; operationId?: string; goodQty: string; defectQty: string;
  scrapQty: string; inputQty: string; uom: string; status: "POSTED" | "CORRECTED"; reportedBy: string;
  reportedAt: string; source: string; remark?: string; version: number; createdAt: string; updatedAt: string;
}

export interface ReportCorrection {
  id: string; tenantId: string; originalReportId: string; replacementReportId: string; reasonCode: string;
  reason: string; originalSnapshot: WorkReport; correctedSnapshot: WorkReport; status: "POSTED"; createdBy: string; createdAt: string;
}

export interface Inspection {
  id: string; tenantId: string; code: string; workOrderId: string; inspectionType: "FQC";
  parentInspectionId?: string; sampleQty: string; passedQty: string; failedQty: string; status: InspectionStatus;
  inspectorId?: string; inspectedAt?: string; resultReason?: string; createdBy: string; version: number;
  createdAt: string; updatedAt: string;
}

export interface ReworkOrder {
  id: string; tenantId: string; code: string; sourceInspectionId: string; workOrderId: string;
  qty: string; status: "CREATED"; createdBy: string; createdAt: string;
}

export interface CompletionAllocation {
  id: string; tenantId: string; completionId: string; demandId: string; qty: string; rank: number;
  ruleEvidence: Record<string, unknown>; createdAt: string;
}

export interface Completion {
  id: string; tenantId: string; code: string; workOrderId: string; inspectionId: string; qty: string; uom: string;
  warehouseResourceId: string; inventoryWarehouseId: string; binId?: string; traceMode: "NONE" | "BATCH" | "SERIAL";
  batchNo?: string; serialNumbers: string[]; productionDate: string; allocationRevision: number; status: CompletionStatus;
  inventoryIdempotencyKey: string; externalTransactionId?: string; taskId: string; failureCode?: string; failureMessage?: string;
  remark?: string; createdBy: string; postedAt?: string; version: number; createdAt: string; updatedAt: string;
}

export interface CloseRequest {
  id: string; tenantId: string; workOrderId: string; status: "SUBMITTED" | "REVIEW_PENDING" | "APPROVED" | "REJECTED";
  checkSnapshot: CloseCheck; varianceSnapshot: Record<string, unknown>; reason?: string; submittedBy: string;
  submittedAt: string; approvedBy?: string; approvedAt?: string; version: number; createdAt: string; updatedAt: string;
}

export interface CloseCheck {
  canClose: boolean;
  blockers: Array<{ code: string; message: string; repairAction: string }>;
  checkedAt: string;
}

export interface OperationTask {
  id: string; tenantId: string; taskType: string; aggregateType?: string; aggregateId?: string; status: TaskStatus;
  progress: number; retryCount: number; maxRetryCount: number; input: Record<string, unknown>; result?: unknown;
  errorCode?: string; errorMessage?: string; traceId: string; createdBy: string; createdAt: string; updatedAt: string;
}

export interface StatusHistory {
  id: string; tenantId: string; aggregateType: string; aggregateId: string; fromStatus?: string; toStatus: string;
  reasonCode?: string; reason?: string; actorId: string; traceId: string; metadata: Record<string, unknown>; occurredAt: string;
}

export interface OutboxEvent {
  id: string; tenantId: string; eventId: string; eventType: string; eventVersion: number; aggregateType: string;
  aggregateId: string; aggregateVersion: number; correlationId?: string; traceId: string; payload: Record<string, unknown>;
  status: "PENDING"; retryCount: number; createdAt: string;
}

export interface AuditSnapshot {
  id: string; tenantId: string; action: string; aggregateType: string; aggregateId: string; actorAccountId: string;
  actorEmployeeId?: string; permissionVersion: string; beforeSnapshot?: unknown; afterSnapshot?: unknown;
  reason?: string; traceId: string; ipAddress?: string; userAgent?: string; occurredAt: string;
}

export interface IdempotencyRecord {
  tenantId: string; commandType: string; idempotencyKey: string; requestHash: string; responseStatus: number;
  responseBody: unknown; aggregateType?: string; aggregateId?: string; traceId: string; createdAt: string;
}
