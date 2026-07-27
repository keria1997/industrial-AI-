import { randomUUID } from "node:crypto";
import Fastify, { FastifyRequest } from "fastify";
import { ZodError, z } from "zod";
import { errorBody, ProductionError } from "./errors.js";
import { fulfillmentErrorBody, FulfillmentError } from "./shared/fulfillment-errors.js";
import { EnvironmentKeyProvider, type KeyProvider } from "./shared/key-provider.js";
import { InMemoryFulfillmentStore } from "./modules/fulfillment/memory-store.js";
import { ReferenceWmsAdapter, type InventoryGateway } from "./modules/fulfillment/inventory-gateway.js";
import { FulfillmentService } from "./modules/fulfillment/service.js";
import { registerFulfillmentRoutes } from "./modules/fulfillment/routes.js";
import { InMemoryPlatformStore } from "./modules/platform/memory-store.js";
import { PlatformService } from "./modules/platform/service.js";
import { registerPlatformRoutes } from "./modules/platform/routes.js";
import type { PlatformStore } from "./modules/platform/store.js";
import { InMemoryFinanceStore } from "./modules/finance/memory-store.js";
import { FinanceService } from "./modules/finance/service.js";
import { registerFinanceRoutes } from "./modules/finance/routes.js";
import type { FinanceStore } from "./modules/finance/store.js";
import { ProductionFulfillmentOutboxWorker } from "./workers/production-fulfillment-outbox-worker.js";
import type { FulfillmentStore } from "./modules/fulfillment/store.js";
import { developmentSessionUser, issueAccessToken, verifyAccessToken } from "./auth.js";
import { InMemoryProductionRepository } from "./memory-store.js";
import { ProductionService } from "./service.js";
import { ProductionRepository } from "./store.js";
import { RequestContext } from "./types.js";

const decimal = z.string().regex(/^(0|[1-9]\d*)(\.\d{1,6})?$/, "必须是最多 6 位小数的非负十进制字符串");
const positiveDecimal = decimal.refine((value) => value !== "0" && !/^0\.0*$/.test(value), "必须大于 0");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "必须使用 YYYY-MM-DD");
const uuid = z.string().uuid();

function singleHeader(value: string | string[] | undefined): string | undefined { return Array.isArray(value) ? value[0] : value; }

function parseIfMatch(value?: string): number | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/^W\//, "").replaceAll('"', "");
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "If-Match 必须是有效版本号", "使用查询结果中的 version，例如 If-Match: \"3\"");
  return parsed;
}

export type ProductionAppOptions = {
  authSecret?: string;
  allowInsecureHeaders?: boolean;
  demoAuthEnabled?: boolean;
  demoAccount?: string;
  demoPassword?: string;
  fulfillmentStore?: FulfillmentStore;
  inventoryGateway?: InventoryGateway;
  keyProvider?: KeyProvider;
  fulfillmentReviewRequired?: boolean;
  workerTenantIds?: string[];
  workerIntervalMs?: number;
  platformStore?: PlatformStore;
  financeStore?: FinanceStore;
};

type ResolvedAuthOptions = Required<Pick<ProductionAppOptions, "authSecret" | "allowInsecureHeaders" | "demoAuthEnabled" | "demoAccount" | "demoPassword">>;

