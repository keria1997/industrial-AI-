import type { FulfillmentStore } from "./store.js";
import { FulfillmentError } from "../../shared/fulfillment-errors.js";
import type {
  AvailabilityFact, FulfillmentAudit, IdempotencyRecord, InboxRecord, InventoryTransaction, ReliableEvent,
  PurchaseOrder, PurchaseReceipt, PurchaseRequest, PurchaseReturn, Reservation, SalesOrder, SalesOutbound, ShipmentRequest, ShipmentTask, Supplier, TimelineEvent,
} from "./types.js";

type State = {
  idempotency: Map<string, IdempotencyRecord>;
  orders: Map<string, SalesOrder>;
  requests: Map<string, ShipmentRequest>;
  tasks: Map<string, ShipmentTask>;
  availability: Map<string, AvailabilityFact>;
  reservations: Map<string, Reservation>;
  outbounds: Map<string, SalesOutbound>;
  transactions: Map<string, InventoryTransaction>;
  purchaseRequests: Map<string, PurchaseRequest>;
  purchaseOrders: Map<string, PurchaseOrder>;
  purchaseReceipts: Map<string, PurchaseReceipt>;
  suppliers: Map<string, Supplier>;
  purchaseReturns: Map<string, PurchaseReturn>;
  timelines: Map<string, TimelineEvent[]>;
  audits: FulfillmentAudit[];
  outbox: Map<string, ReliableEvent>;
  inbox: Map<string, InboxRecord>;
};

const entityKey = (tenantId: string, id: string) => `${tenantId}:${id}`;
const availabilityKey = (tenantId: string, warehouseId: string, productId: string) => `${tenantId}:${warehouseId}:${productId}`;
const clone = <T>(value: T): T => structuredClone(value);
const cloneState = (state: State): State => ({
  idempotency: clone(state.idempotency), orders: clone(state.orders), requests: clone(state.requests),
  tasks: clone(state.tasks), availability: clone(state.availability), reservations: clone(state.reservations),
  outbounds: clone(state.outbounds), transactions: clone(state.transactions),
  purchaseRequests: clone(state.purchaseRequests), purchaseOrders: clone(state.purchaseOrders), purchaseReceipts: clone(state.purchaseReceipts),
  suppliers: clone(state.suppliers), purchaseReturns: clone(state.purchaseReturns),
  timelines: clone(state.timelines), audits: clone(state.audits),
  outbox: clone(state.outbox), inbox: clone(state.inbox),
});

export class InMemoryFulfillmentStore implements FulfillmentStore {
  private state: State = {
    idempotency: new Map(), orders: new Map(), requests: new Map(), tasks: new Map(),
    availability: new Map(), reservations: new Map(), outbounds: new Map(), transactions: new Map(),
    purchaseRequests: new Map(), purchaseOrders: new Map(), purchaseReceipts: new Map(),
    suppliers: new Map(), purchaseReturns: new Map(),
    timelines: new Map(), audits: [], outbox: new Map(), inbox: new Map(),
  };
  private queue: Promise<void> = Promise.resolve();

  async transaction<T>(work: (store: FulfillmentStore) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = cloneState(this.state);
    try { return await work(this); }
    catch (error) { this.state = before; throw error; }
    finally { release(); }
  }

