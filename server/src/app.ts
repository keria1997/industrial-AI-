import { randomUUID } from "node:crypto";
import Fastify, { FastifyRequest } from "fastify";
import { ZodError, z } from "zod";
import { errorBody, ProductionError } from "./errors.js";
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

function requestContext(request: FastifyRequest): RequestContext {
  const tenantId = singleHeader(request.headers["x-tenant-id"]);
  const actorId = singleHeader(request.headers["x-actor-id"]);
  const traceId = singleHeader(request.headers["x-trace-id"]) ?? randomUUID();
  request.headers["x-trace-id"] = traceId;
  if (!tenantId || !actorId) throw new ProductionError("PRODUCTION_401_UNAUTHENTICATED", "缺少租户或操作人身份", "由统一网关传入 X-Tenant-Id 与 X-Actor-Id", {
    fieldErrors: [
      ...(!tenantId ? [{ field: "X-Tenant-Id", message: "必填" }] : []),
      ...(!actorId ? [{ field: "X-Actor-Id", message: "必填" }] : []),
    ],
  });
  const capability = singleHeader(request.headers["x-production-capability"]);
  if (capability === "disabled") throw new ProductionError("PRODUCTION_403_CAPABILITY_DISABLED", "当前租户未开通生产管理能力", "请联系平台管理员启用生产能力");
  if (capability === "unavailable") throw new ProductionError("PRODUCTION_503_PLATFORM_UNAVAILABLE", "平台能力校验服务暂不可用", "稍后使用同一幂等键重试", { retryable: true });
  const permissionHeader = singleHeader(request.headers["x-permissions"]) ?? "";
  return {
    tenantId, actorId, employeeId: singleHeader(request.headers["x-employee-id"]),
    permissions: new Set(permissionHeader.split(",").map((item) => item.trim()).filter(Boolean)),
    permissionVersion: singleHeader(request.headers["x-permission-version"]) ?? "unknown",
    traceId, idempotencyKey: singleHeader(request.headers["x-idempotency-key"]),
    expectedVersion: parseIfMatch(singleHeader(request.headers["if-match"])),
    ipAddress: request.ip, userAgent: singleHeader(request.headers["user-agent"]),
  };
}

