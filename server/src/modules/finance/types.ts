export type FinancialDocStatus = "draft" | "pending" | "processing" | "done" | "rejected" | "void";
export type BusinessType = "AR" | "AP";
export type PaymentDirection = "INBOUND" | "OUTBOUND";
export type PaymentMethod = "bank_transfer" | "cash" | "check" | "offset" | "other";
export type InvoiceType = "SALES" | "PURCHASE";
export type VoucherType = "general" | "receipt" | "payment" | "transfer";
export type VoucherStatus = "draft" | "pending" | "posted" | "void";

export type ReceivableDto = {
  id: string;
  tenantId: string;
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
  status: FinancialDocStatus;
  dueDate?: string;
  issuedAt?: string;
  settledAt?: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type PayableDto = {
  id: string;
  tenantId: string;
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
  status: FinancialDocStatus;
  dueDate?: string;
  issuedAt?: string;
  settledAt?: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type PaymentDto = {
  id: string;
  tenantId: string;
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
  status: FinancialDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type InvoiceDto = {
  id: string;
  tenantId: string;
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
  status: FinancialDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type VoucherLineDto = {
  accountCode: string;
  accountName: string;
  debitAmount: string;
  creditAmount: string;
  summary: string;
};

export type VoucherDto = {
  id: string;
  tenantId: string;
  docNo: string;
  voucherType: VoucherType;
  summary: string;
  totalDebit: string;
  totalCredit: string;
  status: VoucherStatus;
  postingDate?: string;
  lines: VoucherLineDto[];
  sourceType: string;
  sourceId: string;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type CostAccountingDto = {
  id: string;
  tenantId: string;
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
  status: FinancialDocStatus;
  remark: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
};

export type FinanceDashboardDto = {
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

export type GenerateReceivableInput = {
  sourceType: string;
  sourceId: string;
  sourceDocNo?: string;
  customerId: string;
  customerName: string;
  totalAmount: string;
  currency?: string;
  dueDate?: string;
  remark?: string;
};

export type GeneratePayableInput = {
  sourceType: string;
  sourceId: string;
  sourceDocNo?: string;
  supplierId: string;
  supplierName: string;
  totalAmount: string;
  currency?: string;
  dueDate?: string;
  remark?: string;
};

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
  lines: Array<{ accountCode: string; accountName: string; debitAmount: string; creditAmount: string; summary?: string }>;
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
  page: number;
  pageSize: number;
};

export type FinOutboxEvent = {
  eventId: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  traceId: string;
  payload: Record<string, unknown>;
  status: "PENDING" | "PUBLISHED" | "DEAD_LETTER";
  attempts: number;
  createdAt: string;
};

export type FinIdempotencyRecord = {
  tenantId: string;
  commandType: string;
  key: string;
  requestHash: string;
  statusCode: number;
  body: unknown;
};

export type FinAuditLog = {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  aggregateVersion: number;
  action: string;
  actorId: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  correlationId: string;
  traceId: string;
  occurredAt: string;
};
