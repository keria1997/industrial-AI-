import { apiRequest, type ApiContext } from "./client";

// ===== 枚举类型（与后端 types.ts 保持一致）=====

export type FinanceDocStatus = "draft" | "pending" | "processing" | "done" | "rejected" | "void" | "reversed" | "REVERSED";
export type BusinessType = "AR" | "AP";
export type PaymentDirection = "INBOUND" | "OUTBOUND";
export type PaymentMethod = "bank_transfer" | "cash" | "check" | "offset" | "other";
export type InvoiceType = "SALES" | "PURCHASE";
export type VoucherType = "general" | "receipt" | "payment" | "transfer";
export type VoucherStatus = "draft" | "pending" | "posted" | "void";

// ===== 实体类型 =====

export type Receivable = {
  id: string;
  docNo: string;
  title: string;
  customerId: string;
  customerName: string;
  businessType: BusinessType;
  sourceType: string;
  sourceId: string;
  sourceDocNo?: string;
  currency: string;
  totalAmount: string;
  receivedAmount: string;
  outstandingAmount: string;
  status: FinanceDocStatus;
  dueDate?: string;
  issuedAt?: string;
  settledAt?: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type Payable = {
  id: string;
  docNo: string;
  title: string;
  supplierId: string;
  supplierName: string;
  businessType: BusinessType;
  sourceType: string;
  sourceId: string;
  sourceDocNo?: string;
  currency: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  status: FinanceDocStatus;
  dueDate?: string;
  issuedAt?: string;
  settledAt?: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type Payment = {
  id: string;
  docNo: string;
  direction: PaymentDirection;
  receivableId?: string;
  payableId?: string;
  counterpartyId: string;
  counterpartyName: string;
  currency: string;
  amount: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  bankAccount: string;
  referenceNo: string;
  status: FinanceDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type Invoice = {
  id: string;
  docNo: string;
  invoiceType: InvoiceType;
  receivableId?: string;
  payableId?: string;
  counterpartyId: string;
  counterpartyName: string;
  currency: string;
  amount: string;
  taxAmount: string;
  taxRate: string;
  invoiceNo: string;
  invoiceDate?: string;
  status: FinanceDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type VoucherLine = {
  accountCode: string;
  accountName: string;
  debitAmount: string;
  creditAmount: string;
  summary: string;
};

export type Voucher = {
  id: string;
  docNo: string;
  voucherType: VoucherType;
  summary: string;
  totalDebit: string;
  totalCredit: string;
  status: VoucherStatus;
  postingDate?: string;
  lines: VoucherLine[];
  sourceType: string;
  sourceId: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type CostAccounting = {
  id: string;
  docNo: string;
  workOrderId?: string;
  workOrderNo?: string;
  productId: string;
  productName: string;
  materialCost: string;
  manufacturingCost: string;
  laborCost: string;
  totalCost: string;
  outputQty: string;
  unitCost: string;
  standardUnitCost: string;
  variancePct: string;
  status: FinanceDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type FinanceDashboard = {
  totalReceivable: string;
  totalPayable: string;
  totalReceived: string;
  totalPaid: string;
  overdueReceivable: string;
  overduePayable: string;
  receivableCount: number;
  payableCount: number;
  pendingSettlementCount: number;
  monthlyRevenue: string;
  monthlyExpenditure: string;
};

// ===== 输入类型 =====

export type RegisterPaymentInput = {
  direction: PaymentDirection;
  receivableId?: string;
  payableId?: string;
  counterpartyId: string;
  counterpartyName: string;
  amount: string;
  currency?: string;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  bankAccount?: string;
  referenceNo?: string;
  remark?: string;
};

export type SettlementInput = {
  paymentMethod?: PaymentMethod;
  paymentDate: string;
  referenceNo?: string;
  remark?: string;
};

export type ReceivableSettlementResult = {
  document: Receivable;
  payment?: Payment;
  invoice?: Invoice;
  voucher?: Voucher;
  alreadySettled?: boolean;
};

export type PayableSettlementResult = {
  document: Payable;
  payment?: Payment;
  invoice?: Invoice;
  voucher?: Voucher;
  alreadySettled?: boolean;
};

export type CreateInvoiceInput = {
  invoiceType: InvoiceType;
  receivableId?: string;
  payableId?: string;
  counterpartyId: string;
  counterpartyName: string;
  amount: string;
  taxRate: string;
  invoiceNo?: string;
  invoiceDate?: string;
  remark?: string;
};

export type CreateVoucherInput = {
  voucherType: VoucherType;
  summary: string;
  postingDate?: string;
  lines: Array<{
    accountCode: string;
    accountName: string;
    debitAmount: string;
    creditAmount: string;
    summary?: string;
  }>;
  sourceType?: string;
  sourceId?: string;
  remark?: string;
};

export type CreateCostAccountingInput = {
  workOrderId?: string;
  workOrderNo?: string;
  productId: string;
  productName: string;
  materialCost: string;
  manufacturingCost: string;
  laborCost: string;
  outputQty: string;
  standardUnitCost: string;
  remark?: string;
};

export type FinanceListFilter = {
  status?: string;
  search?: string;
  sourceOrder?: string;
  page?: number;
  pageSize?: number;
};

// ===== API 函数 =====

const buildQuery = (filter?: FinanceListFilter) => {
  if (!filter) return "";
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.search) params.set("search", filter.search);
  if (filter.sourceOrder) params.set("sourceOrder", filter.sourceOrder);
  if (filter.page) params.set("page", String(filter.page));
  if (filter.pageSize) params.set("pageSize", String(filter.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
};

const key = () => `fin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

// Dashboard
export const getFinanceDashboard = (context: ApiContext) =>
  apiRequest<FinanceDashboard>("/api/v1/finance/dashboard", context, { method: "GET" });

// Receivables
export const listReceivables = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: Receivable[]; total: number }>(`/api/v1/finance/receivables${buildQuery(filter)}`, context, { method: "GET" });

export const getReceivable = (context: ApiContext, id: string) =>
  apiRequest<Receivable>(`/api/v1/finance/receivables/${encodeURIComponent(id)}`, context, { method: "GET" });

export const settleReceivable = (context: ApiContext, id: string, input: SettlementInput) =>
  apiRequest<ReceivableSettlementResult>(`/api/v1/finance/receivables/${encodeURIComponent(id)}/settlement`, context, {
    method: "POST",
    headers: { "X-Idempotency-Key": `finance-receivable-settlement:${id}:${input.paymentDate}` },
    body: JSON.stringify(input),
  });

// Payables
export const listPayables = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: Payable[]; total: number }>(`/api/v1/finance/payables${buildQuery(filter)}`, context, { method: "GET" });

export const getPayable = (context: ApiContext, id: string) =>
  apiRequest<Payable>(`/api/v1/finance/payables/${encodeURIComponent(id)}`, context, { method: "GET" });

export const settlePayable = (context: ApiContext, id: string, input: SettlementInput) =>
  apiRequest<PayableSettlementResult>(`/api/v1/finance/payables/${encodeURIComponent(id)}/settlement`, context, {
    method: "POST",
    headers: { "X-Idempotency-Key": `finance-payable-settlement:${id}:${input.paymentDate}` },
    body: JSON.stringify(input),
  });

// Payments
export const listPayments = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: Payment[]; total: number }>(`/api/v1/finance/payments${buildQuery(filter)}`, context, { method: "GET" });

export const registerPayment = (context: ApiContext, input: RegisterPaymentInput, idempotencyKey = key()) =>
  apiRequest<{ payment: Payment; receivable?: Receivable; payable?: Payable }>("/api/v1/finance/payments", context, {
    method: "POST",
    headers: { "X-Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });

export const confirmPayment = (context: ApiContext, id: string, version: number, idempotencyKey = key()) =>
  apiRequest<{ payment: Payment; receivable?: Receivable; payable?: Payable }>(
    `/api/v1/finance/payments/${encodeURIComponent(id)}/confirm`,
    context,
    {
      method: "POST",
      headers: { "If-Match": String(version), "X-Idempotency-Key": idempotencyKey },
    },
  );

// Invoices
export const listInvoices = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: Invoice[]; total: number }>(`/api/v1/finance/invoices${buildQuery(filter)}`, context, { method: "GET" });

export const createInvoice = (context: ApiContext, input: CreateInvoiceInput) =>
  apiRequest<Invoice>("/api/v1/finance/invoices", context, {
    method: "POST",
    headers: { "X-Idempotency-Key": key() },
    body: JSON.stringify(input),
  });

// Vouchers
export const listVouchers = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: Voucher[]; total: number }>(`/api/v1/finance/vouchers${buildQuery(filter)}`, context, { method: "GET" });

export const createVoucher = (context: ApiContext, input: CreateVoucherInput) =>
  apiRequest<Voucher>("/api/v1/finance/vouchers", context, {
    method: "POST",
    headers: { "X-Idempotency-Key": key() },
    body: JSON.stringify(input),
  });

export const postVoucher = (context: ApiContext, id: string, version: number) =>
  apiRequest<Voucher>(`/api/v1/finance/vouchers/${encodeURIComponent(id)}/post`, context, {
    method: "POST",
    headers: { "If-Match": String(version), "X-Idempotency-Key": key() },
  });

// Cost Accounting
export const listCostAccounting = (context: ApiContext, filter?: FinanceListFilter) =>
  apiRequest<{ items: CostAccounting[]; total: number }>(`/api/v1/finance/cost-accounting${buildQuery(filter)}`, context, { method: "GET" });

export const createCostAccounting = (context: ApiContext, input: CreateCostAccountingInput) =>
  apiRequest<CostAccounting>("/api/v1/finance/cost-accounting", context, {
    method: "POST",
    headers: { "X-Idempotency-Key": key() },
    body: JSON.stringify(input),
  });