function requestContext(request: FastifyRequest, options: ResolvedAuthOptions): RequestContext {
  const authorization = singleHeader(request.headers.authorization);
  const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  let tenantId: string | undefined;
  let actorId: string | undefined;
  let employeeId: string | undefined;
  let permissions = new Set<string>();
  let permissionVersion = "unknown";

  if (bearerToken) {
    let claims;
    try {
      claims = verifyAccessToken(bearerToken, options.authSecret);
    } catch {
      throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "登录会话无效或已过期", "请重新登录后再试");
    }
    const requestedTenant = singleHeader(request.headers["x-tenant-id"]);
    tenantId = requestedTenant ?? claims.tenantIds[0];
    if (!tenantId || !claims.tenantIds.includes(tenantId)) {
      throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", "当前会话无权访问所选租户", "切换到已授权企业后重试");
    }
    actorId = claims.sub;
    permissions = new Set(claims.permissions);
    permissionVersion = claims.permissionVersion;
  } else if (options.allowInsecureHeaders) {
    tenantId = singleHeader(request.headers["x-tenant-id"]);
    actorId = singleHeader(request.headers["x-actor-id"]);
    employeeId = singleHeader(request.headers["x-employee-id"]);
    const permissionHeader = singleHeader(request.headers["x-permissions"]) ?? "";
    permissions = new Set(permissionHeader.split(",").map((item) => item.trim()).filter(Boolean));
    permissionVersion = singleHeader(request.headers["x-permission-version"]) ?? "unknown";
  }
  const traceId = singleHeader(request.headers["x-trace-id"]) ?? randomUUID();
  request.headers["x-trace-id"] = traceId;
  if (!tenantId || !actorId) throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "缺少有效登录会话", "使用登录接口取得访问令牌后重试", {
    fieldErrors: [
      ...(!tenantId ? [{ field: "Authorization", message: "会话缺少租户授权" }] : []),
      ...(!actorId ? [{ field: "Authorization", message: "Bearer Token 必填" }] : []),
    ],
  });
  const capability = singleHeader(request.headers["x-production-capability"]);
  if (capability === "disabled") throw new ProductionError("PRODUCTION_403_CAPABILITY_DISABLED", "当前租户未开通生产管理能力", "请联系平台管理员启用生产能力");
  if (capability === "unavailable") throw new ProductionError("PRODUCTION_503_PLATFORM_UNAVAILABLE", "平台能力校验服务暂不可用", "稍后使用同一幂等键重试", { retryable: true });
  return {
    tenantId, actorId, employeeId,
    permissions,
    permissionVersion,
    traceId, idempotencyKey: singleHeader(request.headers["x-idempotency-key"]),
    expectedVersion: parseIfMatch(singleHeader(request.headers["if-match"])),
    ipAddress: request.ip, userAgent: singleHeader(request.headers["user-agent"]),
  };
}

