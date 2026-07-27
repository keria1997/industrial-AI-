import type { FinanceStore } from "./store.js";
import type {
  CostAccountingDto, FinAuditLog, FinIdempotencyRecord, FinOutboxEvent,
  FinanceListFilter, InvoiceDto, PayableDto, PaymentDto, ReceivableDto, VoucherDto,
} from "./types.js";

type State = {
  receivables: Map<string, ReceivableDto>;
  payables: Map<string, PayableDto>;
  payments: Map<string, PaymentDto>;
  invoices: Map<string, InvoiceDto>;
  vouchers: Map<string, VoucherDto>;
  costAccounting: Map<string, CostAccountingDto>;
  outbox: Map<string, FinOutboxEvent>;
  auditLogs: FinAuditLog[];
  idempotency: Map<string, FinIdempotencyRecord>;
};

const entityKey = (tenantId: string, id: string) => `${tenantId}:${id}`;
const clone = <T>(value: T): T => structuredClone(value);
const cloneState = (state: State): State => ({
  receivables: clone(state.receivables),
  payables: clone(state.payables),
  payments: clone(state.payments),
  invoices: clone(state.invoices),
  vouchers: clone(state.vouchers),
  costAccounting: clone(state.costAccounting),
  outbox: clone(state.outbox),
  auditLogs: clone(state.auditLogs),
  idempotency: clone(state.idempotency),
});

type Listable = { tenantId: string; status: string; docNo: string; createdAt: string };

function filterAndPaginate<T extends Listable>(
  source: Map<string, T>,
  tenantId: string,
  filter: FinanceListFilter | undefined,
  searchFields: (item: T) => string[],
): { items: T[]; total: number } {
  let list = [...source.values()].filter((item) => item.tenantId === tenantId);
  if (filter?.status) list = list.filter((item) => item.status === filter.status);
  if (filter?.search) {
    const q = filter.search.toLowerCase();
    list = list.filter((item) => searchFields(item).some((f) => f?.toLowerCase().includes(q)));
  }
  const sorted = [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = sorted.length;
  const page = filter?.page ?? 1;
  const pageSize = filter?.pageSize ?? 20;
  const start = (page - 1) * pageSize;
  return { items: clone(sorted.slice(start, start + pageSize)), total };
}

export class InMemoryFinanceStore implements FinanceStore {
  private state: State = {
    receivables: new Map(), payables: new Map(), payments: new Map(), invoices: new Map(),
    vouchers: new Map(), costAccounting: new Map(), outbox: new Map(), auditLogs: [], idempotency: new Map(),
  };

  async transaction<T>(work: (store: FinanceStore) => Promise<T>): Promise<T> {
    return work(this);
  }

  // Receivables
  async listReceivables(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.receivables, tenantId, filter, (i) => [i.docNo, i.title, i.customerName]);
  }
  async getReceivable(tenantId: string, id: string) { return clone(this.state.receivables.get(entityKey(tenantId, id))); }
  async getReceivableBySource(tenantId: string, sourceType: string, sourceId: string) {
    return clone([...this.state.receivables.values()].find((item) => item.tenantId === tenantId && item.sourceType === sourceType && item.sourceId === sourceId));
  }
  async saveReceivable(receivable: ReceivableDto) { this.state.receivables.set(entityKey(receivable.tenantId, receivable.id), clone(receivable)); }

  // Payables
  async listPayables(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.payables, tenantId, filter, (i) => [i.docNo, i.title, i.supplierName]);
  }
  async getPayable(tenantId: string, id: string) { return clone(this.state.payables.get(entityKey(tenantId, id))); }
  async getPayableBySource(tenantId: string, sourceType: string, sourceId: string) {
    return clone([...this.state.payables.values()].find((item) => item.tenantId === tenantId && item.sourceType === sourceType && item.sourceId === sourceId));
  }
  async savePayable(payable: PayableDto) { this.state.payables.set(entityKey(payable.tenantId, payable.id), clone(payable)); }

  // Payments
  async listPayments(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.payments, tenantId, filter, (i) => [i.docNo, i.counterpartyName]);
  }
  async getPayment(tenantId: string, id: string) { return clone(this.state.payments.get(entityKey(tenantId, id))); }
  async savePayment(payment: PaymentDto) { this.state.payments.set(entityKey(payment.tenantId, payment.id), clone(payment)); }

  // Invoices
  async listInvoices(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.invoices, tenantId, filter, (i) => [i.docNo, i.counterpartyName, i.invoiceNo]);
  }
  async getInvoice(tenantId: string, id: string) { return clone(this.state.invoices.get(entityKey(tenantId, id))); }
  async saveInvoice(invoice: InvoiceDto) { this.state.invoices.set(entityKey(invoice.tenantId, invoice.id), clone(invoice)); }

  // Vouchers
  async listVouchers(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.vouchers, tenantId, filter, (i) => [i.docNo, i.summary]);
  }
  async getVoucher(tenantId: string, id: string) { return clone(this.state.vouchers.get(entityKey(tenantId, id))); }
  async saveVoucher(voucher: VoucherDto) { this.state.vouchers.set(entityKey(voucher.tenantId, voucher.id), clone(voucher)); }

  // Cost accounting
  async listCostAccounting(tenantId: string, filter?: FinanceListFilter) {
    return filterAndPaginate(this.state.costAccounting, tenantId, filter, (i) => [i.docNo, i.productName, i.workOrderNo ?? ""]);
  }
  async getCostAccounting(tenantId: string, id: string) { return clone(this.state.costAccounting.get(entityKey(tenantId, id))); }
  async saveCostAccounting(cost: CostAccountingDto) { this.state.costAccounting.set(entityKey(cost.tenantId, cost.id), clone(cost)); }

  // Outbox
  async addOutbox(event: FinOutboxEvent) { this.state.outbox.set(entityKey(event.tenantId, event.eventId), clone(event)); }
  async listPendingOutbox(tenantId?: string) { return clone([...this.state.outbox.values()].filter((item) => item.status === "PENDING" && (!tenantId || item.tenantId === tenantId))); }
  async markOutboxPublished(tenantId: string, eventId: string) { const key = entityKey(tenantId, eventId); const item = this.state.outbox.get(key); if (item) this.state.outbox.set(key, { ...item, status: "PUBLISHED", attempts: item.attempts + 1 }); }
  async markOutboxFailed(tenantId: string, eventId: string, _error: string, maxAttempts: number) { const key = entityKey(tenantId, eventId); const item = this.state.outbox.get(key); if (item) { const attempts = item.attempts + 1; this.state.outbox.set(key, { ...item, attempts, status: attempts >= maxAttempts ? "DEAD_LETTER" : "PENDING" }); } }

  // Audit
  async addAuditLog(log: FinAuditLog) { this.state.auditLogs.push(clone(log)); }

  // Idempotency
  async getIdempotency(tenantId: string, commandType: string, key: string) { return clone(this.state.idempotency.get(`${tenantId}:${commandType}:${key}`)); }
  async saveIdempotency(record: FinIdempotencyRecord) { this.state.idempotency.set(`${record.tenantId}:${record.commandType}:${record.key}`, clone(record)); }

  snapshot() { return cloneState(this.state); }
}
