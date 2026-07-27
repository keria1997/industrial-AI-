import type {
  AvailabilityFact, FulfillmentAudit, IdempotencyRecord, InboxRecord, InventoryTransaction, ReliableEvent,
  PurchaseOrder, PurchaseReceipt, PurchaseRequest, PurchaseReturn, Reservation, SalesOrder, SalesOutbound, ShipmentRequest, ShipmentTask, Supplier, TimelineEvent,
} from "./types.js";

export interface FulfillmentStore {
  transaction<T>(work: (store: FulfillmentStore) => Promise<T>): Promise<T>;
  getIdempotency(tenantId: string, commandType: string, key: string): Promise<IdempotencyRecord | undefined>;
  saveIdempotency(record: IdempotencyRecord): Promise<void>;
  insertOrder(order: SalesOrder): Promise<void>;
  updateOrder(order: SalesOrder, expectedVersion: number): Promise<boolean>;
  getOrder(tenantId: string, id: string): Promise<SalesOrder | undefined>;
  listOrders(tenantId: string): Promise<SalesOrder[]>;
  insertRequest(request: ShipmentRequest): Promise<void>;
  updateRequest(request: ShipmentRequest, expectedVersion: number): Promise<boolean>;
  getRequest(tenantId: string, id: string): Promise<ShipmentRequest | undefined>;
  listRequestsByOrder(tenantId: string, salesOrderId: string): Promise<ShipmentRequest[]>;
  insertTask(task: ShipmentTask): Promise<void>;
  updateTask(task: ShipmentTask, expectedVersion: number): Promise<boolean>;
  getTask(tenantId: string, id: string): Promise<ShipmentTask | undefined>;
  getTaskByRequest(tenantId: string, requestId: string): Promise<ShipmentTask | undefined>;
  listTasks(tenantId: string): Promise<ShipmentTask[]>;
  upsertAvailability(fact: AvailabilityFact): Promise<"CREATED" | "UPDATED" | "STALE">;
  getAvailability(tenantId: string, warehouseId: string, productId: string): Promise<AvailabilityFact | undefined>;
  insertReservation(reservation: Reservation): Promise<void>;
  updateReservation(reservation: Reservation, expectedVersion: number): Promise<boolean>;
  getReservation(tenantId: string, id: string): Promise<Reservation | undefined>;
  listReservationsByTask(tenantId: string, taskId: string): Promise<Reservation[]>;
  insertOutbound(outbound: SalesOutbound): Promise<void>;
  updateOutbound(outbound: SalesOutbound, expectedVersion: number): Promise<boolean>;
  getOutbound(tenantId: string, id: string): Promise<SalesOutbound | undefined>;
  addTransaction(transaction: InventoryTransaction): Promise<boolean>;
  listTransactions(tenantId: string): Promise<InventoryTransaction[]>;
  insertPurchaseRequest(request: PurchaseRequest): Promise<void>;
  updatePurchaseRequest(request: PurchaseRequest, expectedVersion: number): Promise<boolean>;
  getPurchaseRequest(tenantId: string, id: string): Promise<PurchaseRequest | undefined>;
  findPurchaseRequestByMrpLine(tenantId: string, mrpTaskId: string, demandId: string, materialId: string): Promise<PurchaseRequest | undefined>;
  listPurchaseRequests(tenantId: string): Promise<PurchaseRequest[]>;
  insertPurchaseOrder(order: PurchaseOrder): Promise<void>;
  updatePurchaseOrder(order: PurchaseOrder, expectedVersion: number): Promise<boolean>;
  getPurchaseOrder(tenantId: string, id: string): Promise<PurchaseOrder | undefined>;
  listPurchaseOrders(tenantId: string): Promise<PurchaseOrder[]>;
  insertPurchaseReceipt(receipt: PurchaseReceipt): Promise<void>;
  getPurchaseReceiptByExternalId(tenantId: string, externalTransactionId: string): Promise<PurchaseReceipt | undefined>;
  listPurchaseReceipts(tenantId: string): Promise<PurchaseReceipt[]>;
  addTimeline(tenantId: string, salesOrderId: string, event: TimelineEvent): Promise<void>;
  addAudit(audit: FulfillmentAudit): Promise<void>;
  listTimeline(tenantId: string, salesOrderId: string): Promise<TimelineEvent[]>;
  addOutbox(event: ReliableEvent): Promise<void>;
  listPendingOutbox(tenantId?: string): Promise<ReliableEvent[]>;
  markOutboxPublished(tenantId: string, eventId: string): Promise<void>;
  markOutboxFailed(tenantId: string, eventId: string, error: string, maxAttempts: number): Promise<void>;
  getInbox(tenantId: string, consumerName: string, eventId: string): Promise<InboxRecord | undefined>;
  addInbox(record: InboxRecord): Promise<void>;

  // Supplier master data
  listSuppliers(tenantId: string): Promise<Supplier[]>;
  getSupplier(tenantId: string, id: string): Promise<Supplier | undefined>;
  getSupplierByCode(tenantId: string, code: string): Promise<Supplier | undefined>;
  saveSupplier(supplier: Supplier): Promise<void>;
  deleteSupplier(tenantId: string, id: string): Promise<void>;

  // Purchase returns
  insertPurchaseReturn(ret: PurchaseReturn): Promise<void>;
  updatePurchaseReturn(ret: PurchaseReturn, expectedVersion: number): Promise<boolean>;
  getPurchaseReturn(tenantId: string, id: string): Promise<PurchaseReturn | undefined>;
  listPurchaseReturns(tenantId: string): Promise<PurchaseReturn[]>;
}
