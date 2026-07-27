import { createHash, randomUUID } from "node:crypto";
import { ProductionError } from "../../errors.js";
import { addDecimal, compareDecimal, subtractDecimal } from "../../decimal.js";
import type { RequestContext } from "../../types.js";
import type { FinanceStore } from "./store.js";
import type {
  CostAccountingDto, CreateCostAccountingInput, CreateInvoiceInput, CreateVoucherInput,
  FinAuditLog, FinIdempotencyRecord, FinOutboxEvent, FinanceDashboardDto, FinanceListFilter,
  GeneratePayableInput, GenerateReceivableInput, InvoiceDto, PayableDto, PaymentDto,
  ReceivableDto, RegisterPaymentInput, VoucherDto, VoucherLineDto,
} from "./types.js";

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const docNo = (prefix: string) => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const datePart = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const random = randomUUID().slice(0, 8).toUpperCase();
  return `${prefix}-${datePart}-${random}`;
};

const requirePermission = (context: RequestContext, permission: string) => {
  if (!context.permissions.has("*") && !context.permissions.has(permission)) {
    throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", `缺少操作权限：${permission}`, "请联系管理员授予对应财务权限");
  }
};
const requireExpectedVersion = (context: RequestContext, actual: number) => {
  if (context.expectedVersion === undefined) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "缺少聚合版本", "刷新数据并携带最新 If-Match 后重试", { details: { actualVersion: actual } });
  if (context.expectedVersion !== actual) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "数据已被其他操作更新", "刷新数据后重新确认操作", { details: { expectedVersion: context.expectedVersion, actualVersion: actual } });
};
const requireIdempotency = (context: RequestContext) => {
  if (!context.idempotencyKey) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少幂等键", "提供 X-Idempotency-Key 后重试");
  return context.idempotencyKey;
};

export class FinanceService {
  private readonly outboxMaxAttempts = 5;

  constructor(private readonly store: FinanceStore) {}

