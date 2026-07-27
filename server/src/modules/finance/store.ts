import type {
  CostAccountingDto, FinAuditLog, FinIdempotencyRecord, FinOutboxEvent,
  FinanceListFilter, InvoiceDto, PayableDto, PaymentDto, ReceivableDto, VoucherDto,
} from "./types.js";

export interface FinanceStore {
  transaction<T>(work: (store: FinanceStore) => Promise<T>): Promise<T>;

  // Receivables
  listReceivables(tenantId: string, filter?: FinanceListFilter): Promise<{ items: ReceivableDto[]; total: number }>;
  getReceivable(tenantId: string, id: string): Promise<ReceivableDto | undefined>;
  getReceivableBySource(tenantId: string, sourceType: string, sourceId: string): Promise<ReceivableDto | undefined>;
  saveReceivable(receivable: ReceivableDto): Promise<void>;

  // Payables
  listPayables(tenantId: string, filter?: FinanceListFilter): Promise<{ items: PayableDto[]; total: number }>;
  getPayable(tenantId: string, id: string): Promise<PayableDto | undefined>;
  getPayableBySource(tenantId: string, sourceType: string, sourceId: string): Promise<PayableDto | undefined>;
  savePayable(payable: PayableDto): Promise<void>;

  // Payments
  listPayments(tenantId: string, filter?: FinanceListFilter): Promise<{ items: PaymentDto[]; total: number }>;
  getPayment(tenantId: string, id: string): Promise<PaymentDto | undefined>;
  savePayment(payment: PaymentDto): Promise<void>;

  // Invoices
  listInvoices(tenantId: string, filter?: FinanceListFilter): Promise<{ items: InvoiceDto[]; total: number }>;
  getInvoice(tenantId: string, id: string): Promise<InvoiceDto | undefined>;
  saveInvoice(invoice: InvoiceDto): Promise<void>;

  // Vouchers
  listVouchers(tenantId: string, filter?: FinanceListFilter): Promise<{ items: VoucherDto[]; total: number }>;
  getVoucher(tenantId: string, id: string): Promise<VoucherDto | undefined>;
  saveVoucher(voucher: VoucherDto): Promise<void>;

  // Cost accounting
  listCostAccounting(tenantId: string, filter?: FinanceListFilter): Promise<{ items: CostAccountingDto[]; total: number }>;
  getCostAccounting(tenantId: string, id: string): Promise<CostAccountingDto | undefined>;
  saveCostAccounting(cost: CostAccountingDto): Promise<void>;

  // Outbox
  addOutbox(event: FinOutboxEvent): Promise<void>;
  listPendingOutbox(tenantId?: string): Promise<FinOutboxEvent[]>;
  markOutboxPublished(tenantId: string, eventId: string): Promise<void>;
  markOutboxFailed(tenantId: string, eventId: string, error: string, maxAttempts: number): Promise<void>;

  // Audit
  addAuditLog(log: FinAuditLog): Promise<void>;

  // Idempotency
  getIdempotency(tenantId: string, commandType: string, key: string): Promise<FinIdempotencyRecord | undefined>;
  saveIdempotency(record: FinIdempotencyRecord): Promise<void>;
}
