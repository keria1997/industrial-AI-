import { ProductionError } from "./errors.js";
import { ListQuery, ListResult, ProductionRepository } from "./store.js";
import {
  AuditSnapshot, CloseRequest, Completion, CompletionAllocation, Demand, DemandSource, IdempotencyRecord,
  Inspection, OperationTask, OutboxEvent, ReportCorrection, ReworkOrder, StatusHistory, WorkOrder,
  WorkOrderDemand, WorkReport,
} from "./types.js";

interface State {
  demands: Map<string, Demand>;
  demandSources: Map<string, DemandSource>;
  workOrders: Map<string, WorkOrder>;
  workOrderDemands: Map<string, WorkOrderDemand>;
  workReports: Map<string, WorkReport>;
  corrections: Map<string, ReportCorrection>;
  inspections: Map<string, Inspection>;
  reworkOrders: Map<string, ReworkOrder>;
  completions: Map<string, Completion>;
  allocations: Map<string, CompletionAllocation>;
  closes: Map<string, CloseRequest>;
  tasks: Map<string, OperationTask>;
  statusHistory: StatusHistory[];
  outbox: OutboxEvent[];
  audits: AuditSnapshot[];
  idempotency: Map<string, IdempotencyRecord>;
  materialTransactionBlockers: Set<string>;
}

function emptyState(): State {
  return {
    demands: new Map(), demandSources: new Map(), workOrders: new Map(), workOrderDemands: new Map(),
    workReports: new Map(), corrections: new Map(), inspections: new Map(), reworkOrders: new Map(),
    completions: new Map(), allocations: new Map(), closes: new Map(), tasks: new Map(), statusHistory: [],
    outbox: [], audits: [], idempotency: new Map(), materialTransactionBlockers: new Set(),
  };
}

function cloneMap<T>(source: Map<string, T>): Map<string, T> {
  return new Map([...source.entries()].map(([key, value]) => [key, structuredClone(value)]));
}

function cloneState(source: State): State {
  return {
    demands: cloneMap(source.demands), demandSources: cloneMap(source.demandSources), workOrders: cloneMap(source.workOrders),
    workOrderDemands: cloneMap(source.workOrderDemands), workReports: cloneMap(source.workReports),
    corrections: cloneMap(source.corrections), inspections: cloneMap(source.inspections), reworkOrders: cloneMap(source.reworkOrders),
    completions: cloneMap(source.completions), allocations: cloneMap(source.allocations), closes: cloneMap(source.closes),
    tasks: cloneMap(source.tasks), statusHistory: structuredClone(source.statusHistory), outbox: structuredClone(source.outbox),
    audits: structuredClone(source.audits), idempotency: cloneMap(source.idempotency),
    materialTransactionBlockers: new Set(source.materialTransactionBlockers),
  };
}

const entityKey = (tenantId: string, id: string) => `${tenantId}:${id}`;
const idempotencyKey = (tenantId: string, command: string, key: string) => `${tenantId}:${command}:${key}`;

function paginate<T>(items: T[], query: ListQuery): ListResult<T> {
  return { items: items.slice(query.offset, query.offset + query.limit), total: items.length };
}

export class InMemoryProductionRepository implements ProductionRepository {
  private state: State;
  private transactionQueue: Promise<void> = Promise.resolve();
  private readonly transactionView: boolean;

  constructor(state = emptyState(), transactionView = false) {
    this.state = state;
    this.transactionView = transactionView;
  }

  async transaction<T>(work: (repository: ProductionRepository) => Promise<T>): Promise<T> {
    if (this.transactionView) return work(this);
    let release!: () => void;
    const waitForTurn = this.transactionQueue;
    this.transactionQueue = new Promise<void>((resolve) => { release = resolve; });
    await waitForTurn;
    const snapshot = cloneState(this.state);
    const transactionRepository = new InMemoryProductionRepository(snapshot, true);
    try {
      const result = await work(transactionRepository);
      this.state = snapshot;
      return result;
    } finally {
      release();
    }
  }