  private async command<T>(context: RequestContext, commandType: string, input: unknown, work: (store: FinanceStore) => Promise<{ statusCode: number; body: T }>): Promise<{ statusCode: number; body: T; replayed?: boolean }> {
    const key = requireIdempotency(context);
    const requestHash = hash(input);
    return this.store.transaction(async (store) => {
      const existing = await store.getIdempotency(context.tenantId, commandType, key);
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "幂等键已用于不同请求", "为新业务操作使用新的幂等键");
        return { statusCode: existing.statusCode, body: existing.body as T, replayed: true };
      }
      const result = await work(store);
      const record: FinIdempotencyRecord = { tenantId: context.tenantId, commandType, key, requestHash, statusCode: result.statusCode, body: result.body };
      await store.saveIdempotency(record);
      return result;
    });
  }

  private outbox(tenantId: string, eventType: string, aggregateType: string, aggregateId: string, aggregateVersion: number, correlationId: string, traceId: string, payload: Record<string, unknown>): FinOutboxEvent {
    return { eventId: randomUUID(), tenantId, eventType, aggregateType, aggregateId, aggregateVersion, correlationId, traceId, payload, status: "PENDING", attempts: 0, createdAt: now() };
  }

  private async audit(store: FinanceStore, context: RequestContext, aggregateType: string, aggregateId: string, aggregateVersion: number, action: string, correlationId: string, before?: unknown, after?: unknown) {
    const log: FinAuditLog = {
      id: randomUUID(), tenantId: context.tenantId, aggregateType, aggregateId, aggregateVersion,
      action, actorId: context.actorId, before, after, correlationId, traceId: context.traceId, occurredAt: now(),
    };
    await store.addAuditLog(log);
  }

  // ===== Receivables (AR) =====

  async generateReceivable(context: RequestContext, input: GenerateReceivableInput): Promise<ReceivableDto> {
    return this.command<ReceivableDto>(context, "finance.receivable.generate", input, async (store) => {
      const existing = await store.getReceivableBySource(context.tenantId, input.sourceType, input.sourceId);
      if (existing) return { statusCode: 200, body: existing };
      const timestamp = now();
      const id = randomUUID();
      const dueDate = input.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const receivable: ReceivableDto = {
        id, tenantId: context.tenantId, docNo: docNo("AR"), title: input.customerName,
        customerId: input.customerId, customerName: input.customerName, businessType: "AR",
        sourceType: input.sourceType, sourceId: input.sourceId, sourceDocNo: input.sourceDocNo,
        currency: input.currency ?? "CNY", totalAmount: input.totalAmount, receivedAmount: "0",
        outstandingAmount: input.totalAmount, status: "pending", dueDate, issuedAt: timestamp,
        remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.saveReceivable(receivable);
      await this.audit(store, context, "Receivable", id, 1, "GENERATE", "", undefined, receivable);
      await store.addOutbox(this.outbox(context.tenantId, "finance.receivable.generated.v1", "Receivable", id, 1, "", context.traceId, { receivableId: id, sourceType: input.sourceType, sourceId: input.sourceId, totalAmount: input.totalAmount }));
      return { statusCode: 201, body: receivable };
    }).then((result) => result.body);
  }

  async listReceivables(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.receivable.read");
    return this.store.listReceivables(context.tenantId, filter);
  }

  async getReceivable(context: RequestContext, id: string) {
    requirePermission(context, "finance.receivable.read");
    const item = await this.store.getReceivable(context.tenantId, id);
    if (!item) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "应收单不存在或不在当前数据范围内", "请刷新列表并确认租户与数据权限");
    return item;
  }

  // ===== Payables (AP) =====

  async generatePayable(context: RequestContext, input: GeneratePayableInput): Promise<PayableDto> {
    return this.command<PayableDto>(context, "finance.payable.generate", input, async (store) => {
      const existing = await store.getPayableBySource(context.tenantId, input.sourceType, input.sourceId);
      if (existing) return { statusCode: 200, body: existing };
      const timestamp = now();
      const id = randomUUID();
      const dueDate = input.dueDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const payable: PayableDto = {
        id, tenantId: context.tenantId, docNo: docNo("AP"), title: input.supplierName,
        supplierId: input.supplierId, supplierName: input.supplierName, businessType: "AP",
        sourceType: input.sourceType, sourceId: input.sourceId, sourceDocNo: input.sourceDocNo,
        currency: input.currency ?? "CNY", totalAmount: input.totalAmount, paidAmount: "0",
        outstandingAmount: input.totalAmount, status: "pending", dueDate, issuedAt: timestamp,
        remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.savePayable(payable);
      await this.audit(store, context, "Payable", id, 1, "GENERATE", "", undefined, payable);
      await store.addOutbox(this.outbox(context.tenantId, "finance.payable.generated.v1", "Payable", id, 1, "", context.traceId, { payableId: id, sourceType: input.sourceType, sourceId: input.sourceId, totalAmount: input.totalAmount }));
      return { statusCode: 201, body: payable };
    }).then((result) => result.body);
  }

  async listPayables(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.payable.read");
    return this.store.listPayables(context.tenantId, filter);
  }

  async getPayable(context: RequestContext, id: string) {
    requirePermission(context, "finance.payable.read");
    const item = await this.store.getPayable(context.tenantId, id);
    if (!item) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "应付单不存在或不在当前数据范围内", "请刷新列表并确认租户与数据权限");
    return item;
  }

  // ===== Payments =====

  async registerPayment(context: RequestContext, input: RegisterPaymentInput): Promise<{ payment: PaymentDto; receivable?: ReceivableDto; payable?: PayableDto }> {
    requirePermission(context, "finance.payment.create");
    return this.command<{ payment: PaymentDto; receivable?: ReceivableDto; payable?: PayableDto }>(context, "finance.payment.register", input, async (store) => {
      const timestamp = now();
      const id = randomUUID();
      let receivable: ReceivableDto | undefined;
      let payable: PayableDto | undefined;

      if (input.direction === "INBOUND" && input.receivableId) {
        receivable = await store.getReceivable(context.tenantId, input.receivableId);
        if (!receivable) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "关联应收单不存在", "刷新应收列表后重试");
        if (receivable.status === "done" || receivable.status === "void") throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "应收单当前状态不允许收款", "刷新数据后重试");
        if (compareDecimal(input.amount, receivable.outstandingAmount) > 0) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "收款金额超过未收余额", "减少收款金额");
      }
      if (input.direction === "OUTBOUND" && input.payableId) {
        payable = await store.getPayable(context.tenantId, input.payableId);
        if (!payable) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "关联应付单不存在", "刷新应付列表后重试");
        if (payable.status === "done" || payable.status === "void") throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "应付单当前状态不允许付款", "刷新数据后重试");
        if (compareDecimal(input.amount, payable.outstandingAmount) > 0) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "付款金额超过未付余额", "减少付款金额");
      }

      const payment: PaymentDto = {
        id, tenantId: context.tenantId, docNo: docNo("PAY"), direction: input.direction,
        receivableId: input.receivableId, payableId: input.payableId,
        counterpartyId: input.counterpartyId, counterpartyName: input.counterpartyName,
        currency: input.currency ?? "CNY", amount: input.amount, paymentMethod: input.paymentMethod,
        paymentDate: input.paymentDate, bankAccount: input.bankAccount ?? "", referenceNo: input.referenceNo ?? "",
        status: "pending", remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.savePayment(payment);
      await this.audit(store, context, "Payment", id, 1, "REGISTER", "", undefined, payment);
      await store.addOutbox(this.outbox(context.tenantId, "finance.payment.registered.v1", "Payment", id, 1, "", context.traceId, { paymentId: id, direction: input.direction, amount: input.amount }));
      return { statusCode: 201, body: { payment, receivable, payable } };
    }).then((result) => result.body);
  }

  async confirmPayment(context: RequestContext, id: string): Promise<{ payment: PaymentDto; receivable?: ReceivableDto; payable?: PayableDto }> {
    requirePermission(context, "finance.payment.confirm");
    return this.command<{ payment: PaymentDto; receivable?: ReceivableDto; payable?: PayableDto }>(context, "finance.payment.confirm", { id, version: context.expectedVersion }, async (store) => {
      const payment = await store.getPayment(context.tenantId, id);
      if (!payment) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "收付款单不存在", "刷新列表后重试");
      requireExpectedVersion(context, payment.version);
      if (payment.status !== "pending") throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "收付款单当前状态不允许确认", "刷新数据后重试");

      const updatedPayment: PaymentDto = { ...payment, status: "done", version: payment.version + 1, updatedAt: now() };
      await store.savePayment(updatedPayment);

      let receivable: ReceivableDto | undefined;
      let payable: PayableDto | undefined;

      if (payment.direction === "INBOUND" && payment.receivableId) {
        receivable = await store.getReceivable(context.tenantId, payment.receivableId);
        if (receivable) {
          const receivedAmount = addDecimal(receivable.receivedAmount, payment.amount);
          const outstandingAmount = subtractDecimal(receivable.totalAmount, receivedAmount);
          const updatedReceivable: ReceivableDto = {
            ...receivable, receivedAmount, outstandingAmount,
            status: compareDecimal(outstandingAmount, "0") <= 0 ? "done" : "processing",
            settledAt: compareDecimal(outstandingAmount, "0") <= 0 ? now() : undefined,
            version: receivable.version + 1, updatedAt: now(),
          };
          await store.saveReceivable(updatedReceivable);
          receivable = updatedReceivable;
        }
      }
      if (payment.direction === "OUTBOUND" && payment.payableId) {
        payable = await store.getPayable(context.tenantId, payment.payableId);
        if (payable) {
          const paidAmount = addDecimal(payable.paidAmount, payment.amount);
          const outstandingAmount = subtractDecimal(payable.totalAmount, paidAmount);
          const updatedPayable: PayableDto = {
            ...payable, paidAmount, outstandingAmount,
            status: compareDecimal(outstandingAmount, "0") <= 0 ? "done" : "processing",
            settledAt: compareDecimal(outstandingAmount, "0") <= 0 ? now() : undefined,
            version: payable.version + 1, updatedAt: now(),
          };
          await store.savePayable(updatedPayable);
          payable = updatedPayable;
        }
      }

      await this.audit(store, context, "Payment", id, updatedPayment.version, "CONFIRM", "", payment, updatedPayment);
      await store.addOutbox(this.outbox(context.tenantId, "finance.payment.confirmed.v1", "Payment", id, updatedPayment.version, "", context.traceId, { paymentId: id, amount: payment.amount }));
      return { statusCode: 200, body: { payment: updatedPayment, receivable, payable } };
    }).then((result) => result.body);
  }

  async listPayments(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.payment.read");
    return this.store.listPayments(context.tenantId, filter);
  }

  // ===== Invoices =====

  async createInvoice(context: RequestContext, input: CreateInvoiceInput): Promise<InvoiceDto> {
    requirePermission(context, "finance.invoice.create");
    return this.command<InvoiceDto>(context, "finance.invoice.create", input, async (store) => {
      const timestamp = now();
      const id = randomUUID();
      const amountScaled = BigInt(Math.round(parseFloat(input.amount) * 1_000_000));
      const taxRateScaled = BigInt(Math.round(parseFloat(input.taxRate) * 1_000_000));
      const taxAmount = (amountScaled * taxRateScaled / 1_000_000n).toString();
      const invoice: InvoiceDto = {
        id, tenantId: context.tenantId, docNo: docNo("INV"), invoiceType: input.invoiceType,
        receivableId: input.receivableId, payableId: input.payableId,
        counterpartyId: input.counterpartyId, counterpartyName: input.counterpartyName,
        currency: "CNY", amount: input.amount, taxAmount, taxRate: input.taxRate,
        invoiceNo: input.invoiceNo ?? "", invoiceDate: input.invoiceDate, status: "pending",
        remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.saveInvoice(invoice);
      await this.audit(store, context, "Invoice", id, 1, "CREATE", "", undefined, invoice);
      return { statusCode: 201, body: invoice };
    }).then((result) => result.body);
  }

  async listInvoices(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.invoice.read");
    return this.store.listInvoices(context.tenantId, filter);
  }

  // ===== Vouchers =====

  async createVoucher(context: RequestContext, input: CreateVoucherInput): Promise<VoucherDto> {
    requirePermission(context, "finance.voucher.create");
    return this.command<VoucherDto>(context, "finance.voucher.create", input, async (store) => {
      const timestamp = now();
      const id = randomUUID();
      const lines: VoucherLineDto[] = input.lines.map((line) => ({
        accountCode: line.accountCode, accountName: line.accountName,
        debitAmount: line.debitAmount, creditAmount: line.creditAmount, summary: line.summary ?? "",
      }));
      const totalDebit = lines.reduce((sum, line) => addDecimal(sum, line.debitAmount), "0");
      const totalCredit = lines.reduce((sum, line) => addDecimal(sum, line.creditAmount), "0");
      if (compareDecimal(totalDebit, totalCredit) !== 0) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "凭证借贷不平衡", "检查借方和贷方金额");
      const voucher: VoucherDto = {
        id, tenantId: context.tenantId, docNo: docNo("VOU"), voucherType: input.voucherType,
        summary: input.summary, totalDebit, totalCredit, status: "draft", postingDate: input.postingDate,
        lines, sourceType: input.sourceType ?? "", sourceId: input.sourceId ?? "",
        remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.saveVoucher(voucher);
      await this.audit(store, context, "Voucher", id, 1, "CREATE", "", undefined, voucher);
      return { statusCode: 201, body: voucher };
    }).then((result) => result.body);
  }

  async postVoucher(context: RequestContext, id: string): Promise<VoucherDto> {
    requirePermission(context, "finance.voucher.post");
    return this.command<VoucherDto>(context, "finance.voucher.post", { id, version: context.expectedVersion }, async (store) => {
      const voucher = await store.getVoucher(context.tenantId, id);
      if (!voucher) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "凭证不存在", "刷新列表后重试");
      requireExpectedVersion(context, voucher.version);
      if (voucher.status !== "draft") throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "凭证当前状态不允许过账", "刷新数据后重试");
      const updated: VoucherDto = { ...voucher, status: "posted", postingDate: voucher.postingDate ?? today(), version: voucher.version + 1, updatedAt: now() };
      await store.saveVoucher(updated);
      await this.audit(store, context, "Voucher", id, updated.version, "POST", "", voucher, updated);
      return { statusCode: 200, body: updated };
    }).then((result) => result.body);
  }

  async listVouchers(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.voucher.read");
    return this.store.listVouchers(context.tenantId, filter);
  }

  // ===== Cost Accounting =====

  async createCostAccounting(context: RequestContext, input: CreateCostAccountingInput): Promise<CostAccountingDto> {
    requirePermission(context, "finance.cost.create");
    return this.command<CostAccountingDto>(context, "finance.cost.create", input, async (store) => {
      const timestamp = now();
      const id = randomUUID();
      const totalCost = addDecimal(addDecimal(input.materialCost, input.manufacturingCost), input.laborCost);
      const outputQtyNum = parseFloat(input.outputQty);
      if (outputQtyNum <= 0) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "产出数量必须大于 0", "修正产出数量");
      const unitCost = (BigInt(Math.round(parseFloat(totalCost) * 1_000_000)) / BigInt(Math.round(outputQtyNum * 1_000_000))).toString();
      const standardUnitCostNum = parseFloat(input.standardUnitCost);
      const unitCostNum = parseFloat(unitCost);
      const variancePct = standardUnitCostNum > 0 ? ((unitCostNum - standardUnitCostNum) / standardUnitCostNum * 100).toFixed(2) : "0";
      const cost: CostAccountingDto = {
        id, tenantId: context.tenantId, docNo: docNo("CST"), workOrderId: input.workOrderId, workOrderNo: input.workOrderNo,
        productId: input.productId, productName: input.productName,
        materialCost: input.materialCost, manufacturingCost: input.manufacturingCost, laborCost: input.laborCost,
        totalCost, outputQty: input.outputQty, unitCost, standardUnitCost: input.standardUnitCost,
        variancePct, status: "pending", remark: input.remark ?? "", version: 1, createdAt: timestamp, updatedAt: timestamp, createdBy: context.actorId,
      };
      await store.saveCostAccounting(cost);
      await this.audit(store, context, "CostAccounting", id, 1, "CREATE", "", undefined, cost);
      return { statusCode: 201, body: cost };
    }).then((result) => result.body);
  }

  async listCostAccounting(context: RequestContext, filter: FinanceListFilter) {
    requirePermission(context, "finance.cost.read");
    return this.store.listCostAccounting(context.tenantId, filter);
  }

  // ===== Dashboard =====

  async getDashboard(context: RequestContext): Promise<FinanceDashboardDto> {
    requirePermission(context, "finance.dashboard.read");
    const { items: receivables } = await this.store.listReceivables(context.tenantId, { page: 1, pageSize: 1000 });
    const { items: payables } = await this.store.listPayables(context.tenantId, { page: 1, pageSize: 1000 });
    const todayStr = today();
    const activeReceivables = receivables.filter((r) => r.status === "pending" || r.status === "processing");
    const activePayables = payables.filter((p) => p.status === "pending" || p.status === "processing");
    const totalReceivable = activeReceivables.reduce((sum, r) => addDecimal(sum, r.outstandingAmount), "0");
    const totalPayable = activePayables.reduce((sum, p) => addDecimal(sum, p.outstandingAmount), "0");
    const totalReceived = receivables.reduce((sum, r) => addDecimal(sum, r.receivedAmount), "0");
    const totalPaid = payables.reduce((sum, p) => addDecimal(sum, p.paidAmount), "0");
    const overdueReceivable = activeReceivables.filter((r) => r.dueDate && r.dueDate < todayStr).reduce((sum, r) => addDecimal(sum, r.outstandingAmount), "0");
    const overduePayable = activePayables.filter((p) => p.dueDate && p.dueDate < todayStr).reduce((sum, p) => addDecimal(sum, p.outstandingAmount), "0");
    const monthStart = todayStr.slice(0, 7);
    const monthlyRevenue = receivables.filter((r) => r.createdAt.slice(0, 7) === monthStart).reduce((sum, r) => addDecimal(sum, r.totalAmount), "0");
    const monthlyExpenditure = payables.filter((p) => p.createdAt.slice(0, 7) === monthStart).reduce((sum, p) => addDecimal(sum, p.totalAmount), "0");
    const pendingSettlementCount = activeReceivables.length + activePayables.length;
    return {
      totalReceivable, totalPayable, totalReceived, totalPaid,
      overdueReceivable, overduePayable, receivableCount: receivables.length,
      payableCount: payables.length, pendingSettlementCount, monthlyRevenue, monthlyExpenditure,
    };
  }
}