const listQuerySchema = z.object({
  status: z.string().optional(), factoryResourceId: z.string().optional(), search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

export function buildProductionApp(repository: ProductionRepository = new InMemoryProductionRepository()) {
  const app = Fastify({ logger: false, ajv: { customOptions: { removeAdditional: false } } });
  const service = new ProductionService(repository);
  const prefix = "/api/v1/production";

  app.setErrorHandler((error, request, reply) => {
    const traceId = singleHeader(request.headers["x-trace-id"]) ?? request.id;
    reply.header("X-Trace-Id", traceId);
    if (error instanceof ProductionError) return reply.status(error.statusCode).send(errorBody(error, traceId));
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

  const sendCommand = async (request: FastifyRequest, reply: any, promise: Promise<any>) => {
    const context = requestContext(request);
    reply.header("X-Trace-Id", context.traceId);
    const result = await promise;
    if (result.replayed) reply.header("X-Idempotent-Replay", "true");
    const body: any = result.body;
    const version = body?.version ?? body?.workOrder?.version ?? body?.completion?.version;
    if (version) reply.header("ETag", `\"${version}\"`);
    return reply.status(result.statusCode).send(result.body);
  };

  app.get(`${prefix}/readiness`, async (request, reply) => {
    const context = requestContext(request); reply.header("X-Trace-Id", context.traceId); return service.readiness(context);
  });

  app.get(`${prefix}/demands`, async (request) => {
    const context = requestContext(request); const query = listQuerySchema.parse(request.query);
    return service.listDemands(context, { status: query.status, factoryResourceId: query.factoryResourceId, search: query.search,
      limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
  });
  app.post(`${prefix}/demands`, async (request, reply) => {
    const body = z.object({ code: z.string().max(50).optional(), sourceType: z.string().min(1).max(30), sourceSystem: z.string().max(30).optional(),
      sourceId: z.string().max(100).optional(), sourceLineId: z.string().max(100).optional(), sourceRevision: z.number().int().min(1).optional(),
      productId: z.string().min(1).max(100), productName: z.string().max(200).optional(), qty: positiveDecimal, uom: z.string().min(1).max(20),
      dueDate: isoDate, priority: z.number().int().min(1).max(100).optional(), factoryResourceId: z.string().min(1).max(100),
      correlationId: z.string().max(100).optional(), payloadSnapshot: z.record(z.string(), z.unknown()).optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.createDemand(context, body));
  });
  app.post(`${prefix}/demands/:id/validate`, async (request, reply) => {
    const params = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ productActive: z.boolean().optional(), factoryActive: z.boolean().optional(), bomEffective: z.boolean().optional(), routingEffective: z.boolean().optional() }).parse(request.body ?? {});
    const context = requestContext(request); return sendCommand(request, reply, service.validateDemand(context, params.id, body));
  });
  app.post(`${prefix}/demands/:id/approve`, async (request, reply) => {
    const params = z.object({ id: uuid }).parse(request.params); const body = z.object({ remark: z.string().max(500).optional() }).parse(request.body ?? {});
    const context = requestContext(request); return sendCommand(request, reply, service.approveDemand(context, params.id, body));
  });

  app.get(`${prefix}/work-orders`, async (request) => {
    const context = requestContext(request); const query = listQuerySchema.parse(request.query);
    return service.listWorkOrders(context, { status: query.status, factoryResourceId: query.factoryResourceId, search: query.search,
      limit: query.pageSize, offset: (query.page - 1) * query.pageSize });
  });
  app.get(`${prefix}/work-orders/:id`, async (request, reply) => {
    const context = requestContext(request); const { id } = z.object({ id: uuid }).parse(request.params);
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
    const context = requestContext(request); return sendCommand(request, reply, service.createWorkOrder(context, body));
  });
  app.post(`${prefix}/work-orders/:id/release-impact`, async (request) => service.releaseImpact(requestContext(request), z.object({ id: uuid }).parse(request.params).id));
  for (const [path, action] of [
    ["release", (c: RequestContext, id: string, b: any) => service.releaseWorkOrder(c, id, b)],
    ["start", (c: RequestContext, id: string, b: any) => service.startWorkOrder(c, id, b)],
    ["pause", (c: RequestContext, id: string, b: any) => service.pauseWorkOrder(c, id, b)],
    ["resume", (c: RequestContext, id: string, b: any) => service.resumeWorkOrder(c, id, b)],
  ] as const) {
    app.post(`${prefix}/work-orders/:id/${path}`, async (request, reply) => {
      const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ reason: z.string().max(500).optional() }).parse(request.body ?? {});
      const context = requestContext(request); return sendCommand(request, reply, action(context, id, body));
    });
  }
  app.post(`${prefix}/work-orders/:id/reports`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ operationId: uuid.optional(), goodQty: decimal, defectQty: decimal.optional(), scrapQty: decimal.optional(), inputQty: decimal.optional(),
      uom: z.string().min(1).max(20), source: z.string().max(30).optional(), remark: z.string().max(500).optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.submitReport(context, id, body));
  });
  app.post(`${prefix}/work-reports/:id/corrections`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ goodQty: decimal, defectQty: decimal.optional(), scrapQty: decimal.optional(), inputQty: decimal.optional(),
      reasonCode: z.string().min(1).max(50), reason: z.string().min(1).max(500) }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.correctReport(context, id, body));
  });

  app.get(`${prefix}/inspections`, async (request) => {
    const query = z.object({ workOrderId: uuid.optional() }).parse(request.query); return service.listInspections(requestContext(request), query.workOrderId);
  });
  app.post(`${prefix}/inspections`, async (request, reply) => {
    const body = z.object({ workOrderId: uuid, sampleQty: positiveDecimal, parentInspectionId: uuid.optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.createInspection(context, body));
  });
  app.post(`${prefix}/inspections/:id/result`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ passedQty: decimal, failedQty: decimal.optional(), reason: z.string().max(500).optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.submitInspectionResult(context, id, body));
  });
  app.post(`${prefix}/inspections/:id/rework`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ qty: positiveDecimal, reason: z.string().min(1).max(500) }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.createRework(context, id, body));
  });
  app.post(`${prefix}/inspections/:id/scrap`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ qty: positiveDecimal, reason: z.string().min(1).max(500) }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.scrapInspection(context, id, body));
  });

  app.post(`${prefix}/work-orders/:id/completion-allocation-preview`, async (request) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const { qty } = z.object({ qty: positiveDecimal }).parse(request.body);
    return service.allocationPreview(requestContext(request), id, qty);
  });
  app.post(`${prefix}/work-orders/:id/completions`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params);
    const body = z.object({ inspectionId: uuid, qty: positiveDecimal, uom: z.string().min(1).max(20), warehouseResourceId: z.string().min(1).max(100),
      inventoryWarehouseId: z.string().min(1).max(100), binId: z.string().max(100).optional(), traceMode: z.enum(["NONE", "BATCH", "SERIAL"]),
      batchNo: z.string().max(100).optional(), serialNumbers: z.array(z.string().min(1).max(100)).max(10_000).optional(), productionDate: isoDate,
      allocationRevision: z.number().int().min(1), remark: z.string().max(500).optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.createCompletion(context, id, body));
  });
  app.get(`${prefix}/completions/:id`, async (request) => service.getCompletion(requestContext(request), z.object({ id: uuid }).parse(request.params).id));
  app.post(`${prefix}/completions/:id/retry`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ binId: z.string().max(100).optional(), batchNo: z.string().max(100).optional(), remark: z.string().max(500).optional() }).parse(request.body ?? {});
    const context = requestContext(request); return sendCommand(request, reply, service.retryCompletion(context, id, body));
  });
  app.post(`${prefix}/internal/completions/:id/inventory-result`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ result: z.enum(["POSTED", "REJECTED", "UNKNOWN"]),
      externalTransactionId: z.string().max(100).optional(), failureCode: z.string().max(100).optional(), failureMessage: z.string().max(500).optional() }).parse(request.body);
    const context = requestContext(request); return sendCommand(request, reply, service.inventoryResult(context, id, body));
  });

  app.post(`${prefix}/work-orders/:id/close-check`, async (request) => service.closeCheck(requestContext(request), z.object({ id: uuid }).parse(request.params).id));
  app.post(`${prefix}/work-orders/:id/close-submit`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ reason: z.string().max(500).optional(), varianceSnapshot: z.record(z.string(), z.unknown()).optional() }).parse(request.body ?? {});
    const context = requestContext(request); return sendCommand(request, reply, service.closeSubmit(context, id, body));
  });
  app.post(`${prefix}/work-order-closes/:id/approve`, async (request, reply) => {
    const { id } = z.object({ id: uuid }).parse(request.params); const body = z.object({ remark: z.string().max(500).optional() }).parse(request.body ?? {});
    const context = requestContext(request); return sendCommand(request, reply, service.approveClose(context, id, body));
  });

  app.post(`${prefix}/mrp-runs`, async (request, reply) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body ?? {}); const context = requestContext(request);
    return sendCommand(request, reply, service.startPlanningTask(context, "MRP", body));
  });
  app.post(`${prefix}/schedule-runs`, async (request, reply) => {
    const body = z.record(z.string(), z.unknown()).parse(request.body ?? {}); const context = requestContext(request);
    return sendCommand(request, reply, service.startPlanningTask(context, "APS", body));
  });
  app.get(`${prefix}/tasks/:id`, async (request) => {
    const context = requestContext(request); const task = await service.getTask(context, z.object({ id: uuid }).parse(request.params).id);
    if (!task) throw new ProductionError("PRODUCTION_404_NOT_FOUND", "任务不存在或不在当前数据范围内", "刷新任务列表");
    return task;
  });
  app.get(`${prefix}/dashboard/kpis`, async (request) => service.dashboard(requestContext(request)));

  return app;
}
