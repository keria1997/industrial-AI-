export type OverallStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "REPLENISHING" | "PARTIALLY_SHIPPED" | "SHIPPED" | "CANCELED";
export type ReviewStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELED";
export type ShipmentStatus = "NOT_REQUESTED" | "REQUESTED" | "PARTIALLY_SHIPPED" | "SHIPPED";
export type LineStatus = "OPEN" | "RESERVED" | "PARTIALLY_SHIPPED" | "SHIPPED" | "CANCELED";
export type WorkflowStatus = "REQUESTED" | "PROCESSING" | "ACTIVE" | "PROCESSING_UNKNOWN" | "MANUAL_INTERVENTION" | "COMPLETED";
export type AvailabilityStatus = "UNCHECKED" | "CHECKING" | "PARTIALLY_RESERVED" | "RESERVED" | "SHORTAGE" | "RECHECKING";
export type ReplenishmentStatus = "NOT_REQUIRED" | "REQUIRED" | "REQUESTED" | "IN_PROGRESS" | "AVAILABLE" | "CLOSED" | "FAILED";
export type PostingStatus = "NOT_STARTED" | "PARTIALLY_POSTED" | "POSTED";

export type Recipient = {
  name: string;
  phoneMasked: string;
  phoneCiphertext: string;
  phoneKeyId: string;
  country: string;
  province: string;
  city: string;
  district?: string;
  address: string;
  postalCode?: string;
};

export type SalesOrderLine = {
  id: string; lineNo: number; productId: string; orderedQty: string; shippedQty: string;
  activeRequestedQty: string; reservedQty: string; remainingQty: string; uom: string;
  unitPrice: string; taxRate: string; promisedDate: string; allowPartialShipment: boolean;
  lineStatus: LineStatus; version: number;
};

export type SalesOrder = {
  id: string; tenantId: string; orderNo: string; customerId: string; customerName: string;
  ownerEmployeeId: string; fulfillmentWarehouseId: string; factoryResourceId: string;
  requestedDeliveryDate: string; allowPartialShipment: boolean; currency: string; totalAmount: string;
  overallStatus: OverallStatus; reviewStatus: ReviewStatus; shipmentStatus: ShipmentStatus;
  reviewRequired: boolean; reviewPolicyVersion: string; recipient: Recipient; lines: SalesOrderLine[];
  sourceQuoteId?: string; sourceQuoteRevision?: number; cancelReason?: string; canceledAt?: string;
  correlationId: string; createdBy: string; version: number; createdAt: string; updatedAt: string;
};

export type ShipmentRequestLine = {
  id: string; orderLineId: string; sourceLineRevision: number; productId: string;
  requestedQty: string; reservedQty: string; postedQty: string; shortageQty: string;
  uom: string; productionDemandId?: string;
};

export type ShipmentRequest = {
  id: string; tenantId: string; requestNo: string; salesOrderId: string; warehouseId: string;
  orderRevision: number; workflowStatus: WorkflowStatus; availabilityStatus: AvailabilityStatus;
  replenishmentStatus: ReplenishmentStatus; postingStatus: PostingStatus; inventoryFactVersion?: number;
  outboundId?: string; lines: ShipmentRequestLine[]; version: number; correlationId: string;
  createdBy: string; createdAt: string; updatedAt: string;
};

export type AvailabilityFact = {
  tenantId: string; warehouseId: string; productId: string; qualifiedOnHandQty: string;
  allocatedReservedQty: string; frozenQty: string; safetyStockQty: string; inTransitQty: string;
  fulfillableQty: string; uom: string; formulaVersion: string; factVersion: number;
  sourceSystem: string; sourceEventId: string; asOf: string;
};

export type ShipmentTaskLine = ShipmentRequestLine & {
  shipmentRequestLineId: string; allowPartialShipment: boolean; promisedDate: string;
};

export type ShipmentTask = {
  id: string; tenantId: string; shipmentRequestId: string; salesOrderId: string; requestNo: string;
  salesOrderNo: string; orderRevision: number; allowPartialShipment: boolean;
  warehouseId: string; workflowStatus: WorkflowStatus; availabilityStatus: AvailabilityStatus;
  replenishmentStatus: ReplenishmentStatus; postingStatus: PostingStatus; inventoryFactVersion?: number;
  outboundId?: string; recipientSnapshot: Recipient; lines: ShipmentTaskLine[]; correlationId: string;
  version: number; createdAt: string; updatedAt: string;
};

export type ReservationLine = {
  taskLineId: string; orderLineId: string; productId: string; requestedQty: string;
  reservedQty: string; consumedQty: string; releasedQty: string; uom: string;
};

export type Reservation = {
  id: string; tenantId: string; shipmentTaskId: string; warehouseId: string;
  externalReservationId: string; status: "PARTIAL" | "ACTIVE" | "CONSUMED" | "RELEASED" | "FAILED";
  factVersion: number; formulaVersion: string; reservedQty: string; consumedQty: string;
  releasedQty: string; uom: string; lines: ReservationLine[]; version: number;
  createdAt: string; updatedAt: string;
};

export type OutboundLine = {
  id: string; taskLineId: string; orderLineId: string; productId: string; requestedQty: string;
  reservedQty: string; postedQty: string; uom: string;
};

