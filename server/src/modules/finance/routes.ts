import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { ProductionError } from "../../errors.js";
import type { RequestContext } from "../../types.js";
import type { FinanceService } from "./service.js";

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(200).default(20);
const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, "必须是最多 6 位小数的非负十进制字符串");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "必须使用 YYYY-MM-DD");

const listQuery = z.object({
  status: z.string().optional(),
  search: z.string().max(100).optional(),
  page, pageSize,
});

const idParam = z.object({ id: z.string().min(1) });

const registerPaymentInput = z.object({
  direction: z.enum(["INBOUND", "OUTBOUND"]),
  receivableId: z.string().optional(),
  payableId: z.string().optional(),
  counterpartyId: z.string().min(1).max(200),
  counterpartyName: z.string().min(1).max(200),
  amount: decimal,
  currency: z.string().max(10).default("CNY"),
  paymentMethod: z.enum(["bank_transfer", "cash", "check", "offset", "other"]),
  paymentDate: isoDate,
  bankAccount: z.string().max(200).default(""),
  referenceNo: z.string().max(200).default(""),
  remark: z.string().max(500).default(""),
});

const createInvoiceInput = z.object({
  invoiceType: z.enum(["SALES", "PURCHASE"]),
  receivableId: z.string().optional(),
  payableId: z.string().optional(),
  counterpartyId: z.string().min(1).max(200),
  counterpartyName: z.string().min(1).max(200),
  amount: decimal,
  taxRate: decimal,
  invoiceNo: z.string().max(100).optional(),
  invoiceDate: isoDate.optional(),
  remark: z.string().max(500).default(""),
});

const createVoucherInput = z.object({
  voucherType: z.enum(["general", "receipt", "payment", "transfer"]),
  summary: z.string().min(1).max(500),
  postingDate: isoDate.optional(),
  lines: z.array(z.object({
    accountCode: z.string().min(1).max(50),
    accountName: z.string().min(1).max(200),
    debitAmount: decimal,
    creditAmount: decimal,
    summary: z.string().max(200).optional(),
  })).min(2),
  sourceType: z.string().max(100).default(""),
  sourceId: z.string().max(100).default(""),
  remark: z.string().max(500).default(""),
});

const createCostAccountingInput = z.object({
  workOrderId: z.string().max(100).optional(),
  workOrderNo: z.string().max(100).optional(),
  productId: z.string().min(1).max(200),
  productName: z.string().min(1).max(200),
  materialCost: decimal,
  manufacturingCost: decimal,
  laborCost: decimal,
  outputQty: decimal,
  standardUnitCost: decimal,
  remark: z.string().max(500).default(""),
});

export function registerFinanceRoutes(app: FastifyInstance, service: FinanceService, contextFor: (request: any) => RequestContext) {
  const prefix = "/api/v1/finance";

  // ===== Dashboard =====
  app.get(`${prefix}/dashboard`, async (request) => {
    const context = contextFor(request);
    return service.getDashboard(context);
  });

  // ===== Receivables =====
  app.get(`${prefix}/receivables`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listReceivables(context, query);
  });

  app.get(`${prefix}/receivables/:id`, async (request) => {
    const context = contextFor(request);
    const { id } = idParam.parse(request.params);
    return service.getReceivable(context, id);
  });

  // ===== Payables =====
  app.get(`${prefix}/payables`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listPayables(context, query);
  });

  app.get(`${prefix}/payables/:id`, async (request) => {
    const context = contextFor(request);
    const { id } = idParam.parse(request.params);
    return service.getPayable(context, id);
  });

  // ===== Payments =====
  app.get(`${prefix}/payments`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listPayments(context, query);
  });

  app.post(`${prefix}/payments`, async (request, reply) => {
    const context = contextFor(request);
    const body = registerPaymentInput.parse(request.body);
    const result = await service.registerPayment(context, body);
    return reply.status(201).send(result);
  });

  app.post(`${prefix}/payments/:id/confirm`, async (request) => {
    const context = contextFor(request);
    const { id } = idParam.parse(request.params);
    return service.confirmPayment(context, id);
  });

  // ===== Invoices =====
  app.get(`${prefix}/invoices`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listInvoices(context, query);
  });

  app.post(`${prefix}/invoices`, async (request, reply) => {
    const context = contextFor(request);
    const body = createInvoiceInput.parse(request.body);
    const result = await service.createInvoice(context, body);
    return reply.status(201).send(result);
  });

  // ===== Vouchers =====
  app.get(`${prefix}/vouchers`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listVouchers(context, query);
  });

  app.post(`${prefix}/vouchers`, async (request, reply) => {
    const context = contextFor(request);
    const body = createVoucherInput.parse(request.body);
    const result = await service.createVoucher(context, body);
    return reply.status(201).send(result);
  });

  app.post(`${prefix}/vouchers/:id/post`, async (request) => {
    const context = contextFor(request);
    const { id } = idParam.parse(request.params);
    return service.postVoucher(context, id);
  });

  // ===== Cost Accounting =====
  app.get(`${prefix}/cost-accounting`, async (request) => {
    const context = contextFor(request);
    const query = listQuery.parse(request.query);
    return service.listCostAccounting(context, query);
  });

  app.post(`${prefix}/cost-accounting`, async (request, reply) => {
    const context = contextFor(request);
    const body = createCostAccountingInput.parse(request.body);
    const result = await service.createCostAccounting(context, body);
    return reply.status(201).send(result);
  });
}