  async listDemands(tenantId: string, query: ListQuery): Promise<ListResult<Demand>> {
    const search = query.search?.toLowerCase();
    const values = [...this.state.demands.values()].filter((item) => item.tenantId === tenantId)
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.factoryResourceId || item.factoryResourceId === query.factoryResourceId)
      .filter((item) => !search || `${item.code} ${item.productId} ${item.productName ?? ""}`.toLowerCase().includes(search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return structuredClone(paginate(values, query));
  }

  async getDemand(tenantId: string, id: string) { return structuredClone(this.state.demands.get(entityKey(tenantId, id))); }

  async insertDemand(value: Demand, source?: DemandSource) {
    const duplicate = [...this.state.demands.values()].some((item) => item.tenantId === value.tenantId && item.code === value.code);
    if (duplicate) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "需求编号已存在", "请刷新列表或使用新的需求编号");
    this.state.demands.set(entityKey(value.tenantId, value.id), structuredClone(value));
    if (source) this.state.demandSources.set(entityKey(source.tenantId, source.id), structuredClone(source));
  }

  async updateDemand(value: Demand, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.demands.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.demands.set(key, structuredClone(value));
    return true;
  }

  async listWorkOrders(tenantId: string, query: ListQuery): Promise<ListResult<WorkOrder>> {
    const search = query.search?.toLowerCase();
    const values = [...this.state.workOrders.values()].filter((item) => item.tenantId === tenantId)
      .filter((item) => !query.status || item.status === query.status)
      .filter((item) => !query.factoryResourceId || item.factoryResourceId === query.factoryResourceId)
      .filter((item) => !search || `${item.code} ${item.productId} ${item.productName ?? ""}`.toLowerCase().includes(search))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return structuredClone(paginate(values, query));
  }

  async getWorkOrder(tenantId: string, id: string) { return structuredClone(this.state.workOrders.get(entityKey(tenantId, id))); }