export type SalesOutbound = {
  id: string; tenantId: string; shipmentTaskId: string; shipmentRequestId: string;
  salesOrderId: string; outboundNo: string; warehouseId: string;
  status: "CREATED" | "RESERVED" | "POSTING" | "PARTIALLY_POSTED" | "POSTED" | "PROCESSING_UNKNOWN" | "MANUAL_INTERVENTION" | "FAILED";
  postingKey?: string; lines: OutboundLine[]; version: number; correlationId: string;
  createdAt: string; updatedAt: string; postedAt?: string;
};

export type InventoryTransaction = {
  id: string; tenantId: string; transactionNo: string; externalTransactionId: string;
  type: "SALES_OUTBOUND" | "FG_COMPLETION_INBOUND" | "PURCHASE_RECEIPT_INBOUND" | "RESERVATION_RELEASE";
  warehouseId: string; productId: string; qty: string; uom: string;
  sourceType: string; sourceId: string; sourceLineId?: string; factVersion?: number;
  correlationId: string; traceId: string; occurredAt: string;
};

export type SupplierStatus = "enabled" | "disabled" | "blacklisted";
export type SupplierRating = "A" | "B" | "C" | "D";

export type Supplier = {
  id: string; tenantId: string; code: string; name: string; shortName: string;
  contactPerson: string; phone: string; email: string; address: string;
  bankAccount: string; taxNo: string; rating: SupplierRating;
  leadTimeDays: number; minOrderQty: string; paymentTerms: string;
  status: SupplierStatus; remark: string;
  version: number; createdAt: string; updatedAt: string;
};

export type PurchaseRequest = {
  id: string; tenantId: string; requestNo: string; mrpTaskId: string; demandId: string;
  materialId: string; materialName?: string; warehouseId: string; requiredQty: string; uom: string;
  requiredDate: string; status: "PENDING_APPROVAL" | "APPROVED" | "CONVERTED" | "REJECTED" | "CANCELED";
  correlationId: string; createdBy: string; approvedBy?: string; approvedAt?: string;
  rejectedBy?: string; rejectedAt?: string; rejectReason?: string;
  purchaseOrderId?: string; version: number; createdAt: string; updatedAt: string;
};

export type PurchaseOrder = {
  id: string; tenantId: string; orderNo: string; purchaseRequestId: string; demandId: string;
  materialId: string; materialName?: string; warehouseId: string; orderedQty: string; receivedQty: string;
  uom: string; supplierId: string; supplierName: string; promisedDate: string;
  unitPrice: string; taxRate: string; currency: string; totalAmount: string;
  status: "CREATED" | "CONFIRMED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELED";
  correlationId: string; createdBy: string;
  cancelReason?: string; canceledAt?: string;
  version: number; createdAt: string; updatedAt: string;
};

export type PurchaseReceipt = {
  id: string; tenantId: string; receiptNo: string; purchaseOrderId: string; demandId: string;
  materialId: string; warehouseId: string; receivedQty: string; uom: string;
  externalTransactionId: string; inventoryFactVersion: number;
  status: "PENDING_INSPECTION" | "INSPECTING" | "ACCEPTED" | "REJECTED" | "POSTED";
  correlationId: string; receivedBy: string; receivedAt: string;
  inspectedBy?: string; inspectedAt?: string; inspectionResult?: string; inspectionRemark?: string;
  version: number;
};

export type PurchaseReturn = {
  id: string; tenantId: string; returnNo: string; purchaseReceiptId: string; purchaseOrderId: string;
  supplierId: string; supplierName: string; materialId: string; warehouseId: string;
  returnQty: string; uom: string; reason: string;
  status: "draft" | "pending" | "processing" | "done" | "rejected" | "void";
  externalTransactionId?: string; remark: string;
  version: number; createdAt: string; updatedAt: string; createdBy: string;
};

export type TimelineEvent = {
  eventType: string; aggregateType: string; aggregateId: string; aggregateCode?: string;
  status: string; occurredAt: string; traceId: string; summary?: string;
};

export type ReliableEvent = {
  eventId: string; tenantId: string; eventType: string; aggregateType: string; aggregateId: string;
  aggregateVersion: number; correlationId: string; traceId: string; payload: Record<string, unknown>;
  status: "PENDING" | "PUBLISHED" | "DEAD_LETTER"; attempts: number; createdAt: string;
};

export type InboxRecord = { tenantId: string; consumerName: string; eventId: string; eventType: string; processedAt: string };
export type IdempotencyRecord = { tenantId: string; commandType: string; key: string; requestHash: string; statusCode: number; body: unknown };
export type FulfillmentAudit = {
  id: string; tenantId: string; aggregateType: string; aggregateId: string; aggregateVersion: number;
  action: string; actorId: string; beforeSnapshot?: unknown; afterSnapshot?: unknown; reason?: string;
  permissionVersion: string; correlationId: string; traceId: string; ipAddress?: string; userAgent?: string; occurredAt: string;
};

export type CreateOrderInput = {
  customerId: string; customerName?: string; ownerEmployeeId: string; fulfillmentWarehouseId: string;
  factoryResourceId: string; requestedDeliveryDate: string; allowPartialShipment: boolean; currency: string;
  recipient: { name: string; phone: string; country: string; province: string; city: string; district?: string; address: string; postalCode?: string };
  sourceQuoteId?: string; sourceQuoteRevision?: number;
  lines: Array<{ lineNo: number; productId: string; orderedQty: string; uom: string; unitPrice: string; taxRate: string; promisedDate: string; allowPartialShipment: boolean }>;
};

export type AdapterOutcome = "SUCCEEDED" | "PARTIALLY_SUCCEEDED" | "SHORTAGE" | "PROCESSING_UNKNOWN" | "REJECTED";