  async getIdempotency(tenantId: string, commandType: string, key: string) { return clone(this.state.idempotency.get(`${tenantId}:${commandType}:${key}`)); }
  async saveIdempotency(record: IdempotencyRecord) { this.state.idempotency.set(`${record.tenantId}:${record.commandType}:${record.key}`, clone(record)); }
  async insertOrder(value: SalesOrder) { this.state.orders.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updateOrder(value: SalesOrder, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.orders.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT","数据已被其他操作更新","刷新数据后重新确认操作"); this.state.orders.set(key, clone(value)); return true;
  }
  async getOrder(tenantId: string, id: string) { return clone(this.state.orders.get(entityKey(tenantId, id))); }
  async listOrders(tenantId: string) { return clone([...this.state.orders.values()].filter((item) => item.tenantId === tenantId)); }
  async insertRequest(value: ShipmentRequest) { this.state.requests.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updateRequest(value: ShipmentRequest, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.requests.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT","数据已被其他操作更新","刷新数据后重新确认操作"); this.state.requests.set(key, clone(value)); return true;
  }
  async getRequest(tenantId: string, id: string) { return clone(this.state.requests.get(entityKey(tenantId, id))); }
  async listRequestsByOrder(tenantId: string, salesOrderId: string) { return clone([...this.state.requests.values()].filter((item) => item.tenantId === tenantId && item.salesOrderId === salesOrderId)); }
  async insertTask(value: ShipmentTask) { this.state.tasks.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updateTask(value: ShipmentTask, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.tasks.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT","数据已被其他操作更新","刷新数据后重新确认操作"); this.state.tasks.set(key, clone(value)); return true;
  }
  async getTask(tenantId: string, id: string) { return clone(this.state.tasks.get(entityKey(tenantId, id))); }
  async getTaskByRequest(tenantId: string, requestId: string) { return clone([...this.state.tasks.values()].find((item) => item.tenantId === tenantId && item.shipmentRequestId === requestId)); }
  async listTasks(tenantId: string) { return clone([...this.state.tasks.values()].filter((item) => item.tenantId === tenantId)); }
  async upsertAvailability(value: AvailabilityFact) {
    const key = availabilityKey(value.tenantId, value.warehouseId, value.productId); const current = this.state.availability.get(key);
    if (current && current.factVersion >= value.factVersion) return "STALE" as const;
    this.state.availability.set(key, clone(value)); return current ? "UPDATED" as const : "CREATED" as const;
  }
  async getAvailability(tenantId: string, warehouseId: string, productId: string) { return clone(this.state.availability.get(availabilityKey(tenantId, warehouseId, productId))); }
  async insertReservation(value: Reservation) { this.state.reservations.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updateReservation(value: Reservation, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.reservations.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT","数据已被其他操作更新","刷新数据后重新确认操作"); this.state.reservations.set(key, clone(value)); return true;
  }
  async getReservation(tenantId: string, id: string) { return clone(this.state.reservations.get(entityKey(tenantId, id))); }
  async listReservationsByTask(tenantId: string, taskId: string) { return clone([...this.state.reservations.values()].filter((item) => item.tenantId === tenantId && item.shipmentTaskId === taskId)); }
  async insertOutbound(value: SalesOutbound) { this.state.outbounds.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updateOutbound(value: SalesOutbound, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.outbounds.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT","数据已被其他操作更新","刷新数据后重新确认操作"); this.state.outbounds.set(key, clone(value)); return true;
  }
  async getOutbound(tenantId: string, id: string) { return clone(this.state.outbounds.get(entityKey(tenantId, id))); }
  async addTransaction(value: InventoryTransaction) {
    const key = entityKey(value.tenantId, value.externalTransactionId); if (this.state.transactions.has(key)) return false;
    this.state.transactions.set(key, clone(value)); return true;
  }
  async listTransactions(tenantId: string) { return clone([...this.state.transactions.values()].filter((item) => item.tenantId === tenantId)); }
  async insertPurchaseRequest(value: PurchaseRequest) { this.state.purchaseRequests.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updatePurchaseRequest(value: PurchaseRequest, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.purchaseRequests.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "采购申请已被其他操作更新", "刷新采购申请后重试");
    this.state.purchaseRequests.set(key, clone(value)); return true;
  }
  async getPurchaseRequest(tenantId: string, id: string) { return clone(this.state.purchaseRequests.get(entityKey(tenantId, id))); }
  async findPurchaseRequestByMrpLine(tenantId: string, mrpTaskId: string, demandId: string, materialId: string) {
    return clone([...this.state.purchaseRequests.values()].find((item) => item.tenantId === tenantId && item.mrpTaskId === mrpTaskId && item.demandId === demandId && item.materialId === materialId));
  }
  async listPurchaseRequests(tenantId: string) { return clone([...this.state.purchaseRequests.values()].filter((item) => item.tenantId === tenantId)); }
  async insertPurchaseOrder(value: PurchaseOrder) { this.state.purchaseOrders.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updatePurchaseOrder(value: PurchaseOrder, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.purchaseOrders.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "采购订单已被其他操作更新", "刷新采购订单后重试");
    this.state.purchaseOrders.set(key, clone(value)); return true;
  }
  async getPurchaseOrder(tenantId: string, id: string) { return clone(this.state.purchaseOrders.get(entityKey(tenantId, id))); }
  async listPurchaseOrders(tenantId: string) { return clone([...this.state.purchaseOrders.values()].filter((item) => item.tenantId === tenantId)); }
  async insertPurchaseReceipt(value: PurchaseReceipt) { this.state.purchaseReceipts.set(entityKey(value.tenantId, value.id), clone(value)); }
  async getPurchaseReceiptByExternalId(tenantId: string, externalTransactionId: string) {
    return clone([...this.state.purchaseReceipts.values()].find((item) => item.tenantId === tenantId && item.externalTransactionId === externalTransactionId));
  }
  async listPurchaseReceipts(tenantId: string) { return clone([...this.state.purchaseReceipts.values()].filter((item) => item.tenantId === tenantId)); }
  async addTimeline(tenantId: string, salesOrderId: string, value: TimelineEvent) {
    const key = entityKey(tenantId, salesOrderId); this.state.timelines.set(key, [...(this.state.timelines.get(key) ?? []), clone(value)]);
  }
  async listTimeline(tenantId: string, salesOrderId: string) { return clone(this.state.timelines.get(entityKey(tenantId, salesOrderId)) ?? []); }
  async addAudit(value: FulfillmentAudit) { this.state.audits.push(clone(value)); }
  async addOutbox(value: ReliableEvent) { this.state.outbox.set(entityKey(value.tenantId, value.eventId), clone(value)); }
  async listPendingOutbox(tenantId?: string) { return clone([...this.state.outbox.values()].filter((item) => item.status === "PENDING" && (!tenantId || item.tenantId === tenantId))); }
  async markOutboxPublished(tenantId: string, eventId: string) { const key = entityKey(tenantId, eventId); const item = this.state.outbox.get(key); if (item) this.state.outbox.set(key, { ...item, status: "PUBLISHED", attempts: item.attempts + 1 }); }
  async markOutboxFailed(tenantId: string, eventId: string, _error: string, maxAttempts: number) { const key = entityKey(tenantId, eventId); const item = this.state.outbox.get(key); if (item) { const attempts = item.attempts + 1; this.state.outbox.set(key, { ...item, attempts, status: attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING" }); } }
  async getInbox(tenantId: string, consumerName: string, eventId: string) { return clone(this.state.inbox.get(`${tenantId}:${consumerName}:${eventId}`)); }
  async addInbox(value: InboxRecord) { this.state.inbox.set(`${value.tenantId}:${value.consumerName}:${value.eventId}`, clone(value)); }


  // Supplier master data
  async listSuppliers(tenantId: string) { return clone([...this.state.suppliers.values()].filter((item) => item.tenantId === tenantId)); }
  async getSupplier(tenantId: string, id: string) { return clone(this.state.suppliers.get(entityKey(tenantId, id))); }
  async getSupplierByCode(tenantId: string, code: string) { return clone([...this.state.suppliers.values()].find((item) => item.tenantId === tenantId && item.code === code)); }
  async saveSupplier(value: Supplier) { this.state.suppliers.set(entityKey(value.tenantId, value.id), clone(value)); }
  async deleteSupplier(tenantId: string, id: string) { this.state.suppliers.delete(entityKey(tenantId, id)); }

  // Purchase returns
  async insertPurchaseReturn(value: PurchaseReturn) { this.state.purchaseReturns.set(entityKey(value.tenantId, value.id), clone(value)); }
  async updatePurchaseReturn(value: PurchaseReturn, expectedVersion: number) {
    const key = entityKey(value.tenantId, value.id); const current = this.state.purchaseReturns.get(key);
    if (!current || current.version !== expectedVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "采购退货已被其他操作更新", "刷新退货单后重试");
    this.state.purchaseReturns.set(key, clone(value)); return true;
  }
  async getPurchaseReturn(tenantId: string, id: string) { return clone(this.state.purchaseReturns.get(entityKey(tenantId, id))); }
  async listPurchaseReturns(tenantId: string) { return clone([...this.state.purchaseReturns.values()].filter((item) => item.tenantId === tenantId)); }

  snapshot() { return cloneState(this.state); }
}
