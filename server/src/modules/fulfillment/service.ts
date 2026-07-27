import { createHash, randomUUID } from "node:crypto";
import { addDecimal, compareDecimal, decimalToScaled, minDecimal, scaledToDecimal, subtractDecimal } from "../../decimal.js";
import { FulfillmentError } from "../../shared/fulfillment-errors.js";
import { encryptField, maskPhone, type KeyProvider } from "../../shared/key-provider.js";
import type { OperationTask, RequestContext } from "../../types.js";
import type { InventoryGateway } from "./inventory-gateway.js";
import type { FulfillmentStore } from "./store.js";
import type {
  AvailabilityFact, CreateOrderInput, IdempotencyRecord, InventoryTransaction, ReliableEvent,
  PurchaseOrder, PurchaseReceipt, PurchaseRequest, PurchaseReturn, Reservation, SalesOrder, SalesOutbound, ShipmentRequest, ShipmentTask, Supplier, TimelineEvent,
} from "./types.js";

type CommandResult<T> = { statusCode: number; body: T; replayed?: boolean };
type ProductionDemandResult = { id: string; code: string };

export type FulfillmentServiceOptions = {
  reviewRequired?: boolean;
  reviewPolicyVersion?: string;
  createProductionDemand: (context: RequestContext, input: {
    shipmentRequestId: string; shipmentRequestLineId: string; salesOrderId: string; salesOrderLineId: string;
    productId: string; qty: string; uom: string; dueDate: string; factoryResourceId: string;
    warehouseId: string; correlationId: string;
    inventoryFactVersion?: number;
  }) => Promise<ProductionDemandResult>;
  getProductionTask?: (context: RequestContext, taskId: string) => Promise<OperationTask | undefined>;
  syncProductionAvailability?: (context: RequestContext, fact: AvailabilityFact) => Promise<void>;
  onSalesOutboundPosted?: (context: RequestContext, input: {
    salesOrderId: string; salesOrderNo: string; customerId: string; customerName: string;
    totalAmount: string; currency: string; correlationId: string; postedAt: string;
  }) => Promise<void>;
  onPurchaseReceiptPosted?: (context: RequestContext, input: {
    purchaseOrderId: string; purchaseOrderNo: string; supplierId: string; supplierName: string;
    materialId: string; materialName?: string; orderedQty: string; uom: string;
    correlationId: string; receivedAt: string;
  }) => Promise<void>;
};

const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = () => new Date().toISOString();
const requirePermission = (context: RequestContext, permission: string) => {
  if (!context.permissions.has("*") && !context.permissions.has(permission)) {
    throw new FulfillmentError("FULFILLMENT_403_PERMISSION_DENIED", "当前账号没有执行该操作的权限", "联系管理员配置对应业务权限", { details: { permission } });
  }
};
const requireExpectedVersion = (context: RequestContext, actual: number) => {
  if (context.expectedVersion === undefined) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "缺少聚合版本", "刷新数据并携带最新 If-Match 后重试", { details: { actualVersion: actual } });
  if (context.expectedVersion !== actual) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "数据已被其他操作更新", "刷新数据后重新确认操作", { details: { expectedVersion: context.expectedVersion, actualVersion: actual } });
};
const requireIdempotency = (context: RequestContext) => {
  if (!context.idempotencyKey) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
  return context.idempotencyKey;
};
const calculateLineAmount = (qty: string, price: string, taxRate: string) => {
  const scale = 1_000_000n;
  const base = decimalToScaled(qty) * decimalToScaled(price) / scale;
  return scaledToDecimal(base + base * decimalToScaled(taxRate) / scale);
};
const sum = (values: string[]) => values.reduce((total, value) => addDecimal(total, value), "0");
const transactionNo = () => `ITX-${randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase()}`;

export class FulfillmentService {
  private readonly reviewRequired: boolean;
  private readonly reviewPolicyVersion: string;

  constructor(
    private readonly store: FulfillmentStore,
    private readonly gateway: InventoryGateway,
    private readonly keys: KeyProvider,
    private readonly options: FulfillmentServiceOptions,
  ) {
    this.reviewRequired = options.reviewRequired ?? true;
    this.reviewPolicyVersion = options.reviewPolicyVersion ?? "SALES-REVIEW-PILOT-V1";
  }

