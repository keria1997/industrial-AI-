import {
  AuditSnapshot, CloseRequest, Completion, CompletionAllocation, Demand, DemandSource, IdempotencyRecord,
  InboxEvent, Inspection, InventoryAvailability, OperationTask, OutboxEvent, ReportCorrection, ReworkOrder,
  SalesOrderIntake, StatusHistory, WorkOrder,
  WorkOrderDemand, WorkReport,
} from "./types.js";

export interface ListQuery {
  status?: string;
  factoryResourceId?: string;
  search?: string;
  limit: number;
  offset: number;
}

export interface ListResult<T> { items: T[]; total: number }

export interface ProductionRepository {
  transaction<T>(work: (repository: ProductionRepository) => Promise<T>): Promise<T>;

  listDemands(tenantId: string, query: ListQuery): Promise<ListResult<Demand>>;
  getDemand(tenantId: string, id: string): Promise<Demand | undefined>;
  getDemandSource(tenantId: string, demandId: string): Promise<DemandSource | undefined>;
  insertDemand(value: Demand, source?: DemandSource): Promise<void>;
  updateDemand(value: Demand, expectedVersion: number): Promise<boolean>;

  listWorkOrders(tenantId: string, query: ListQuery): Promise<ListResult<WorkOrder>>;
  getWorkOrder(tenantId: string, id: string): Promise<WorkOrder | undefined>;
  insertWorkOrder(value: WorkOrder, demandLinks: WorkOrderDemand[]): Promise<void>;
  updateWorkOrder(value: WorkOrder, expectedVersion: number): Promise<boolean>;
  listWorkOrderDemands(tenantId: string, workOrderId: string): Promise<WorkOrderDemand[]>;

  insertWorkReport(value: WorkReport): Promise<void>;
  getWorkReport(tenantId: string, id: string): Promise<WorkReport | undefined>;
  listWorkReports(tenantId: string, workOrderId: string): Promise<WorkReport[]>;
  updateWorkReport(value: WorkReport, expectedVersion: number): Promise<boolean>;
  insertReportCorrection(value: ReportCorrection, replacement: WorkReport): Promise<void>;

  insertInspection(value: Inspection): Promise<void>;
  getInspection(tenantId: string, id: string): Promise<Inspection | undefined>;
  listInspections(tenantId: string, workOrderId?: string): Promise<Inspection[]>;
  updateInspection(value: Inspection, expectedVersion: number): Promise<boolean>;
  insertReworkOrder(value: ReworkOrder): Promise<void>;

  insertCompletion(value: Completion): Promise<void>;
  getCompletion(tenantId: string, id: string): Promise<Completion | undefined>;
  listCompletions(tenantId: string, workOrderId?: string): Promise<Completion[]>;
  updateCompletion(value: Completion, expectedVersion: number): Promise<boolean>;
  insertCompletionAllocations(values: CompletionAllocation[]): Promise<void>;
  listCompletionAllocations(tenantId: string, completionId: string): Promise<CompletionAllocation[]>;
  serialNumbersExist(tenantId: string, serialNumbers: string[]): Promise<string[]>;

  insertCloseRequest(value: CloseRequest): Promise<void>;
  getCloseRequest(tenantId: string, id: string): Promise<CloseRequest | undefined>;
  listCloseRequests(tenantId: string, workOrderId: string): Promise<CloseRequest[]>;
  updateCloseRequest(value: CloseRequest, expectedVersion: number): Promise<boolean>;
  hasBlockingMaterialTransactions(tenantId: string, workOrderId: string): Promise<boolean>;

  insertTask(value: OperationTask): Promise<void>;
  getTask(tenantId: string, id: string): Promise<OperationTask | undefined>;
  findSucceededPlanningTaskByCandidate(tenantId: string, candidateId: string): Promise<OperationTask | undefined>;
  findSucceededMrpTaskByDemand(tenantId: string, demandId: string): Promise<OperationTask | undefined>;
  updateTask(value: OperationTask): Promise<void>;

  addStatusHistory(value: StatusHistory): Promise<void>;
  addOutboxEvent(value: OutboxEvent): Promise<void>;
  listPendingOutboxEvents(tenantId: string, eventType?: string): Promise<OutboxEvent[]>;
  markOutboxEventPublished(tenantId: string, eventId: string): Promise<void>;
  markOutboxEventFailed(tenantId: string, eventId: string, error: string, maxAttempts: number): Promise<void>;
  addAudit(value: AuditSnapshot): Promise<void>;
  getIdempotency(tenantId: string, commandType: string, key: string): Promise<IdempotencyRecord | undefined>;
  saveIdempotency(value: IdempotencyRecord): Promise<boolean>;

  getInventoryAvailability(tenantId: string, productId: string, inventoryWarehouseId: string): Promise<InventoryAvailability | undefined>;
  upsertInventoryAvailability(value: InventoryAvailability): Promise<"CREATED" | "UPDATED" | "STALE">;
  getInboxEvent(tenantId: string, consumerName: string, eventId: string): Promise<InboxEvent | undefined>;
  addInboxEvent(value: InboxEvent): Promise<boolean>;
  lockSalesOrderIntake(tenantId: string, salesOrderId: string, sourceLineId: string, sourceRevision: number): Promise<void>;
  insertSalesOrderIntake(value: SalesOrderIntake): Promise<void>;
  getSalesOrderIntake(tenantId: string, salesOrderId: string, sourceLineId: string, sourceRevision: number): Promise<SalesOrderIntake | undefined>;
}