  async insertWorkOrder(value: WorkOrder, demandLinks: WorkOrderDemand[]) {
    const duplicate = [...this.state.workOrders.values()].some((item) => item.tenantId === value.tenantId && item.code === value.code);
    if (duplicate) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "工单编号已存在", "请刷新列表或使用新的工单编号");
    this.state.workOrders.set(entityKey(value.tenantId, value.id), structuredClone(value));
    for (const link of demandLinks) this.state.workOrderDemands.set(entityKey(link.tenantId, link.id), structuredClone(link));
  }

  async updateWorkOrder(value: WorkOrder, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.workOrders.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.workOrders.set(key, structuredClone(value));
    return true;
  }

  async listWorkOrderDemands(tenantId: string, workOrderId: string) {
    return structuredClone([...this.state.workOrderDemands.values()]
      .filter((item) => item.tenantId === tenantId && item.workOrderId === workOrderId)
      .sort((a, b) => a.priorityRank - b.priorityRank || (a.promisedDate ?? "").localeCompare(b.promisedDate ?? "") || a.demandId.localeCompare(b.demandId)));
  }

  async insertWorkReport(value: WorkReport) { this.state.workReports.set(entityKey(value.tenantId, value.id), structuredClone(value)); }
  async getWorkReport(tenantId: string, id: string) { return structuredClone(this.state.workReports.get(entityKey(tenantId, id))); }
  async listWorkReports(tenantId: string, workOrderId: string) {
    return structuredClone([...this.state.workReports.values()].filter((item) => item.tenantId === tenantId && item.workOrderId === workOrderId));
  }
  async updateWorkReport(value: WorkReport, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.workReports.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.workReports.set(key, structuredClone(value));
    return true;
  }
  async insertReportCorrection(value: ReportCorrection, replacement: WorkReport) {
    this.state.corrections.set(entityKey(value.tenantId, value.id), structuredClone(value));
    this.state.workReports.set(entityKey(replacement.tenantId, replacement.id), structuredClone(replacement));
  }

  async insertInspection(value: Inspection) { this.state.inspections.set(entityKey(value.tenantId, value.id), structuredClone(value)); }
  async getInspection(tenantId: string, id: string) { return structuredClone(this.state.inspections.get(entityKey(tenantId, id))); }
  async listInspections(tenantId: string, workOrderId?: string) {
    return structuredClone([...this.state.inspections.values()].filter((item) => item.tenantId === tenantId && (!workOrderId || item.workOrderId === workOrderId)));
  }
  async updateInspection(value: Inspection, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.inspections.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.inspections.set(key, structuredClone(value));
    return true;
  }
  async insertReworkOrder(value: ReworkOrder) { this.state.reworkOrders.set(entityKey(value.tenantId, value.id), structuredClone(value)); }

  async insertCompletion(value: Completion) {
    const duplicateSerials = await this.serialNumbersExist(value.tenantId, value.serialNumbers);
    if (duplicateSerials.length) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "序列号已被其他完工记录使用", "请移除重复序列号后重试", { details: { serialNumbers: duplicateSerials } });
    this.state.completions.set(entityKey(value.tenantId, value.id), structuredClone(value));
  }
  async getCompletion(tenantId: string, id: string) { return structuredClone(this.state.completions.get(entityKey(tenantId, id))); }
  async listCompletions(tenantId: string, workOrderId?: string) {
    return structuredClone([...this.state.completions.values()].filter((item) => item.tenantId === tenantId && (!workOrderId || item.workOrderId === workOrderId)));
  }
  async updateCompletion(value: Completion, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.completions.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.completions.set(key, structuredClone(value));
    return true;
  }
  async insertCompletionAllocations(values: CompletionAllocation[]) {
    for (const value of values) this.state.allocations.set(entityKey(value.tenantId, value.id), structuredClone(value));
  }
  async listCompletionAllocations(tenantId: string, completionId: string) {
    return structuredClone([...this.state.allocations.values()].filter((item) => item.tenantId === tenantId && item.completionId === completionId));
  }
  async serialNumbersExist(tenantId: string, serialNumbers: string[]) {
    const requested = new Set(serialNumbers);
    return [...new Set([...this.state.completions.values()].filter((item) => item.tenantId === tenantId)
      .flatMap((item) => item.serialNumbers).filter((serial) => requested.has(serial)))];
  }

  async insertCloseRequest(value: CloseRequest) { this.state.closes.set(entityKey(value.tenantId, value.id), structuredClone(value)); }
  async getCloseRequest(tenantId: string, id: string) { return structuredClone(this.state.closes.get(entityKey(tenantId, id))); }
  async listCloseRequests(tenantId: string, workOrderId: string) {
    return structuredClone([...this.state.closes.values()].filter((item) => item.tenantId === tenantId && item.workOrderId === workOrderId));
  }
  async updateCloseRequest(value: CloseRequest, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id);
    const existing = this.state.closes.get(key);
    if (!existing || existing.version !== expectedVersion) return false;
    this.state.closes.set(key, structuredClone(value));
    return true;
  }
  async hasBlockingMaterialTransactions(tenantId: string, workOrderId: string) {
    return this.state.materialTransactionBlockers.has(entityKey(tenantId, workOrderId));
  }

  async insertTask(value: OperationTask) { this.state.tasks.set(entityKey(value.tenantId, value.id), structuredClone(value)); }
  async getTask(tenantId: string, id: string) { return structuredClone(this.state.tasks.get(entityKey(tenantId, id))); }
  async updateTask(value: OperationTask) { this.state.tasks.set(entityKey(value.tenantId, value.id), structuredClone(value)); }

  async addStatusHistory(value: StatusHistory) { this.state.statusHistory.push(structuredClone(value)); }
  async addOutboxEvent(value: OutboxEvent) { this.state.outbox.push(structuredClone(value)); }
  async addAudit(value: AuditSnapshot) { this.state.audits.push(structuredClone(value)); }
  async getIdempotency(tenantId: string, commandType: string, key: string) {
    return structuredClone(this.state.idempotency.get(idempotencyKey(tenantId, commandType, key)));
  }
  async saveIdempotency(value: IdempotencyRecord) {
    const key = idempotencyKey(value.tenantId, value.commandType, value.idempotencyKey);
    if (this.state.idempotency.has(key)) return false;
    this.state.idempotency.set(key, structuredClone(value));
    return true;
  }

  // Test/diagnostic access without exposing mutable storage.
  snapshot() { return cloneState(this.state); }
  setMaterialTransactionBlocked(tenantId: string, workOrderId: string, blocked: boolean) {
    const key = entityKey(tenantId, workOrderId);
    blocked ? this.state.materialTransactionBlockers.add(key) : this.state.materialTransactionBlockers.delete(key);
  }
}