  private async command<T>(context: RequestContext, commandType: string, input: unknown, work: (store: FulfillmentStore) => Promise<{ statusCode: number; body: T }>): Promise<CommandResult<T>> {
    const key = requireIdempotency(context); const requestHash = hash(input);
    return this.store.transaction(async (store) => {
      const existing = await store.getIdempotency(context.tenantId, commandType, key);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new FulfillmentError("FULFILLMENT_409_IDEMPOTENCY_CONFLICT", "幂等键已用于不同请求", "为新业务操作使用新的幂等键");
        return { statusCode: existing.statusCode, body: existing.body as T, replayed: true };
      }
      const result = await work(store);
      const record: IdempotencyRecord = { tenantId: context.tenantId, commandType, key, requestHash, statusCode: result.statusCode, body: result.body };
      await store.saveIdempotency(record);
      return result;
    });
  }

  private timeline(eventType: string, aggregateType: string, aggregateId: string, status: string, context: RequestContext, summary?: string): TimelineEvent {
    return { eventType, aggregateType, aggregateId, status, occurredAt: now(), traceId: context.traceId, summary };
  }

  private outbox(tenantId: string, eventType: string, aggregateType: string, aggregateId: string, aggregateVersion: number, correlationId: string, traceId: string, payload: Record<string, unknown>): ReliableEvent {
    return { eventId: randomUUID(), tenantId, eventType, aggregateType, aggregateId, aggregateVersion, correlationId, traceId, payload, status: "PENDING", attempts: 0, createdAt: now() };
  }

  private async audit(store: FulfillmentStore, context: RequestContext, input: { aggregateType: string; aggregateId: string; aggregateVersion: number; action: string; correlationId: string; before?: unknown; after?: unknown; reason?: string }) {
    await store.addAudit({
      id: randomUUID(), tenantId: context.tenantId, aggregateType: input.aggregateType, aggregateId: input.aggregateId,
      aggregateVersion: input.aggregateVersion, action: input.action, actorId: context.actorId,
      beforeSnapshot: input.before, afterSnapshot: input.after, reason: input.reason,
      permissionVersion: context.permissionVersion, correlationId: input.correlationId, traceId: context.traceId,
      ipAddress: context.ipAddress, userAgent: context.userAgent, occurredAt: now(),
    });
  }

  async createOrder(context: RequestContext, input: CreateOrderInput) {
    requirePermission(context, "sales.order.create");
    return this.command(context, "sales.order.create", input, async (store) => {
      const id = randomUUID(); const timestamp = now(); const correlationId = randomUUID();
      if (new Set(input.lines.map((line) => line.lineNo)).size !== input.lines.length) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "订单行号不能重复", "为每一行使用唯一且稳定的 lineNo");
      const encryptedPhone = await encryptField(this.keys, { tenantId: context.tenantId, aggregateType: "SalesOrder", aggregateId: id, field: "recipient.phone" }, input.recipient.phone);
      const { phone: _plainPhone, ...recipientInput } = input.recipient;
      const lines = input.lines.map((line) => ({
        ...line, id: randomUUID(), shippedQty: "0", activeRequestedQty: "0", reservedQty: "0",
        remainingQty: line.orderedQty, lineStatus: "OPEN" as const, version: 1,
      }));
      const order: SalesOrder = {
        id, tenantId: context.tenantId, orderNo: `SO-${timestamp.slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
        customerId: input.customerId, customerName: input.customerName ?? input.customerId, ownerEmployeeId: input.ownerEmployeeId,
        fulfillmentWarehouseId: input.fulfillmentWarehouseId, factoryResourceId: input.factoryResourceId,
        requestedDeliveryDate: input.requestedDeliveryDate, allowPartialShipment: input.allowPartialShipment,
        currency: input.currency, totalAmount: sum(lines.map((line) => calculateLineAmount(line.orderedQty, line.unitPrice, line.taxRate))),
        overallStatus: "PENDING_CONFIRMATION", reviewStatus: this.reviewRequired ? "PENDING" : "NOT_REQUIRED",
        shipmentStatus: "NOT_REQUESTED", reviewRequired: this.reviewRequired, reviewPolicyVersion: this.reviewPolicyVersion,
        recipient: { ...recipientInput, phoneMasked: maskPhone(input.recipient.phone), phoneCiphertext: encryptedPhone.ciphertext, phoneKeyId: encryptedPhone.keyId },
        lines, sourceQuoteId: input.sourceQuoteId, sourceQuoteRevision: input.sourceQuoteRevision,
        correlationId, createdBy: context.actorId, version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      await store.insertOrder(order);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: 1, action: "CREATE", correlationId, after: this.presentOrder(order) });
      await store.addTimeline(context.tenantId, id, this.timeline("sales.order.created.v1", "SalesOrder", id, order.overallStatus, context, "销售订单已创建"));
      await store.addOutbox(this.outbox(context.tenantId, "sales.order.created.v1", "SalesOrder", id, 1, correlationId, context.traceId, { salesOrderId: id, orderNo: order.orderNo, reviewStatus: order.reviewStatus }));
      return { statusCode: 201, body: this.presentOrder(order) };
    });
  }

  private presentOrder(order: SalesOrder) {
    const { phoneCiphertext: _ciphertext, phoneKeyId: _keyId, ...recipient } = order.recipient;
    return { ...order, recipient };
  }

  async listOrders(context: RequestContext, filters: { overallStatus?: string; reviewStatus?: string; shipmentStatus?: string; search?: string; page: number; pageSize: number }) {
    requirePermission(context, "sales.order.read");
    let items = (await this.store.listOrders(context.tenantId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filters.overallStatus) items = items.filter((item) => item.overallStatus === filters.overallStatus);
    if (filters.reviewStatus) items = items.filter((item) => item.reviewStatus === filters.reviewStatus);
    if (filters.shipmentStatus) items = items.filter((item) => item.shipmentStatus === filters.shipmentStatus);
    if (filters.search) { const query = filters.search.toLowerCase(); items = items.filter((item) => `${item.orderNo} ${item.customerId} ${item.customerName}`.toLowerCase().includes(query)); }
    const total = items.length; const start = (filters.page - 1) * filters.pageSize;
    return { items: items.slice(start, start + filters.pageSize).map((item) => this.presentOrder(item)), total, page: filters.page, pageSize: filters.pageSize };
  }

  async getOrder(context: RequestContext, id: string) {
    requirePermission(context, "sales.order.read");
    const order = await this.store.getOrder(context.tenantId, id);
    if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
    return this.presentOrder(order);
  }

  async updateOrder(context: RequestContext, id: string, input: Partial<Omit<CreateOrderInput, "customerId" | "currency" | "sourceQuoteId" | "sourceQuoteRevision">>) {
    requirePermission(context, "sales.order.update");
    return this.command(context, "sales.order.update", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (order.overallStatus !== "PENDING_CONFIRMATION" || order.shipmentStatus !== "NOT_REQUESTED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "订单已有履约事实，不能继续编辑", "通过履约流程或补偿流程处理变更");
      if (order.reviewStatus === "REJECTED" || order.reviewStatus === "CANCELED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "当前审批状态不允许编辑订单", "复制为新订单后重新提交审批");
      let recipient = order.recipient;
      if (input.recipient) {
        const encryptedPhone = await encryptField(this.keys, { tenantId: context.tenantId, aggregateType: "SalesOrder", aggregateId: id, field: "recipient.phone" }, input.recipient.phone);
        const { phone: _plainPhone, ...recipientInput } = input.recipient;
        recipient = { ...recipientInput, phoneMasked: maskPhone(input.recipient.phone), phoneCiphertext: encryptedPhone.ciphertext, phoneKeyId: encryptedPhone.keyId };
      }
      let lines = order.lines;
      if (input.lines) {
        if (new Set(input.lines.map((line) => line.lineNo)).size !== input.lines.length) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "订单行号不能重复", "为每一行使用唯一且稳定的 lineNo");
        const incomingLineNos = new Set(input.lines.map((line) => line.lineNo));
        lines = [
          ...input.lines.map((line) => {
            const current = order.lines.find((item) => item.lineNo === line.lineNo);
            return { ...line, id: current?.id ?? randomUUID(), shippedQty: "0", activeRequestedQty: "0", reservedQty: "0", remainingQty: line.orderedQty, lineStatus: "OPEN" as const, version: (current?.version ?? 0) + 1 };
          }),
          ...order.lines.filter((line) => !incomingLineNos.has(line.lineNo)).map((line) => ({ ...line, lineStatus: "CANCELED" as const, version: line.version + 1 })),
        ];
      }
      const timestamp = now();
      const updated: SalesOrder = {
        ...order,
        customerName: input.customerName ?? order.customerName,
        ownerEmployeeId: input.ownerEmployeeId ?? order.ownerEmployeeId,
        fulfillmentWarehouseId: input.fulfillmentWarehouseId ?? order.fulfillmentWarehouseId,
        factoryResourceId: input.factoryResourceId ?? order.factoryResourceId,
        requestedDeliveryDate: input.requestedDeliveryDate ?? order.requestedDeliveryDate,
        allowPartialShipment: input.allowPartialShipment ?? order.allowPartialShipment,
        reviewStatus: order.reviewRequired && order.reviewStatus === "APPROVED" ? "PENDING" : order.reviewStatus,
        recipient, lines,
        totalAmount: sum(lines.filter((line) => line.lineStatus !== "CANCELED").map((line) => calculateLineAmount(line.orderedQty, line.unitPrice, line.taxRate))),
        version: order.version + 1, updatedAt: timestamp,
      };
      await store.updateOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: updated.version, action: "UPDATE", correlationId: order.correlationId, before: this.presentOrder(order), after: this.presentOrder(updated) });
      await store.addTimeline(context.tenantId, id, this.timeline("sales.order.updated.v1", "SalesOrder", id, updated.overallStatus, context, "待确认订单已更新"));
      if (order.reviewStatus === "APPROVED") await store.addTimeline(context.tenantId, id, this.timeline("sales.order.review-reset.v1", "SalesOrder", id, updated.reviewStatus, context, "订单修改后需重新审批"));
      return { statusCode: 200, body: this.presentOrder(updated) };
    });
  }

  async decideReview(context: RequestContext, id: string, input: { decision: "APPROVE" | "RETURN" | "REJECT"; comment?: string }) {
    requirePermission(context, "sales.order.review.decide");
    return this.command(context, "sales.order.review.decide", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (order.createdBy === context.actorId) throw new FulfillmentError("FULFILLMENT_403_PERMISSION_DENIED", "制单人不能审批自己的订单", "由其他具备审批权限的人员处理");
      if (order.reviewStatus !== "PENDING") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "当前审批状态不能执行该决策", "刷新订单状态后重试");
      if (input.decision !== "APPROVE" && !input.comment?.trim()) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "退回或拒绝必须填写原因", "填写明确原因后重试");
      const status = input.decision === "APPROVE" ? "APPROVED" : input.decision === "RETURN" ? "RETURNED" : "REJECTED";
      const updated: SalesOrder = { ...order, reviewStatus: status, version: order.version + 1, updatedAt: now() };
      await store.updateOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: updated.version, action: `REVIEW_${input.decision}`, correlationId: order.correlationId, before: this.presentOrder(order), after: this.presentOrder(updated), reason: input.comment });
      await store.addTimeline(context.tenantId, id, this.timeline(`sales.order.review-${input.decision.toLowerCase()}.v1`, "SalesOrder", id, status, context, input.comment));
      return { statusCode: 200, body: this.presentOrder(updated) };
    });
  }

  async resubmitReview(context: RequestContext, id: string, input: { comment?: string }) {
    requirePermission(context, "sales.order.review.submit");
    return this.command(context, "sales.order.review.submit", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (order.reviewStatus !== "RETURNED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "只有已退回订单可以重新提交", "先完成退回内容修改");
      const updated: SalesOrder = { ...order, reviewStatus: "PENDING", version: order.version + 1, updatedAt: now() };
      await store.updateOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: updated.version, action: "REVIEW_RESUBMIT", correlationId: order.correlationId, before: this.presentOrder(order), after: this.presentOrder(updated), reason: input.comment });
      await store.addTimeline(context.tenantId, id, this.timeline("sales.order.review-submitted.v1", "SalesOrder", id, "PENDING", context, input.comment));
      return { statusCode: 200, body: this.presentOrder(updated) };
    });
  }

  async confirmOrder(context: RequestContext, id: string, input: { requestedDeliveryDate: string }) {
    requirePermission(context, "sales.order.confirm");
    return this.command(context, "sales.order.confirm", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (!(["APPROVED", "NOT_REQUIRED"] as const).includes(order.reviewStatus as "APPROVED" | "NOT_REQUIRED")) {
        throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "订单尚未完成复核或审批", "审批通过后再确认发货内容");
      }
      if (order.overallStatus !== "PENDING_CONFIRMATION" || order.shipmentStatus !== "NOT_REQUESTED") {
        throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "订单当前不能重复确认", "刷新订单后从已确认列表继续发货");
      }
      const timestamp = now();
      const updated: SalesOrder = {
        ...order,
        requestedDeliveryDate: input.requestedDeliveryDate,
        overallStatus: "CONFIRMED",
        lines: order.lines.map((line) => line.lineStatus === "CANCELED" ? line : {
          ...line,
          promisedDate: input.requestedDeliveryDate,
          version: line.version + 1,
        }),
        version: order.version + 1,
        updatedAt: timestamp,
      };
      await store.updateOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: updated.version, action: "CONFIRM_SHIPMENT_CONTENT", correlationId: order.correlationId, before: this.presentOrder(order), after: this.presentOrder(updated) });
      await store.addTimeline(context.tenantId, id, this.timeline("sales.order.confirmed.v1", "SalesOrder", id, "CONFIRMED", context, "销售发货内容已确认，等待发起发货"));
      await store.addOutbox(this.outbox(context.tenantId, "sales.order.confirmed.v1", "SalesOrder", id, updated.version, order.correlationId, context.traceId, { salesOrderId: id, orderNo: order.orderNo, requestedDeliveryDate: input.requestedDeliveryDate }));
      return { statusCode: 200, body: this.presentOrder(updated) };
    });
  }

  async cancelOrder(context: RequestContext, id: string, input: { reason: string }) {
    requirePermission(context, "sales.order.cancel");
    return this.command(context, "sales.order.cancel", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (order.overallStatus !== "PENDING_CONFIRMATION" || order.shipmentStatus !== "NOT_REQUESTED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "订单已确认或已移交仓库，不能直接取消", "由仓库走拦截和双人补偿流程");
      const timestamp = now(); const updated: SalesOrder = { ...order, overallStatus: "CANCELED", reviewStatus: "CANCELED", lines: order.lines.map((line) => ({ ...line, lineStatus: "CANCELED" })), cancelReason: input.reason, canceledAt: timestamp, updatedAt: timestamp, version: order.version + 1 };
      await store.updateOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "SalesOrder", aggregateId: id, aggregateVersion: updated.version, action: "CANCEL", correlationId: order.correlationId, before: this.presentOrder(order), after: this.presentOrder(updated), reason: input.reason });
      await store.addTimeline(context.tenantId, id, this.timeline("sales.order.canceled.v1", "SalesOrder", id, "CANCELED", context, input.reason));
      return { statusCode: 200, body: this.presentOrder(updated) };
    });
  }

  async createShipmentRequest(context: RequestContext, orderId: string, input: { warehouseId: string; lines: Array<{ orderLineId: string; sourceLineRevision: number; requestedQty: string; uom: string }> }) {
    requirePermission(context, "sales.shipment-request.create");
    const result = await this.command(context, "sales.shipment-request.create", { orderId, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getOrder(context.tenantId, orderId);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (!(["APPROVED", "NOT_REQUIRED"] as const).includes(order.reviewStatus as "APPROVED" | "NOT_REQUIRED")) throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "订单尚未完成复核或审批", "审批通过后再发起发货");
      if (!(["CONFIRMED", "PARTIALLY_SHIPPED"] as const).includes(order.overallStatus as "CONFIRMED" | "PARTIALLY_SHIPPED")) throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "销售发货内容尚未确认", "先在待发货列表确认订单，再从已确认列表去发货");
      if (input.warehouseId !== order.fulfillmentWarehouseId) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "发货仓库与订单履约仓库不一致", "使用订单指定的履约仓库");
      const seen = new Set<string>();
      const requestLines = input.lines.map((line) => {
        if (seen.has(line.orderLineId)) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "同一订单行不能重复申请", "合并重复订单行数量");
        seen.add(line.orderLineId);
        const source = order.lines.find((item) => item.id === line.orderLineId);
        if (!source || source.lineStatus === "CANCELED") throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "发货申请包含无效订单行", "刷新订单详情后重试");
        if (source.version !== line.sourceLineRevision || source.uom !== line.uom) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "订单行版本或单位已变化", "刷新订单后重新发起发货");
        const availableToRequest = subtractDecimal(source.remainingQty, source.activeRequestedQty);
        if (compareDecimal(line.requestedQty, availableToRequest) > 0) throw new FulfillmentError("FULFILLMENT_422_QUANTITY_VIOLATION", "申请数量超过订单行剩余可申请量", "减少本次申请数量", { details: { orderLineId: source.id, availableToRequest } });
        return { ...line, id: randomUUID(), productId: source.productId, reservedQty: "0", postedQty: "0", shortageQty: "0" };
      });
      const timestamp = now(); const id = randomUUID();
      const request: ShipmentRequest = {
        id, tenantId: context.tenantId, requestNo: `SR-${timestamp.slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
        salesOrderId: orderId, warehouseId: input.warehouseId, orderRevision: order.version,
        workflowStatus: "REQUESTED", availabilityStatus: "UNCHECKED", replenishmentStatus: "NOT_REQUIRED", postingStatus: "NOT_STARTED",
        lines: requestLines, version: 1, correlationId: order.correlationId, createdBy: context.actorId, createdAt: timestamp, updatedAt: timestamp,
      };
      const updatedOrder: SalesOrder = {
        ...order, shipmentStatus: "REQUESTED", version: order.version + 1, updatedAt: timestamp,
        lines: order.lines.map((line) => {
          const requested = requestLines.find((item) => item.orderLineId === line.id);
          return requested ? { ...line, activeRequestedQty: addDecimal(line.activeRequestedQty, requested.requestedQty), version: line.version + 1 } : line;
        }),
      };
      await store.insertRequest(request); await store.updateOrder(updatedOrder, order.version);
      await this.audit(store, context, { aggregateType: "SalesShipmentRequest", aggregateId: id, aggregateVersion: 1, action: "REQUEST", correlationId: order.correlationId, after: request });
      await store.addTimeline(context.tenantId, orderId, this.timeline("sales.shipment-request.requested.v1", "SalesShipmentRequest", id, "REQUESTED", context, "销售已移交仓库"));
      await store.addOutbox(this.outbox(context.tenantId, "sales.shipment-request.requested.v1", "SalesShipmentRequest", id, 1, order.correlationId, context.traceId, { shipmentRequestId: id, salesOrderId: orderId }));
      return { statusCode: 202, body: request };
    });
    if (!result.replayed) await this.drainOutbox(context.tenantId);
    return result;
  }

  private readonly outboxMaxAttempts = 8;

  async drainOutbox(tenantId?: string) {
    for (const event of await this.store.listPendingOutbox(tenantId)) {
      try {
        if (event.eventType === "sales.shipment-request.requested.v1") {
          await this.consumeShipmentRequested(event);
        }
        await this.store.markOutboxPublished(event.tenantId, event.eventId);
      } catch (error) {
        await this.store.markOutboxFailed(
          event.tenantId,
          event.eventId,
          error instanceof Error ? error.message : "Unknown outbox drain error",
          this.outboxMaxAttempts,
        );
      }
    }
  }

  private async consumeShipmentRequested(event: ReliableEvent) {
    await this.store.transaction(async (store) => {
      if (await store.getInbox(event.tenantId, "inventory-fulfillment", event.eventId)) return;
      const request = await store.getRequest(event.tenantId, String(event.payload.shipmentRequestId));
      const order = request ? await store.getOrder(event.tenantId, request.salesOrderId) : undefined;
      if (!request || !order) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "发货申请事件缺少来源聚合", "检查 Outbox 数据完整性后重试", { retryable: true });
      if (!await store.getTaskByRequest(event.tenantId, request.id)) {
        const task: ShipmentTask = {
          id: randomUUID(), tenantId: event.tenantId, shipmentRequestId: request.id, salesOrderId: order.id,
          requestNo: request.requestNo, salesOrderNo: order.orderNo, orderRevision: request.orderRevision,
          allowPartialShipment: order.allowPartialShipment, warehouseId: request.warehouseId, workflowStatus: "REQUESTED",
          availabilityStatus: "UNCHECKED", replenishmentStatus: "NOT_REQUIRED", postingStatus: "NOT_STARTED",
          recipientSnapshot: order.recipient,
          lines: request.lines.map((line) => {
            const source = order.lines.find((item) => item.id === line.orderLineId)!;
            return { ...line, shipmentRequestLineId: line.id, allowPartialShipment: order.allowPartialShipment && source.allowPartialShipment, promisedDate: source.promisedDate };
          }),
          correlationId: order.correlationId, version: 1, createdAt: event.createdAt, updatedAt: now(),
        };
        await store.insertTask(task);
        await store.addTimeline(event.tenantId, order.id, { eventType: "inventory.shipment-task.created.v1", aggregateType: "InventoryShipmentTask", aggregateId: task.id, status: task.workflowStatus, occurredAt: now(), traceId: event.traceId, summary: "仓库发货任务已创建" });
      }
      await store.addInbox({ tenantId: event.tenantId, consumerName: "inventory-fulfillment", eventId: event.eventId, eventType: event.eventType, processedAt: now() });
    });
  }

  async listTasks(context: RequestContext, filters: { warehouseId?: string; workflowStatus?: string; salesOrderId?: string; page: number; pageSize: number }) {
    requirePermission(context, "inventory.shipment-task.read");
    let items = (await this.store.listTasks(context.tenantId)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (filters.warehouseId) items = items.filter((item) => item.warehouseId === filters.warehouseId);
    if (filters.workflowStatus) items = items.filter((item) => item.workflowStatus === filters.workflowStatus);
    if (filters.salesOrderId) items = items.filter((item) => item.salesOrderId === filters.salesOrderId);
    const total = items.length; const start = (filters.page - 1) * filters.pageSize;
    return { items: items.slice(start, start + filters.pageSize).map((item) => this.presentTask(item)), total, page: filters.page, pageSize: filters.pageSize };
  }

  private presentTask(task: ShipmentTask) {
    const { phoneCiphertext: _ciphertext, phoneKeyId: _keyId, ...recipient } = task.recipientSnapshot;
    const { recipientSnapshot: _snapshot, ...value } = task;
    return { ...value, recipient };
  }

  async getTask(context: RequestContext, id: string) {
    requirePermission(context, "inventory.shipment-task.read");
    const task = await this.store.getTask(context.tenantId, id);
    if (!task) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试");
    return this.presentTask(task);
  }

  async receiveAvailability(context: RequestContext, input: Omit<AvailabilityFact, "tenantId" | "sourceEventId"> & { eventId: string }) {
    requirePermission(context, "inventory.availability.sync");
    return this.store.transaction(async (store) => {
      const duplicate = await store.getInbox(context.tenantId, "inventory-availability", input.eventId);
      if (duplicate) return { duplicate: true, projectionResult: "DUPLICATE" };
      const expected = subtractDecimal(subtractDecimal(subtractDecimal(input.qualifiedOnHandQty, input.allocatedReservedQty), input.frozenQty), input.safetyStockQty);
      const fulfillable = compareDecimal(expected, "0") < 0 ? "0" : expected;
      if (fulfillable !== input.fulfillableQty) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "可履约量与冻结公式不一致", "按 FULFILLABLE-V1 重新计算事件数据", { details: { expected: fulfillable, actual: input.fulfillableQty } });
      const fact: AvailabilityFact = { ...input, tenantId: context.tenantId, sourceEventId: input.eventId };
      const projectionResult = await store.upsertAvailability(fact);
      await store.addInbox({ tenantId: context.tenantId, consumerName: "inventory-availability", eventId: input.eventId, eventType: "inventory.availability.changed.v1", processedAt: now() });
      if (projectionResult !== "STALE") {
        const candidates = (await store.listTasks(context.tenantId)).filter((task) => task.warehouseId === fact.warehouseId && task.replenishmentStatus === "IN_PROGRESS" && task.lines.some((line) => line.productId === fact.productId && compareDecimal(line.shortageQty, "0") > 0));
        for (const task of candidates) {
          await store.updateTask({ ...task, availabilityStatus: "RECHECKING", replenishmentStatus: "AVAILABLE", version: task.version + 1, updatedAt: now() }, task.version);
        }
      }
      return { duplicate: false, projectionResult: projectionResult === "CREATED" ? "INSERTED" : projectionResult };
    });
  }

  async getAvailability(context: RequestContext, warehouseId: string, productIds: string[]) {
    requirePermission(context, "inventory.availability.read");
    return this.gateway.availability(this.store, context.tenantId, warehouseId, productIds);
  }

  async checkAndReserve(context: RequestContext, taskId: string, input: { shipmentRequestId: string; orderRevision: number; expectedFactVersions?: Array<{ productId: string; factVersion: number }> }) {
    requirePermission(context, "inventory.reservation.create");
    return this.command<Record<string, unknown>>(context, "inventory.reservation.create", { taskId, ...input, version: context.expectedVersion }, async (store) => {
      const task = await store.getTask(context.tenantId, taskId);
      if (!task) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试");
      requireExpectedVersion(context, task.version);
      if (input.shipmentRequestId !== task.shipmentRequestId || input.orderRevision !== task.orderRevision) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "发货申请或订单版本已变化", "刷新仓库任务后重新校验");
      if (!["UNCHECKED", "SHORTAGE", "RECHECKING", "PARTIALLY_RESERVED"].includes(task.availabilityStatus)) throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "当前任务无需重复预留", "查询既有预留和出库单");
      for (const expected of input.expectedFactVersions ?? []) {
        const fact = await store.getAvailability(context.tenantId, task.warehouseId, expected.productId);
        if (!fact || fact.factVersion !== expected.factVersion) throw new FulfillmentError("FULFILLMENT_409_VERSION_CONFLICT", "库存事实版本已变化", "刷新库存事实后重新校验和预留", { details: { productId: expected.productId, expectedFactVersion: expected.factVersion, actualFactVersion: fact?.factVersion } });
      }
      const outstanding = task.lines.map((line) => ({ ...line, requestedQty: subtractDecimal(line.requestedQty, line.reservedQty) })).filter((line) => compareDecimal(line.requestedQty, "0") > 0);
      const allowPartial = task.lines.every((line) => line.allowPartialShipment);
      const result = await this.gateway.checkAndReserve(store, { tenantId: context.tenantId, warehouseId: task.warehouseId, idempotencyKey: requireIdempotency(context), allowPartial, lines: outstanding.map((line) => ({ lineId: line.id, productId: line.productId, requestedQty: line.requestedQty, uom: line.uom })) });
      if (result.outcome === "PROCESSING_UNKNOWN") {
        const updated = { ...task, workflowStatus: "PROCESSING_UNKNOWN" as const, availabilityStatus: "CHECKING" as const, version: task.version + 1, updatedAt: now() };
        await store.updateTask(updated, task.version);
        await this.audit(store, context, { aggregateType: "InventoryShipmentTask", aggregateId: task.id, aggregateVersion: updated.version, action: "CHECK_AND_RESERVE_PROCESSING_UNKNOWN", correlationId: task.correlationId, before: this.presentTask(task), after: this.presentTask(updated) });
        return { statusCode: 202, body: { outcome: result.outcome, result: "PROCESSING_UNKNOWN", adapterKind: result.adapterKind, task: this.presentTask(updated), shipmentTask: this.presentTask(updated), reservations: [], traceId: context.traceId } };
      }
      if (result.outcome === "REJECTED") throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "库存权威源拒绝预留", "检查库存事实和 WMS 映射后使用原业务操作重试", { retryable: false, details: { failureCode: result.failureCode, adapterKind: result.adapterKind } });
      const timestamp = now();
      const reservation: Reservation = {
        id: randomUUID(), tenantId: context.tenantId, shipmentTaskId: task.id, warehouseId: task.warehouseId,
        externalReservationId: result.externalReservationId!, status: result.outcome === "SUCCEEDED" ? "ACTIVE" : "PARTIAL",
        factVersion: result.factVersion!, formulaVersion: result.formulaVersion!,
        reservedQty: sum(result.lines.map((line) => line.reservedQty)), consumedQty: "0", releasedQty: "0", uom: result.lines[0]?.uom ?? "PCS",
        lines: result.lines.map((line) => ({ taskLineId: line.lineId, orderLineId: task.lines.find((item) => item.id === line.lineId)!.orderLineId, productId: line.productId, requestedQty: line.requestedQty, reservedQty: line.reservedQty, consumedQty: "0", releasedQty: "0", uom: line.uom })),
        version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      const nextLines = task.lines.map((line) => { const decision = result.lines.find((item) => item.lineId === line.id); return decision ? { ...line, reservedQty: addDecimal(line.reservedQty, decision.reservedQty), shortageQty: decision.shortageQty } : line; });
      const hasShortage = nextLines.some((line) => compareDecimal(line.shortageQty, "0") > 0);
      const existingOutbound = task.outboundId ? await store.getOutbound(context.tenantId, task.outboundId) : undefined;
      const outbound: SalesOutbound = {
        id: existingOutbound?.id ?? randomUUID(), tenantId: context.tenantId, shipmentTaskId: task.id, shipmentRequestId: task.shipmentRequestId,
        salesOrderId: task.salesOrderId, outboundNo: existingOutbound?.outboundNo ?? `OUT-${task.requestNo.slice(3)}`, warehouseId: task.warehouseId,
        status: "RESERVED", lines: nextLines.filter((line) => compareDecimal(line.reservedQty, "0") > 0).map((line) => {
          const existingLine = existingOutbound?.lines.find((item) => item.orderLineId === line.orderLineId);
          return { id: existingLine?.id ?? randomUUID(), taskLineId: line.id, orderLineId: line.orderLineId, productId: line.productId, requestedQty: line.requestedQty, reservedQty: line.reservedQty, postedQty: existingLine?.postedQty ?? line.postedQty, uom: line.uom };
        }),
        version: existingOutbound ? existingOutbound.version + 1 : 1, correlationId: task.correlationId,
        createdAt: existingOutbound?.createdAt ?? timestamp, updatedAt: timestamp,
      };
      const updatedTask: ShipmentTask = { ...task, workflowStatus: "ACTIVE", availabilityStatus: hasShortage ? (compareDecimal(reservation.reservedQty, "0") > 0 ? "PARTIALLY_RESERVED" : "SHORTAGE") : "RESERVED", replenishmentStatus: hasShortage ? "REQUIRED" : "NOT_REQUIRED", inventoryFactVersion: result.factVersion, outboundId: outbound.id, lines: nextLines, version: task.version + 1, updatedAt: timestamp };
      await store.insertReservation(reservation);
      if (existingOutbound) await store.updateOutbound(outbound, existingOutbound.version); else await store.insertOutbound(outbound);
      await store.updateTask(updatedTask, task.version);
      await this.syncReservationToSales(store, updatedTask, context);
      await this.audit(store, context, { aggregateType: "InventoryShipmentTask", aggregateId: task.id, aggregateVersion: updatedTask.version, action: "CHECK_AND_RESERVE", correlationId: task.correlationId, before: this.presentTask(task), after: this.presentTask(updatedTask) });
      await store.addTimeline(context.tenantId, task.salesOrderId, this.timeline(hasShortage ? "inventory.shortage.detected.v1" : "inventory.reservation.created.v1", "InventoryShipmentTask", task.id, updatedTask.availabilityStatus, context, hasShortage ? "库存存在缺口" : "库存预留完成"));
      await store.addOutbox(this.outbox(context.tenantId, hasShortage ? "inventory.shortage.detected.v1" : "inventory.reservation.created.v1", "InventoryShipmentTask", task.id, updatedTask.version, task.correlationId, context.traceId, {
        shipmentRequestId: task.shipmentRequestId, salesOrderId: task.salesOrderId, warehouseId: task.warehouseId,
        factVersion: reservation.factVersion, formulaVersion: reservation.formulaVersion, outboundId: outbound.id,
        lines: nextLines.map((line) => ({ reservationId: reservation.id, orderLineId: line.orderLineId, productId: line.productId, requestedQty: line.requestedQty, reservedQty: line.reservedQty, shortageQty: line.shortageQty, uom: line.uom })),
      }));
      return { statusCode: 200, body: { outcome: result.outcome, result: updatedTask.availabilityStatus, adapterKind: result.adapterKind, task: this.presentTask(updatedTask), shipmentTask: this.presentTask(updatedTask), reservations: [reservation], reservation, outbound, traceId: context.traceId } };
    });
  }

  private async syncReservationToSales(store: FulfillmentStore, task: ShipmentTask, context: RequestContext) {
    const request = await store.getRequest(context.tenantId, task.shipmentRequestId); const order = await store.getOrder(context.tenantId, task.salesOrderId);
    if (!request || !order) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "销售履约投影缺失", "检查跨域关联后重试", { retryable: true });
    const lines = request.lines.map((line) => { const taskLine = task.lines.find((item) => item.shipmentRequestLineId === line.id)!; return { ...line, reservedQty: taskLine.reservedQty, shortageQty: taskLine.shortageQty }; });
    const hasShortage = lines.some((line) => compareDecimal(line.shortageQty, "0") > 0);
    await store.updateRequest({ ...request, workflowStatus: task.workflowStatus, availabilityStatus: task.availabilityStatus, replenishmentStatus: task.replenishmentStatus, inventoryFactVersion: task.inventoryFactVersion, outboundId: task.outboundId, lines, version: request.version + 1, updatedAt: now() }, request.version);
    await store.updateOrder({ ...order, overallStatus: hasShortage ? order.overallStatus : "CONFIRMED", lines: order.lines.map((line) => { const taskLine = task.lines.find((item) => item.orderLineId === line.id); return taskLine ? { ...line, reservedQty: taskLine.reservedQty, lineStatus: hasShortage ? line.lineStatus : "RESERVED" } : line; }), version: order.version + 1, updatedAt: now() }, order.version);
  }

  async createProductionRequest(context: RequestContext, taskId: string, input: { lines: Array<{ shipmentRequestLineId: string; orderLineId: string; sourceRevision: number; factoryResourceId: string; dueDate: string }> }) {
    requirePermission(context, "inventory.production-request.create");
    return this.command(context, "inventory.production-request.create", { taskId, ...input, version: context.expectedVersion }, async (store) => {
      const task = await store.getTask(context.tenantId, taskId);
      if (!task) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "仓库发货任务不存在", "刷新任务列表后重试");
      requireExpectedVersion(context, task.version);
      if (task.replenishmentStatus !== "REQUIRED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "当前任务没有已确认的生产缺口", "先完成权威库存校验");
      const order = await store.getOrder(context.tenantId, task.salesOrderId);
      if (!order) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "来源销售订单不存在", "检查关联数据后重试");
      const created: ProductionDemandResult[] = [];
      const nextLines = [...task.lines];
      for (let index = 0; index < nextLines.length; index += 1) {
        const line = nextLines[index];
        if (compareDecimal(line.shortageQty, "0") <= 0 || line.productionDemandId) continue;
        const requested = input.lines.find((item) => item.shipmentRequestLineId === line.shipmentRequestLineId && item.orderLineId === line.orderLineId);
        if (!requested) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "缺口行缺少生产申请参数", "为每个缺口行提供工厂、交期和来源版本");
        const demand = await this.options.createProductionDemand(context, { shipmentRequestId: task.shipmentRequestId, shipmentRequestLineId: line.shipmentRequestLineId, salesOrderId: task.salesOrderId, salesOrderLineId: line.orderLineId, productId: line.productId, qty: line.shortageQty, uom: line.uom, dueDate: requested.dueDate, factoryResourceId: requested.factoryResourceId, warehouseId: task.warehouseId, correlationId: task.correlationId, inventoryFactVersion: task.inventoryFactVersion });
        created.push(demand); nextLines[index] = { ...line, productionDemandId: demand.id };
      }
      const updated: ShipmentTask = { ...task, replenishmentStatus: "IN_PROGRESS", lines: nextLines, version: task.version + 1, updatedAt: now() };
      await store.updateTask(updated, task.version);
      const request = await store.getRequest(context.tenantId, task.shipmentRequestId);
      if (request) await store.updateRequest({ ...request, replenishmentStatus: "IN_PROGRESS", lines: request.lines.map((line) => ({ ...line, productionDemandId: nextLines.find((item) => item.shipmentRequestLineId === line.id)?.productionDemandId })), version: request.version + 1, updatedAt: now() }, request.version);
      await store.updateOrder({ ...order, overallStatus: "REPLENISHING", version: order.version + 1, updatedAt: now() }, order.version);
      await this.audit(store, context, { aggregateType: "InventoryShipmentTask", aggregateId: task.id, aggregateVersion: updated.version, action: "CREATE_PRODUCTION_REQUEST", correlationId: task.correlationId, before: this.presentTask(task), after: this.presentTask(updated) });
      await store.addTimeline(context.tenantId, task.salesOrderId, this.timeline("production.demand.created.v1", "InventoryShipmentTask", task.id, "IN_PROGRESS", context, "缺口已转生产补货"));
      for (const demand of created) {
        const line = nextLines.find((item) => item.productionDemandId === demand.id)!;
        await store.addOutbox(this.outbox(context.tenantId, "production.demand.created.v1", "ProductionDemand", demand.id, 1, task.correlationId, context.traceId, {
          demandId: demand.id, demandCode: demand.code, shipmentRequestId: task.shipmentRequestId,
          requestLineId: line.shipmentRequestLineId, salesOrderId: task.salesOrderId, orderLineId: line.orderLineId,
          sourceRevision: 1, productId: line.productId, shortageQty: line.shortageQty, uom: line.uom,
          dueDate: input.lines.find((item) => item.shipmentRequestLineId === line.shipmentRequestLineId)!.dueDate,
          factoryResourceId: input.lines.find((item) => item.shipmentRequestLineId === line.shipmentRequestLineId)!.factoryResourceId,
          status: "RECEIVED",
        }));
      }
      const links = nextLines.filter((line) => line.productionDemandId).map((line) => ({ shipmentRequestLineId: line.shipmentRequestLineId, orderLineId: line.orderLineId, demandId: line.productionDemandId, demandCode: created.find((item) => item.id === line.productionDemandId)?.code ?? line.productionDemandId, sourceRevision: 1, shortageQty: line.shortageQty, uom: line.uom }));
      return { statusCode: created.length > 0 ? 201 : 200, body: { task: this.presentTask(updated), shipmentTask: this.presentTask(updated), demands: created, links, restored: created.length === 0, recovered: created.length === 0, traceId: context.traceId } };
    });
  }

  async getReservation(context: RequestContext, id: string) {
    requirePermission(context, "inventory.outbound.read"); const value = await this.store.getReservation(context.tenantId, id);
    if (!value) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "库存预留不存在", "刷新任务详情后重试"); return value;
  }

  async releaseReservation(context: RequestContext, id: string, input: { reason: string; compensationId: string }) {
    requirePermission(context, "inventory.reservation.release");
    return this.command(context, "inventory.reservation.release", { id, ...input, version: context.expectedVersion }, async (store) => {
      const value = await store.getReservation(context.tenantId, id); if (!value) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "库存预留不存在", "刷新任务详情后重试");
      requireExpectedVersion(context, value.version);
      const releasableLines = value.lines.map((line) => ({ lineId: line.taskLineId, productId: line.productId, qty: subtractDecimal(line.reservedQty, addDecimal(line.consumedQty, line.releasedQty)), uom: line.uom })).filter((line) => compareDecimal(line.qty, "0") > 0);
      const result = await this.gateway.release(store, { tenantId: context.tenantId, warehouseId: value.warehouseId, idempotencyKey: requireIdempotency(context), lines: releasableLines });
      if (result.outcome === "PROCESSING_UNKNOWN") return { statusCode: 202, body: value };
      if (result.outcome !== "SUCCEEDED") throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "WMS 未确认释放预留", "使用原幂等键查询释放结果", { retryable: false });
      const releasedQty = sum(releasableLines.map((line) => line.qty)); const updated: Reservation = { ...value, status: "RELEASED", releasedQty: addDecimal(value.releasedQty, releasedQty), lines: value.lines.map((line) => ({ ...line, releasedQty: subtractDecimal(line.reservedQty, line.consumedQty) })), version: value.version + 1, updatedAt: now() };
      await store.updateReservation(updated, value.version);
      await this.audit(store, context, { aggregateType: "InventoryReservation", aggregateId: value.id, aggregateVersion: updated.version, action: "RELEASE", correlationId: randomUUID(), before: value, after: updated, reason: input.reason });
      for (let index = 0; index < releasableLines.length; index += 1) await store.addTransaction({ id: randomUUID(), tenantId: context.tenantId, transactionNo: transactionNo(), externalTransactionId: result.externalTransactionIds[index], type: "RESERVATION_RELEASE", warehouseId: value.warehouseId, productId: releasableLines[index].productId, qty: releasableLines[index].qty, uom: releasableLines[index].uom, sourceType: "InventoryReservation", sourceId: id, sourceLineId: releasableLines[index].lineId, factVersion: value.factVersion, correlationId: randomUUID(), traceId: context.traceId, occurredAt: now() });
      await store.addOutbox(this.outbox(context.tenantId, "inventory.reservation.released.v1", "InventoryReservation", id, updated.version, randomUUID(), context.traceId, { reservationId: id, lines: releasableLines.map((line) => ({ orderLineId: value.lines.find((item) => item.taskLineId === line.lineId)!.orderLineId, releasedQty: line.qty, uom: line.uom })), reasonCode: "APPROVED_COMPENSATION", reason: input.reason, compensationId: input.compensationId }));
      return { statusCode: 200, body: updated };
    });
  }

  async getOutbound(context: RequestContext, id: string) {
    requirePermission(context, "inventory.outbound.read"); const value = await this.store.getOutbound(context.tenantId, id);
    if (!value) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售出库单不存在", "刷新任务详情后重试"); return value;
  }

  async postOutbound(context: RequestContext, id: string, input: { lines: Array<{ outboundLineId: string; qty: string; uom: string }>; shippedAt: string; carrier?: string; trackingNo?: string }) {
    requirePermission(context, "inventory.outbound.post");
    return this.command<Record<string, unknown>>(context, "inventory.outbound.post", { id, ...input, version: context.expectedVersion }, async (store) => {
      const outbound = await store.getOutbound(context.tenantId, id); if (!outbound) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售出库单不存在", "刷新任务详情后重试");
      requireExpectedVersion(context, outbound.version);
      const postLines = input.lines.map((line) => {
        const source = outbound.lines.find((item) => item.id === line.outboundLineId);
        if (!source || source.uom !== line.uom) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "出库行与预留不一致", "按出库单可发数量提交");
        const remaining = subtractDecimal(source.reservedQty, source.postedQty);
        if (compareDecimal(line.qty, remaining) > 0) throw new FulfillmentError("FULFILLMENT_422_QUANTITY_VIOLATION", "出库数量超过未消费预留", "减少出库数量", { details: { outboundLineId: line.outboundLineId, remaining } });
        return { lineId: source.id, productId: source.productId, qty: line.qty, uom: line.uom };
      });
      const postingKey = requireIdempotency(context);
      const result = await this.gateway.postOutbound(store, { tenantId: context.tenantId, warehouseId: outbound.warehouseId, idempotencyKey: postingKey, lines: postLines });
      if (result.outcome === "PROCESSING_UNKNOWN") { const updated = { ...outbound, status: "PROCESSING_UNKNOWN" as const, postingKey, version: outbound.version + 1, updatedAt: now() }; await store.updateOutbound(updated, outbound.version); await this.audit(store, context, { aggregateType: "SalesOutbound", aggregateId: outbound.id, aggregateVersion: updated.version, action: "POST_PROCESSING_UNKNOWN", correlationId: outbound.correlationId, before: outbound, after: updated }); return { statusCode: 202, body: { outcome: result.outcome, result: "PROCESSING_UNKNOWN", adapterKind: result.adapterKind, outbound: updated, transactions: [], traceId: context.traceId } }; }
      if (result.outcome !== "SUCCEEDED" && result.outcome !== "PARTIALLY_SUCCEEDED") throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "WMS 拒绝销售出库", "检查出库数据后使用原 postingKey 重试", { details: { failureCode: result.failureCode } });
      const postedAt = input.shippedAt; const lines = outbound.lines.map((line) => { const posted = result.lines.find((item) => item.lineId === line.id); return posted ? { ...line, postedQty: addDecimal(line.postedQty, posted.postedQty) } : line; });
      const fullyPosted = lines.every((line) => compareDecimal(line.postedQty, line.reservedQty) === 0);
      const updatedOutbound: SalesOutbound = { ...outbound, postingKey, lines, status: fullyPosted ? "POSTED" : "PARTIALLY_POSTED", version: outbound.version + 1, updatedAt: postedAt, postedAt };
      await store.updateOutbound(updatedOutbound, outbound.version);
      await this.audit(store, context, { aggregateType: "SalesOutbound", aggregateId: outbound.id, aggregateVersion: updatedOutbound.version, action: "POST", correlationId: outbound.correlationId, before: outbound, after: updatedOutbound });
      const transactions: InventoryTransaction[] = [];
      for (let index = 0; index < result.lines.length; index += 1) { const line = result.lines[index]; if (compareDecimal(line.postedQty, "0") > 0) { const transaction: InventoryTransaction = { id: randomUUID(), tenantId: context.tenantId, transactionNo: transactionNo(), externalTransactionId: result.externalTransactionIds[index], type: "SALES_OUTBOUND", warehouseId: outbound.warehouseId, productId: line.productId, qty: line.postedQty, uom: line.uom, sourceType: "SalesOutbound", sourceId: outbound.id, sourceLineId: line.lineId, correlationId: outbound.correlationId, traceId: context.traceId, occurredAt: postedAt }; await store.addTransaction(transaction); transactions.push(transaction); } }
      await this.applyOutboundToTaskAndSales(store, updatedOutbound, result.lines.map((line) => ({ orderLineId: outbound.lines.find((item) => item.id === line.lineId)!.orderLineId, postedQty: line.postedQty })), context);
      await store.addOutbox(this.outbox(context.tenantId, fullyPosted ? "inventory.sales-outbound.posted.v1" : "inventory.sales-outbound.partially-posted.v1", "SalesOutbound", outbound.id, updatedOutbound.version, outbound.correlationId, context.traceId, {
        outboundId: outbound.id, externalTransactionIds: result.externalTransactionIds, shipmentRequestId: outbound.shipmentRequestId,
        salesOrderId: outbound.salesOrderId, postedAt, lines: updatedOutbound.lines.map((line) => ({ orderLineId: line.orderLineId, postedQty: result.lines.find((item) => item.lineId === line.id)?.postedQty ?? "0", cumulativePostedQty: line.postedQty, remainingQty: subtractDecimal(line.requestedQty, line.postedQty), uom: line.uom })),
      }));
      if (fullyPosted && this.options.onSalesOutboundPosted) {
        const orderForFin = await store.getOrder(context.tenantId, outbound.salesOrderId);
        if (orderForFin) {
          try { await this.options.onSalesOutboundPosted(context, { salesOrderId: orderForFin.id, salesOrderNo: orderForFin.orderNo, customerId: orderForFin.customerId, customerName: orderForFin.customerName, totalAmount: orderForFin.totalAmount, currency: orderForFin.currency, correlationId: outbound.correlationId, postedAt }); } catch { /* financial callback best-effort */ }
        }
      }
      return { statusCode: 200, body: { outcome: result.outcome, result: updatedOutbound.status, adapterKind: result.adapterKind, outbound: updatedOutbound, transactions, traceId: context.traceId, externalTransactionIds: result.externalTransactionIds } };
    });
  }

  private async applyOutboundToTaskAndSales(store: FulfillmentStore, outbound: SalesOutbound, posted: Array<{ orderLineId: string; postedQty: string }>, context: RequestContext) {
    const task = await store.getTask(context.tenantId, outbound.shipmentTaskId); const request = await store.getRequest(context.tenantId, outbound.shipmentRequestId); const order = await store.getOrder(context.tenantId, outbound.salesOrderId);
    if (!task || !request || !order) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "出库回写目标缺失", "检查聚合关联后重试", { retryable: true });
    const remainingByOrderLine = new Map(posted.map((item) => [item.orderLineId, item.postedQty]));
    for (const reservation of (await store.listReservationsByTask(context.tenantId, task.id)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
      let changed = false;
      const lines = reservation.lines.map((line) => {
        const remaining = remainingByOrderLine.get(line.orderLineId) ?? "0";
        const consumable = subtractDecimal(line.reservedQty, addDecimal(line.consumedQty, line.releasedQty));
        const consumed = minDecimal(remaining, consumable);
        if (compareDecimal(consumed, "0") <= 0) return line;
        changed = true; remainingByOrderLine.set(line.orderLineId, subtractDecimal(remaining, consumed));
        return { ...line, consumedQty: addDecimal(line.consumedQty, consumed) };
      });
      if (changed) {
        const consumedQty = sum(lines.map((line) => line.consumedQty));
        const fullyConsumed = lines.every((line) => compareDecimal(addDecimal(line.consumedQty, line.releasedQty), line.reservedQty) === 0);
        await store.updateReservation({ ...reservation, lines, consumedQty, status: fullyConsumed ? "CONSUMED" : reservation.status, version: reservation.version + 1, updatedAt: now() }, reservation.version);
      }
    }
    const taskLines = task.lines.map((line) => { const value = posted.find((item) => item.orderLineId === line.orderLineId); return value ? { ...line, postedQty: addDecimal(line.postedQty, value.postedQty) } : line; });
    const requestDone = taskLines.every((line) => compareDecimal(line.postedQty, line.requestedQty) === 0);
    await store.updateTask({ ...task, lines: taskLines, postingStatus: requestDone ? "POSTED" : "PARTIALLY_POSTED", workflowStatus: requestDone ? "COMPLETED" : "ACTIVE", version: task.version + 1, updatedAt: now() }, task.version);
    await store.updateRequest({ ...request, lines: request.lines.map((line) => ({ ...line, postedQty: taskLines.find((item) => item.shipmentRequestLineId === line.id)!.postedQty })), postingStatus: requestDone ? "POSTED" : "PARTIALLY_POSTED", workflowStatus: requestDone ? "COMPLETED" : "ACTIVE", version: request.version + 1, updatedAt: now() }, request.version);
    const orderLines = order.lines.map((line) => { const value = posted.find((item) => item.orderLineId === line.id); if (!value) return line; const shippedQty = addDecimal(line.shippedQty, value.postedQty); const remainingQty = subtractDecimal(line.orderedQty, shippedQty); return { ...line, shippedQty, remainingQty, activeRequestedQty: subtractDecimal(line.activeRequestedQty, value.postedQty), reservedQty: subtractDecimal(line.reservedQty, value.postedQty), lineStatus: compareDecimal(remainingQty, "0") === 0 ? "SHIPPED" as const : "PARTIALLY_SHIPPED" as const, version: line.version + 1 }; });
    const allShipped = orderLines.every((line) => line.lineStatus === "SHIPPED" || line.lineStatus === "CANCELED");
    const updatedOrder: SalesOrder = { ...order, lines: orderLines, overallStatus: allShipped ? "SHIPPED" : "PARTIALLY_SHIPPED", shipmentStatus: allShipped ? "SHIPPED" : "PARTIALLY_SHIPPED", version: order.version + 1, updatedAt: now() };
    await store.updateOrder(updatedOrder, order.version);
    await store.addTimeline(context.tenantId, order.id, this.timeline(allShipped ? "inventory.sales-outbound.posted.v1" : "inventory.sales-outbound.partially-posted.v1", "SalesOutbound", outbound.id, updatedOrder.overallStatus, context, allShipped ? "订单已全部发货" : "订单已部分发货"));
  }

  async listTransactions(context: RequestContext, filters: { warehouseId?: string; productId?: string; sourceId?: string; type?: string; page: number; pageSize: number }) {
    requirePermission(context, "inventory.transaction.read"); let items = (await this.store.listTransactions(context.tenantId)).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    if (filters.warehouseId) items = items.filter((item) => item.warehouseId === filters.warehouseId); if (filters.productId) items = items.filter((item) => item.productId === filters.productId); if (filters.sourceId) items = items.filter((item) => item.sourceId === filters.sourceId); if (filters.type) items = items.filter((item) => item.type === filters.type);
    const total = items.length; const start = (filters.page - 1) * filters.pageSize; return { items: items.slice(start, start + filters.pageSize), total, page: filters.page, pageSize: filters.pageSize };
  }

  async createPurchaseRequest(context: RequestContext, input: { mrpTaskId: string; demandId: string; materialId: string }) {
    requirePermission(context, "procurement.request.create");
    return this.command(context, "procurement.request.create", input, async (store) => {
      const task = await this.options.getProductionTask?.(context, input.mrpTaskId);
      if (!task || task.taskType !== "MRP_RUN" || task.status !== "SUCCEEDED") throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "MRP 结果不存在或尚未成功", "使用成功且包含缺料结果的 MRP 任务创建采购申请");
      const shortage = (task.result as { materialShortages?: Array<{ demandId: string; materialId: string; materialName?: string; warehouseId: string; shortageQty: string; uom: string; requiredDate: string }> } | undefined)?.materialShortages?.find((item) => item.demandId === input.demandId && item.materialId === input.materialId);
      if (!shortage || compareDecimal(shortage.shortageQty, "0") <= 0) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "MRP 任务没有对应采购缺口", "刷新 MRP 结果后选择仍有缺口的采购物料");
      const existing = await store.findPurchaseRequestByMrpLine(context.tenantId, input.mrpTaskId, input.demandId, input.materialId);
      if (existing) return { statusCode: 200, body: existing };
      const timestamp = now(); const id = randomUUID();
      const request: PurchaseRequest = {
        id, tenantId: context.tenantId, requestNo: `PR-${timestamp.slice(0, 10).replaceAll("-", "")}-${id.slice(0, 8).toUpperCase()}`,
        mrpTaskId: input.mrpTaskId, demandId: input.demandId, materialId: input.materialId, materialName: shortage.materialName,
        warehouseId: shortage.warehouseId, requiredQty: shortage.shortageQty, uom: shortage.uom, requiredDate: shortage.requiredDate,
        status: "PENDING_APPROVAL", correlationId: randomUUID(), createdBy: context.actorId, version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      await store.insertPurchaseRequest(request);
      await this.audit(store, context, { aggregateType: "PurchaseRequest", aggregateId: id, aggregateVersion: 1, action: "CREATE_FROM_MRP", correlationId: request.correlationId, after: request });
      await store.addOutbox(this.outbox(context.tenantId, "procurement.purchase-request.created.v1", "PurchaseRequest", id, 1, request.correlationId, context.traceId, { purchaseRequestId: id, mrpTaskId: input.mrpTaskId, demandId: input.demandId, materialId: input.materialId, requiredQty: request.requiredQty, uom: request.uom }));
      return { statusCode: 201, body: request };
    });
  }

  async listPurchaseRequests(context: RequestContext) {
    requirePermission(context, "procurement.request.read");
    const items = (await this.store.listPurchaseRequests(context.tenantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total: items.length };
  }

  async approvePurchaseRequest(context: RequestContext, id: string, input: { supplierId: string; supplierName: string; promisedDate: string; unitPrice?: string; taxRate?: string; currency?: string }) {
    requirePermission(context, "procurement.request.approve");
    return this.command(context, "procurement.request.approve", { id, ...input, version: context.expectedVersion }, async (store) => {
      const request = await store.getPurchaseRequest(context.tenantId, id);
      if (!request) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "采购申请不存在", "刷新采购申请列表后重试");
      requireExpectedVersion(context, request.version);
      if (request.createdBy === context.actorId) throw new FulfillmentError("FULFILLMENT_403_PERMISSION_DENIED", "采购申请制单人不能审批本人申请", "由其他采购审批人操作");
      if (request.status !== "PENDING_APPROVAL") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "采购申请当前不可审批", "刷新后查看既有采购订单");
      const timestamp = now(); const orderId = randomUUID();
      const order: PurchaseOrder = {
        id: orderId, tenantId: context.tenantId, orderNo: `PO-${timestamp.slice(0, 10).replaceAll("-", "")}-${orderId.slice(0, 8).toUpperCase()}`,
        purchaseRequestId: request.id, demandId: request.demandId, materialId: request.materialId, materialName: request.materialName,
        warehouseId: request.warehouseId, orderedQty: request.requiredQty, receivedQty: "0", uom: request.uom,
        supplierId: input.supplierId, supplierName: input.supplierName, promisedDate: input.promisedDate,
        unitPrice: input.unitPrice ?? "0", taxRate: input.taxRate ?? "0", currency: input.currency ?? "CNY",
        totalAmount: calculateLineAmount(request.requiredQty, input.unitPrice ?? "0", input.taxRate ?? "0"),
        status: "CONFIRMED", correlationId: request.correlationId, createdBy: context.actorId, version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      const updated: PurchaseRequest = { ...request, status: "CONVERTED", approvedBy: context.actorId, approvedAt: timestamp, purchaseOrderId: order.id, version: request.version + 1, updatedAt: timestamp };
      await store.insertPurchaseOrder(order); await store.updatePurchaseRequest(updated, request.version);
      await this.audit(store, context, { aggregateType: "PurchaseRequest", aggregateId: id, aggregateVersion: updated.version, action: "APPROVE_AND_CREATE_PO", correlationId: request.correlationId, before: request, after: updated });
      await store.addOutbox(this.outbox(context.tenantId, "procurement.purchase-order.created.v1", "PurchaseOrder", order.id, 1, order.correlationId, context.traceId, { purchaseOrderId: order.id, purchaseRequestId: request.id, demandId: order.demandId, materialId: order.materialId, orderedQty: order.orderedQty, uom: order.uom }));
      return { statusCode: 201, body: { request: updated, order } };
    });
  }

  async listPurchaseOrders(context: RequestContext) {
    requirePermission(context, "procurement.order.read");
    const items = (await this.store.listPurchaseOrders(context.tenantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total: items.length };
  }

  async receivePurchaseOrder(context: RequestContext, id: string, input: { externalTransactionId: string; receivedAt: string; receivedQty?: string; requireInspection?: boolean }) {
    requirePermission(context, "procurement.receipt.post");
    return this.command<{ order: PurchaseOrder; receipt: PurchaseReceipt; availability?: AvailabilityFact; transaction?: InventoryTransaction }>(context, "procurement.receipt.post", { id, ...input, version: context.expectedVersion }, async (store) => {
      const order = await store.getPurchaseOrder(context.tenantId, id);
      if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "采购订单不存在", "刷新采购订单列表后重试");
      requireExpectedVersion(context, order.version);
      if (order.status === "RECEIVED" || order.status === "CANCELED") {
        const existing = await store.getPurchaseReceiptByExternalId(context.tenantId, input.externalTransactionId);
        if (existing?.purchaseOrderId === order.id) return { statusCode: 200, body: { order, receipt: existing } };
        throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", order.status === "CANCELED" ? "采购订单已取消" : "采购订单已经完成入库", "查询既有采购入库单");
      }
      if (order.status !== "CONFIRMED" && order.status !== "PARTIALLY_RECEIVED") throw new FulfillmentError("FULFILLMENT_409_ILLEGAL_STATE", "采购订单当前状态不可收货", "刷新采购订单后重试");
      const qty = input.receivedQty ?? order.orderedQty;
      const newReceivedQty = addDecimal(order.receivedQty, qty);
      if (compareDecimal(newReceivedQty, order.orderedQty) > 0) throw new FulfillmentError("FULFILLMENT_400_INVALID_ARGUMENT", "收货数量超过采购订单数量", "核对收货数量后重试");
      const isFullReceived = compareDecimal(newReceivedQty, order.orderedQty) >= 0;
      const requireInspection = input.requireInspection ?? false;
      const receiptStatus = requireInspection ? "PENDING_INSPECTION" : "POSTED";
      const receiptId = randomUUID();
      const timestamp = input.receivedAt;

      // Only update inventory when not requiring inspection (direct posting)
      let fact: AvailabilityFact | undefined;
      let transaction: InventoryTransaction | undefined;
      if (!requireInspection) {
        const current = await store.getAvailability(context.tenantId, order.warehouseId, order.materialId);
        if (current && current.uom !== order.uom) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "采购入库单位与物料库存单位不一致", "修正采购订单单位后重试");
        const factVersion = (current?.factVersion ?? 0) + 1;
        const qualifiedOnHandQty = addDecimal(current?.qualifiedOnHandQty ?? "0", qty);
        fact = current ? {
          ...current, qualifiedOnHandQty, fulfillableQty: addDecimal(current.fulfillableQty, qty),
          factVersion, sourceSystem: "REFERENCE_WMS", sourceEventId: input.externalTransactionId, asOf: timestamp,
        } : {
          tenantId: context.tenantId, warehouseId: order.warehouseId, productId: order.materialId,
          qualifiedOnHandQty, allocatedReservedQty: "0", frozenQty: "0", safetyStockQty: "0", inTransitQty: "0",
          fulfillableQty: qualifiedOnHandQty, uom: order.uom, formulaVersion: "FULFILLABLE-V1", factVersion,
          sourceSystem: "REFERENCE_WMS", sourceEventId: input.externalTransactionId, asOf: timestamp,
        };
        transaction = { id: randomUUID(), tenantId: context.tenantId, transactionNo: transactionNo(), externalTransactionId: input.externalTransactionId, type: "PURCHASE_RECEIPT_INBOUND", warehouseId: order.warehouseId, productId: order.materialId, qty, uom: order.uom, sourceType: "PurchaseOrder", sourceId: order.id, factVersion, correlationId: order.correlationId, traceId: context.traceId, occurredAt: timestamp };
        if (!await store.addTransaction(transaction)) throw new FulfillmentError("FULFILLMENT_409_IDEMPOTENCY_CONFLICT", "采购入库外部流水号已存在", "查询既有采购入库结果");
        await store.upsertAvailability(fact);
        await this.options.syncProductionAvailability?.(context, fact);
      }

      const receipt: PurchaseReceipt = {
        id: receiptId, tenantId: context.tenantId, receiptNo: `RCV-${timestamp.slice(0, 10).replaceAll("-", "")}-${receiptId.slice(0, 8).toUpperCase()}`,
        purchaseOrderId: order.id, demandId: order.demandId, materialId: order.materialId, warehouseId: order.warehouseId,
        receivedQty: qty, uom: order.uom, externalTransactionId: input.externalTransactionId,
        inventoryFactVersion: fact?.factVersion ?? 0, status: receiptStatus, correlationId: order.correlationId,
        receivedBy: context.actorId, receivedAt: timestamp, version: 1,
      };
      const updated: PurchaseOrder = { ...order, receivedQty: newReceivedQty, status: isFullReceived ? "RECEIVED" : "PARTIALLY_RECEIVED", version: order.version + 1, updatedAt: timestamp };
      await store.insertPurchaseReceipt(receipt); await store.updatePurchaseOrder(updated, order.version);
      await this.audit(store, context, { aggregateType: "PurchaseOrder", aggregateId: id, aggregateVersion: updated.version, action: "POST_RECEIPT", correlationId: order.correlationId, before: order, after: updated });
      if (!requireInspection) {
        await store.addOutbox(this.outbox(context.tenantId, "inventory.purchase-receipt.posted.v1", "PurchaseReceipt", receipt.id, 1, order.correlationId, context.traceId, { purchaseReceiptId: receipt.id, purchaseOrderId: order.id, demandId: order.demandId, materialId: order.materialId, warehouseId: order.warehouseId, receivedQty: qty, uom: order.uom, inventoryFactVersion: fact!.factVersion }));
        if (this.options.onPurchaseReceiptPosted) {
          try { await this.options.onPurchaseReceiptPosted(context, { purchaseOrderId: order.id, purchaseOrderNo: order.orderNo, supplierId: order.supplierId, supplierName: order.supplierName, materialId: order.materialId, materialName: order.materialName, orderedQty: qty, uom: order.uom, correlationId: order.correlationId, receivedAt: timestamp }); } catch { /* financial callback best-effort */ }
        }
      }
      return { statusCode: 201, body: { order: updated, receipt, availability: fact, transaction } };
    });
  }

  async listPurchaseReceipts(context: RequestContext) {
    requirePermission(context, "procurement.receipt.read");
    const items = (await this.store.listPurchaseReceipts(context.tenantId)).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    return { items, total: items.length };
  }

  async receiveCompletion(context: RequestContext, input: {
    eventId: string; completionId: string; externalTransactionId: string; warehouseId: string;
    productId: string; qty: string; uom: string; occurredAt: string; correlationId?: string;
    inventoryFactVersion?: number; allocations?: Array<{ demandId: string; qty: string }>;
  }) {
    requirePermission(context, "inventory.availability.sync");
    return this.store.transaction(async (store) => {
      if (await store.getInbox(context.tenantId, "production-completion", input.eventId)) return { duplicate: true, projectionResult: "DUPLICATE" };
      const correlationId = input.correlationId ?? randomUUID();
      const transaction: InventoryTransaction = { id: randomUUID(), tenantId: context.tenantId, transactionNo: transactionNo(), externalTransactionId: input.externalTransactionId, type: "FG_COMPLETION_INBOUND", warehouseId: input.warehouseId, productId: input.productId, qty: input.qty, uom: input.uom, sourceType: "ProductionCompletion", sourceId: input.completionId, correlationId, traceId: context.traceId, occurredAt: input.occurredAt };
      const inserted = await store.addTransaction(transaction);
      if (inserted) {
        const current = await store.getAvailability(context.tenantId, input.warehouseId, input.productId);
        if (current && current.uom !== input.uom) throw new FulfillmentError("FULFILLMENT_424_DEPENDENCY_FAILED", "完工入库单位与库存事实不一致", "修正生产完工单位或库存物料单位后重试", { details: { inventoryUom: current.uom, completionUom: input.uom } });
        const factVersion = Math.max(input.inventoryFactVersion ?? 0, (current?.factVersion ?? 0) + 1);
        const availability: AvailabilityFact = current ? {
          ...current,
          qualifiedOnHandQty: addDecimal(current.qualifiedOnHandQty, input.qty),
          fulfillableQty: addDecimal(current.fulfillableQty, input.qty),
          factVersion,
          sourceSystem: "REFERENCE_WMS",
          sourceEventId: input.eventId,
          asOf: input.occurredAt,
        } : {
          tenantId: context.tenantId, warehouseId: input.warehouseId, productId: input.productId,
          qualifiedOnHandQty: input.qty, allocatedReservedQty: "0", frozenQty: "0", safetyStockQty: "0",
          inTransitQty: "0", fulfillableQty: input.qty, uom: input.uom, formulaVersion: "FULFILLABLE-V1",
          factVersion, sourceSystem: "REFERENCE_WMS", sourceEventId: input.eventId, asOf: input.occurredAt,
        };
        await store.upsertAvailability(availability);

        const demandIds = new Set((input.allocations ?? []).map((allocation) => allocation.demandId));
        const tasks = (await store.listTasks(context.tenantId)).filter((task) =>
          task.warehouseId === input.warehouseId && task.replenishmentStatus === "IN_PROGRESS"
          && task.lines.some((line) => line.productId === input.productId && line.productionDemandId && demandIds.has(line.productionDemandId)),
        );
        for (const task of tasks) {
          const updatedTask: ShipmentTask = { ...task, availabilityStatus: "RECHECKING", replenishmentStatus: "AVAILABLE", inventoryFactVersion: factVersion, version: task.version + 1, updatedAt: now() };
          await store.updateTask(updatedTask, task.version);
          const request = await store.getRequest(context.tenantId, task.shipmentRequestId);
          if (request) await store.updateRequest({ ...request, availabilityStatus: "RECHECKING", replenishmentStatus: "AVAILABLE", inventoryFactVersion: factVersion, version: request.version + 1, updatedAt: now() }, request.version);
          await store.addTimeline(context.tenantId, task.salesOrderId, this.timeline("production.completion.posted.v1", "ProductionCompletion", input.completionId, "AVAILABLE", context, "生产完工已入库，等待仓库重新校验"));
        }
      }
      await store.addInbox({ tenantId: context.tenantId, consumerName: "production-completion", eventId: input.eventId, eventType: "production.completion.posted.v1", processedAt: now() });
      return { duplicate: !inserted, projectionResult: inserted ? "INSERTED" : "DUPLICATE", availability: await store.getAvailability(context.tenantId, input.warehouseId, input.productId) };
    });
  }

  async fulfillmentTrace(context: RequestContext, orderId: string) {
    requirePermission(context, "sales.fulfillment-trace.read"); const order = await this.store.getOrder(context.tenantId, orderId);
    if (!order) throw new FulfillmentError("FULFILLMENT_404_NOT_FOUND", "销售订单不存在", "刷新订单列表后重试");
    return { salesOrderId: orderId, correlationId: order.correlationId, events: (await this.store.listTimeline(context.tenantId, orderId)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)) };
  }
}