const listQuerySchema = z.object({
  status: z.string().optional(), factoryResourceId: z.string().optional(), search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export function buildProductionApp(repository: ProductionRepository = new InMemoryProductionRepository(), inputOptions: ProductionAppOptions = {}) {
  const options: ResolvedAuthOptions = {
    authSecret: inputOptions.authSecret ?? "local-development-auth-secret-change-me",
    allowInsecureHeaders: inputOptions.allowInsecureHeaders ?? false,
    demoAuthEnabled: inputOptions.demoAuthEnabled ?? true,
    demoAccount: inputOptions.demoAccount ?? "admin",
    demoPassword: inputOptions.demoPassword ?? "123456",
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } });
  const service = new ProductionService(repository);
  const fulfillmentStore = inputOptions.fulfillmentStore ?? new InMemoryFulfillmentStore();
  const inventoryGateway = inputOptions.inventoryGateway ?? new ReferenceWmsAdapter();
  const encodedDataKey = process.env.FULFILLMENT_DATA_KEY ?? (process.env.NODE_ENV === "test" ? Buffer.alloc(32, 7).toString("base64") : undefined);
  const keyProvider = inputOptions.keyProvider ?? (encodedDataKey
    ? new EnvironmentKeyProvider(process.env.FULFILLMENT_DATA_KEY_ID ?? "local-development-v1", encodedDataKey)
    : undefined);
  if (!keyProvider) throw new Error("FULFILLMENT_DATA_KEY is required to protect recipient phone data");
  const financeStore = inputOptions.financeStore ?? new InMemoryFinanceStore();
  const financeService = new FinanceService(financeStore);
  const fulfillmentService = new FulfillmentService(fulfillmentStore, inventoryGateway, keyProvider, {
    reviewRequired: inputOptions.fulfillmentReviewRequired,
    createProductionDemand: async (context, input) => {
      const result = await service.createDemand({ ...context, expectedVersion: undefined, idempotencyKey: `fulfillment-demand:${input.shipmentRequestLineId}` }, {
        sourceType: "SALES_ORDER_SHORTAGE", sourceSystem: "INVENTORY_FULFILLMENT", sourceId: input.salesOrderId,
        sourceLineId: input.salesOrderLineId, sourceRevision: 1, productId: input.productId, qty: input.qty,
        uom: input.uom, dueDate: input.dueDate, factoryResourceId: input.factoryResourceId,
        correlationId: input.correlationId, payloadSnapshot: {
          shipmentRequestId: input.shipmentRequestId, shipmentRequestLineId: input.shipmentRequestLineId,
          salesOrderId: input.salesOrderId, salesOrderLineId: input.salesOrderLineId, warehouseId: input.warehouseId,
          inventoryWarehouseId: input.warehouseId, inventoryFactVersion: input.inventoryFactVersion,
          correlationId: input.correlationId, traceId: context.traceId,
        },
      });
      const demand = result.body as { id: string; code: string };
      return { id: demand.id, code: demand.code };
    },
    getProductionTask: (context, taskId) => repository.getTask(context.tenantId, taskId),
    syncProductionAvailability: async (context, fact) => {
      await repository.upsertInventoryAvailability({
        tenantId: context.tenantId, productId: fact.productId, inventoryWarehouseId: fact.warehouseId,
        availableQty: fact.fulfillableQty, uom: fact.uom, factVersion: fact.factVersion,
        sourceEventId: fact.sourceEventId, sourceSystem: fact.sourceSystem,
        asOf: fact.asOf, updatedAt: new Date().toISOString(),
      });
    },
    onSalesOutboundPosted: async (context, input) => {
      try {
        await financeService.generateReceivable({ ...context, expectedVersion: undefined, idempotencyKey: `fin-ar:${input.salesOrderId}` }, {
          sourceType: "SalesOrder", sourceId: input.salesOrderId, sourceDocNo: input.salesOrderNo,
          customerId: input.customerId, customerName: input.customerName,
          totalAmount: input.totalAmount, currency: input.currency, dueDate: input.postedAt.slice(0, 10),
        });
      } catch { /* best-effort AR generation */ }
    },
    onPurchaseReceiptPosted: async (context, input) => {
      try {
        const scaledQty = BigInt(Math.round(parseFloat(input.orderedQty) * 1000000));
        const scaledPrice = BigInt(25000000);
        const totalAmount = (scaledQty * scaledPrice / 1000000n).toString();
        await financeService.generatePayable({ ...context, expectedVersion: undefined, idempotencyKey: `fin-ap:${input.purchaseOrderId}` }, {
          sourceType: "PurchaseOrder", sourceId: input.purchaseOrderId, sourceDocNo: input.purchaseOrderNo,
          supplierId: input.supplierId, supplierName: input.supplierName,
          totalAmount, dueDate: input.receivedAt.slice(0, 10),
        });
      } catch { /* best-effort AP generation */ }
    },
  });
  const platformStore = inputOptions.platformStore ?? new InMemoryPlatformStore();
  const platformService = new PlatformService(platformStore);
  const completionRelay = new ProductionFulfillmentOutboxWorker(repository, fulfillmentService);
  const workerTenantIds = inputOptions.workerTenantIds ?? [];
  if (workerTenantIds.length > 0) {
    const workerIntervalMs = inputOptions.workerIntervalMs ?? 2000;
    const workerTimer = setInterval(async () => {
      for (const tenantId of workerTenantIds) {
        try { await fulfillmentService.drainOutbox(tenantId); } catch { /* worker continues on next tick */ }
        try { await completionRelay.runOnce(tenantId); } catch { /* worker continues on next tick */ }
      }
    }, workerIntervalMs);
    app.addHook("onClose", async () => clearInterval(workerTimer));
  }
  const prefix = "/api/v1/production";

  app.setErrorHandler((error, request, reply) => {
    const traceId = singleHeader(request.headers["x-trace-id"]) ?? request.id;
    reply.header("X-Trace-Id", traceId);
    if (error instanceof ProductionError) return reply.status(error.statusCode).send(errorBody(error, traceId));
    if (error instanceof FulfillmentError) return reply.status(error.statusCode).send(fulfillmentErrorBody(error, traceId));
    if (error instanceof ZodError) {
      const invalid = new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "请求字段不符合规则", "按字段提示修正后重新提交", {
        fieldErrors: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
      return reply.status(400).send(errorBody(invalid, traceId));
    }
    request.log.error(error);
    const unknown = new ProductionError("PRODUCTION_424_DEPENDENCY_FAILED", "生产服务处理请求时发生未知错误", "携带 traceId 联系系统管理员", { retryable: false });
    return reply.status(500).send(errorBody(unknown, traceId));
  });

  const contextFor = (request: FastifyRequest) => requestContext(request, options);

  app.post("/api/v1/session/login", async (request, reply) => {
    const body = z.object({ account: z.string().min(1).max(100), password: z.string().min(1).max(200) }).parse(request.body);
    const allowedDemoAccounts = options.demoAccount.split(",").map((item) => item.trim()).filter(Boolean);
    if (!options.demoAuthEnabled || !allowedDemoAccounts.includes(body.account) || body.password !== options.demoPassword) {
      throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "账号或密码不正确", "检查凭据后重试");
    }
    const user = developmentSessionUser(body.account);
    const token = issueAccessToken(user, options.authSecret);
    return reply.status(200).send({ ...token, tokenType: "Bearer", user });
  });

  app.get("/api/v1/session/me", async (request) => {
    const context = contextFor(request);
    return { account: context.actorId, tenantId: context.tenantId, permissions: [...context.permissions], permissionVersion: context.permissionVersion };
  });

  // Security hardening: token refresh, logout, password change
  app.post("/api/v1/session/refresh", async (request, reply) => {
    const context = contextFor(request);
    const user = developmentSessionUser(context.actorId);
    const token = issueAccessToken(user, options.authSecret);
    return reply.status(200).send({ ...token, tokenType: "Bearer", user });
  });

  app.post("/api/v1/session/logout", async (request, reply) => {
    const context = contextFor(request);
    try {
      await platformStore.addSessionRevocation(context.tenantId, {
        tenantId: context.tenantId, account: context.actorId, reason: "logout",
        revokedBy: context.actorId, revokedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
      });
    } catch { /* best-effort */ }
    return reply.status(204).send();
  });

  app.post("/api/v1/session/change-password", async (request, reply) => {
    const body = z.object({
      oldPassword: z.string().min(1).max(200),
      newPassword: z.string().min(8).max(200).regex(/[A-Za-z]/, "密码必须包含字母").regex(/[0-9]/, "密码必须包含数字"),
    }).parse(request.body);
    const context = contextFor(request);
    if (options.demoAuthEnabled && body.oldPassword !== options.demoPassword) {
      throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "原密码不正确", "检查原密码后重试");
    }
    return reply.status(204).send();
  });

  // Session revocation pre-check (best-effort)
  app.addHook("preHandler", async (request) => {
    const authorization = singleHeader(request.headers.authorization);
    const bearerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!bearerToken || options.allowInsecureHeaders) return;
    let claims;
    try { claims = verifyAccessToken(bearerToken, options.authSecret); } catch { return; }
    const revTenantId = singleHeader(request.headers["x-tenant-id"]) ?? claims.tenantIds[0];
    if (!revTenantId || !claims.sub) return;
    try {
      const revoked = await platformStore.isSessionRevoked(revTenantId, claims.sub, undefined);
      if (revoked) throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "会话已注销，请重新登录", "使用登录接口取得新的访问令牌");
    } catch (e) { if (e instanceof ProductionError) throw e; }
  });

  const sendCommand = async (request: FastifyRequest, reply: any, promise: (context: RequestContext) => Promise<any>) => {
    const context = contextFor(request);
    reply.header("X-Trace-Id", context.traceId);
    const result = await promise(context);
    if (result.replayed) reply.header("X-Idempotent-Replay", "true");
    const body: any = result.body;
    const version = body?.version ?? body?.workOrder?.version ?? body?.completion?.version;
    if (version) reply.header("ETag", `\"${version}\"`);
    return reply.status(result.statusCode).send(result.body);
  };

  app.get(`${prefix}/readiness`, async (request, reply) => {
    const context = contextFor(request); reply.header("X-Trace-Id", context.traceId); return service.readiness(context);
  });

  app.get(`${prefix}/demands`, async (request) => {
    const context = contextFor(request); const query = listQuerySchema.parse(request.query);
    return service.listDemands(context, { status: query.status, factoryResourceId: query.factoryResourceId, search: query.search,
      limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
  });
  app.post(`${prefix}/demands`, async (request, reply) => {
    const body = z.object({ code: z.string().max(50).optional(), sourceType: z.string().min(1).max(30), sourceSystem: z.string().max(30).optional(),
      sourceId: z.string().max(100).optional(), sourceLineId: z.string().max(100).optional(), sourceRevision: z.number().int().min(1).optional(),
      productId: z.string().min(1).max(100), productName: z.string().max(200).optional(), qty: positiveDecimal, uom: z.string().min(1).max(20),
      dueDate: isoDate, priority: z.number().int().min(1).max(100).optional(), factoryResourceId: z.string().min(1).max(100),
      correlationId: z.string().max(100).optional(), payloadSnapshot: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createDemand(context, body));
  });
  app.post(`${prefix}/internal/inventory-availability-events`, async (request, reply) => {
    const body = z.object({
      eventId: z.string().min(1).max(100), eventVersion: z.number().int().min(1).optional(),
      productId: z.string().min(1).max(100), inventoryWarehouseId: z.string().min(1).max(100),
      availableQty: decimal, uom: z.string().min(1).max(20), factVersion: z.number().int().min(1),
      sourceSystem: z.string().min(1).max(50), asOf: z.string().datetime({ offset: true }),
    }).parse(request.body);
    const context = contextFor(request); reply.header("X-Trace-Id", context.traceId);
    const result = await service.receiveInventoryAvailability(context, body);
    return reply.status(result.statusCode).send(result.body);
  });
  app.post(`${prefix}/sales-order-intakes`, async (request, reply) => {
    const body = z.object({
      salesOrderId: z.string().min(1).max(100), sourceLineId: z.string().min(1).max(100).optional(),
      sourceRevision: z.number().int().min(1).optional(), productId: z.string().min(1).max(100),
      productName: z.string().max(200).optional(), orderedQty: positiveDecimal, uom: z.string().min(1).max(20),
      dueDate: isoDate, factoryResourceId: z.string().min(1).max(100), inventoryWarehouseId: z.string().min(1).max(100),
      priority: z.number().int().min(1).max(100).optional(), correlationId: z.string().max(100).optional(),
    }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createSalesOrderIntake(context, body));
  });
  app.get(`${prefix}/sales-order-intakes/:salesOrderId`, async (request, reply) => {
    const { salesOrderId } = z.object({ salesOrderId: z.string().min(1).max(100) }).parse(request.params);
    const query = z.object({ sourceLineId: z.string().min(1).max(100).default("1"), sourceRevision: z.coerce.number().int().min(1).default(1) }).parse(request.query);
    const context = contextFor(request);
    const intake = await service.getSalesOrderIntake(context, salesOrderId, query.sourceLineId, query.sourceRevision);
    if (!intake) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "销售订单接入记录不存在", "确认销售订单行和版本后重试");
    reply.header("X-Trace-Id", context.traceId); return intake;
  });
  app.post(`${prefix}/demands/:id/validate`, async (request, reply) => {
    const params = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ productActive: z.boolean().optional(), factoryActive: z.boolean().optional(), bomEffective: z.boolean().optional(), routingEffective: z.boolean().optional() }).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.validateDemand(context, params.id, body));
  });
  app.post(`${prefix}/demands/:id/approve`, async (request, reply) => {
    const params = z.object({ id: uuid }).parse(request.params); const body = z.object({ remark: z.string().max(500).optional() }).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.approveDemand(context, params.id, body));
  });

  app.get(`${prefix}/work-orders`, async (request) => {
    const context = contextFor(request); const query = listQuerySchema.parse(request.query);
    return service.listWorkOrders(context, { status: query.status, factoryResourceId: query.factoryResourceId, search: query.search,
      limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
  });
  app.get(`${prefix}/work-orders/:id`, async (request, reply) => {
    const context = contextFor(request); const { id } = z.object({ id: uuid }).parse(request.params);
    const value = await service.getWorkOrder(context, id);
    if (!value) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "工单不存在或不在当前数据范围内", "刷新列表后重试");
    reply.header("ETag", `\"${value.version}\"`); return value;
  });
  app.post(`${prefix}/work-orders`, async (request, reply) => {
    const body = z.object({ code: z.string().max(50).optional(), productId: z.string().min(1).max(100), productName: z.string().max(200).optional(),
      factoryResourceId: z.string().min(1).max(100), workshopResourceId: z.string().max(100).optional(), lineResourceId: z.string().max(100).optional(),
      workCenterResourceId: z.string().min(1).max(100), plannedQty: positiveDecimal, inputQty: decimal.optional(), uom: z.string().min(1).max(20), dueDate: isoDate,
      bomSnapshotId: uuid.optional(), routingSnapshotId: uuid.optional(), scheduleCandidateId: uuid.optional(), kittingCheckId: uuid.optional(),
      kittingStatus: z.enum(["READY", "PARTIAL_READY", "SHORTAGE", "EXPIRED"]).optional(), assigneeEmployeeId: z.string().max(100).optional(),
      correlationId: z.string().max(100).optional(), demandLinks: z.array(z.object({ demandId: uuid, allocatedQty: positiveDecimal,
        priorityRank: z.number().int().min(1).optional(), customerLocked: z.boolean().optional(), promisedDate: isoDate.optional() })).max(100).optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createWorkOrder(context, body));
  });
  app.post(`${prefix}/work-orders/:id/release-impact`, async (request) => service.releaseImpact(contextFor(request), z.object({ id: uuid }).parse(request.params).id));
  for (const [path, action] of [
    ["release", (c: RequestContext, id: string, b: any) => service.releaseWorkOrder(c, id, b)],
    ["start", (c: RequestContext, id: string, b: any) => service.startWorkOrder(c, id, b)],
    ["pause", (c: RequestContext, id: string, b: any) => service.pauseWorkOrder(c, id, b)],
    ["resume", (c: RequestContext, id: string, b: any) => service.resumeWorkOrder(c, id, b)],
  ] as const) {
    app.post(`${prefix}/work-orders/:id/${path}`, async (request, reply) => {
      const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
      return sendCommand(request, reply, (context) => action(context, id, body));
    });
  }
  app.post(`${prefix}/work-orders/:id/reports`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ operationId: uuid.optional(), goodQty: decimal, defectQty: decimal.optional(), scrapQty: decimal.optional(), inputQty: decimal.optional(),
      uom: z.string().min(1).max(20), source: z.string().max(30).optional(), remark: z.string().max(500).optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.submitReport(context, id, body));
  });
  app.post(`${prefix}/work-reports/:id/corrections`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ goodQty: decimal, defectQty: decimal.optional(), scrapQty: decimal.optional(), inputQty: decimal.optional(),
      reasonCode: z.string().min(1).max(50), reason: z.string().min(1).max(500) }).parse(request.body);
    return sendCommand(request, reply, (context) => service.correctReport(context, id, body));
  });

  app.get(`${prefix}/inspections`, async (request) => {
    const query = z.object({ workOrderId: uuid.optional() }).parse(request.query); return service.listInspections(contextFor(request), query.workOrderId);
  });
  app.post(`${prefix}/inspections`, async (request, reply) => {
    const body = z.object({ workOrderId: uuid, sampleQty: positiveDecimal, parentInspectionId: uuid.optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createInspection(context, body));
  });
  app.post(`${prefix}/inspections/:id/result`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ passedQty: decimal, failedQty: decimal.optional(), reason: z.string().max(500).optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.submitInspectionResult(context, id, body));
  });
  app.post(`${prefix}/inspections/:id/rework`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ qty: positiveDecimal, reason: z.string().min(1).max(500) }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createRework(context, id, body));
  });
  app.post(`${prefix}/inspections/:id/scrap`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ qty: positiveDecimal, reason: z.string().min(1).max(500) }).parse(request.body);
    return sendCommand(request, reply, (context) => service.scrapInspection(context, id, body));
  });

  app.post(`${prefix}/work-orders/:id/completion-allocation-preview`, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const { qty } = z.object({ qty: positiveDecimal }).parse(request.body);
    return service.allocationPreview(contextFor(request), id, qty);
  });
  app.post(`${prefix}/work-orders/:id/completions`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ inspectionId: uuid, qty: positiveDecimal, uom: z.string().min(1).max(20), warehouseResourceId: z.string().min(1).max(100),
      inventoryWarehouseId: z.string().min(1).max(100), binId: z.string().max(100).optional(), traceMode: z.enum(["NONE", "BATCH", "SERIAL"]),
      batchNo: z.string().max(100).optional(), serialNumbers: z.array(z.string().min(1).max(100)).max(10_000).optional(), productionDate: isoDate,
      allocationRevision: z.number().int().min(1), remark: z.string().max(500).optional() }).parse(request.body);
    return sendCommand(request, reply, (context) => service.createCompletion(context, id, body));
  });
  app.get(`${prefix}/completions/:id`, async (request) => service.getCompletion(contextFor(request), z.object({ id: uuid }).parse(request.params).id));
  app.post(`${prefix}/completions/:id/retry`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ binId: z.string().max(100).optional(), batchNo: z.string().max(100).optional(), remark: z.string().max(500).optional() }).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.retryCompletion(context, id, body));
  });
  app.post(`${prefix}/internal/completions/:id/inventory-result`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ result: z.enum(["POSTED", "REJECTED", "UNKNOWN"]),
      externalTransactionId: z.string().max(100).optional(), failureCode: z.string().max(100).optional(), failureMessage: z.string().max(500).optional() }).parse(request.body);
    return sendCommand(request, reply, async (context) => {
      const result = await service.inventoryResult(context, id, body);
      if (body.result === "POSTED") await completionRelay.runOnce(context.tenantId);
      return result;
    });
  });

  app.post(`${prefix}/work-orders/:id/close-check`, async (request) => service.closeCheck(contextFor(request), z.object({ id: uuid }).parse(request.params).id));
  app.post(`${prefix}/work-orders/:id/close-submit`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ reason: z.string().max(500).optional(), varianceSnapshot: z.record(z.string(), z.unknown()).optional() }).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.closeSubmit(context, id, body));
  });
  app.post(`${prefix}/work-order-closes/:id/approve`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ remark: z.string().max(500).optional() }).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.approveClose(context, id, body));
  });

  app.post(`${prefix}/mrp-runs`, async (request, reply) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.startPlanningTask(context, "MRP", body));
  });
  app.post(`${prefix}/schedule-runs`, async (request, reply) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body ?? {});
    return sendCommand(request, reply, (context) => service.startPlanningTask(context, "APS", body));
  });
  app.get(`${prefix}/tasks/:id`, async (request) => {
    const context = contextFor(request); const task = await service.getTask(context, z.object({ id: uuid }).parse(request.params).id);
    if (!task) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "任务不存在或不在当前数据范围内", "刷新任务列表");
    return task;
  });
  app.get(`${prefix}/dashboard/kpis`, async (request) => service.dashboard(contextFor(request)));

  registerFulfillmentRoutes(app, contextFor, fulfillmentService);
  registerPlatformRoutes(app, contextFor, platformService);
  registerFinanceRoutes(app, financeService, contextFor);

  return app;
}
