import { createHash, randomUUID } from "node:crypto";
import { addDecimal, compareDecimal, decimalToScaled, minDecimal, scaledToDecimal, subtractDecimal, sumDecimals } from "./decimal.js";
import { ProductionError } from "./errors.js";
import { ListQuery, ProductionRepository } from "./store.js";
import {
  AuditSnapshot, CloseCheck, CloseRequest, Completion, CompletionAllocation, Demand, DemandSource, Inspection,
  OperationTask, OutboxEvent, ReportCorrection, RequestContext, ReworkOrder, StatusHistory, WorkOrder,
  WorkOrderDemand, WorkReport,
} from "./types.js";

export interface CommandResponse<T = unknown> { statusCode: number; body: T; replayed?: boolean }

const now = () => new Date().toISOString();
const codeSuffix = () => `${Date.now().toString(36).toUpperCase()}${randomUUID().slice(0, 4).toUpperCase()}`;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
}

function requestHash(value: unknown) { return createHash("sha256").update(stableJson(value)).digest("hex"); }

function cloneWithVersion<T extends { version: number; updatedAt: string }>(value: T): T {
  return { ...structuredClone(value), version: value.version + 1, updatedAt: now() };
}

export class ProductionService {
  constructor(private readonly repository: ProductionRepository) {}

  private requirePermission(context: RequestContext, permission: string) {
    if (!context.permissions.has("*") && !context.permissions.has(permission)) {
      throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", `缺少操作权限：${permission}`, "请联系平台管理员授予对应生产权限");
    }
  }

  private requireExpectedVersion(context: RequestContext, currentVersion: number) {
    if (context.expectedVersion !== undefined && context.expectedVersion !== currentVersion) {
      throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "数据已被其他用户更新", "请刷新数据后重新确认本次操作", {
        details: { expectedVersion: context.expectedVersion, currentVersion },
      });
    }
  }

  private async command<T>(
    context: RequestContext,
    commandType: string,
    payload: unknown,
    work: (repository: ProductionRepository) => Promise<{ statusCode: number; body: T; aggregateType?: string; aggregateId?: string }>,
  ): Promise<CommandResponse<T>> {
    if (!context.idempotencyKey) {
      throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "写操作缺少 X-Idempotency-Key", "为本次业务动作生成稳定且唯一的幂等键后重试", {
        fieldErrors: [{ field: "X-Idempotency-Key", message: "必填" }],
      });
    }
    const hash = requestHash(payload);
    const existing = await this.repository.getIdempotency(context.tenantId, commandType, context.idempotencyKey);
    if (existing) {
      if (existing.requestHash !== hash) {
        throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同请求内容", "请勿复用其他业务动作的幂等键");
      }
      return { statusCode: existing.responseStatus, body: existing.responseBody as T, replayed: true };
    }

    return this.repository.transaction(async (transaction) => {
      const repeated = await transaction.getIdempotency(context.tenantId, commandType, context.idempotencyKey!);
      if (repeated) {
        if (repeated.requestHash !== hash) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "同一幂等键对应了不同请求内容", "请生成新的幂等键");
        return { statusCode: repeated.responseStatus, body: repeated.responseBody as T, replayed: true };
      }
      const result = await work(transaction);
      const saved = await transaction.saveIdempotency({
        tenantId: context.tenantId, commandType, idempotencyKey: context.idempotencyKey!, requestHash: hash,
        responseStatus: result.statusCode, responseBody: result.body, aggregateType: result.aggregateType,
        aggregateId: result.aggregateId, traceId: context.traceId, createdAt: now(),
      });
      if (!saved) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "幂等键正在被处理", "请使用原幂等键查询结果", { retryable: true });
      return { statusCode: result.statusCode, body: result.body };
    });
  }

  private async recordTransition(
    repository: ProductionRepository, context: RequestContext, aggregateType: string, aggregateId: string,
    fromStatus: string | undefined, toStatus: string, version: number, payload: Record<string, unknown>,
    reasonCode?: string, reason?: string, correlationId?: string,
  ) {
    const occurredAt = now();
    const history: StatusHistory = {
      id: randomUUID(), tenantId: context.tenantId, aggregateType, aggregateId, fromStatus, toStatus,
      reasonCode, reason, actorId: context.actorId, traceId: context.traceId, metadata: payload, occurredAt,
    };
    const event: OutboxEvent = {
      id: randomUUID(), tenantId: context.tenantId, eventId: randomUUID(), eventType: `${aggregateType}.${toStatus}`,
      eventVersion: 1, aggregateType, aggregateId, aggregateVersion: version, correlationId, traceId: context.traceId,
      payload: { ...payload, fromStatus, toStatus, occurredAt }, status: "PENDING", retryCount: 0, createdAt: occurredAt,
    };
    await repository.addStatusHistory(history);
    await repository.addOutboxEvent(event);
  }

  private async audit(
    repository: ProductionRepository, context: RequestContext, action: string, aggregateType: string,
    aggregateId: string, beforeSnapshot?: unknown, afterSnapshot?: unknown, reason?: string,
  ) {
    const value: AuditSnapshot = {
      id: randomUUID(), tenantId: context.tenantId, action, aggregateType, aggregateId,
      actorAccountId: context.actorId, actorEmployeeId: context.employeeId, permissionVersion: context.permissionVersion,
      beforeSnapshot, afterSnapshot, reason, traceId: context.traceId, ipAddress: context.ipAddress,
      userAgent: context.userAgent, occurredAt: now(),
    };
    await repository.addAudit(value);
  }

  private notFound(label: string): never {
    throw new ProductionError("PRODUCTION_404_NOT_FOUND", `${label}不存在或不在当前数据范围内`, "请刷新列表并确认租户与数据权限");
  }

  private illegal(label: string, current: string, allowed: string[]): never {
    throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", `${label}当前状态 ${current} 不允许此操作`, `请先将状态推进到：${allowed.join(" / ")}`, {
      details: { currentStatus: current, allowedStatuses: allowed },
    });
  }

  async readiness(context: RequestContext) {
    return {
      status: "READY", module: "production", apiVersion: "v1", tenantId: context.tenantId,
      checks: { repository: "UP", eventOutbox: "UP", platformCapability: "ASSUMED_BY_GATEWAY" }, timestamp: now(),
    };
  }

  listDemands(context: RequestContext, query: ListQuery) { return this.repository.listDemands(context.tenantId, query); }
  listWorkOrders(context: RequestContext, query: ListQuery) { return this.repository.listWorkOrders(context.tenantId, query); }
  getWorkOrder(context: RequestContext, id: string) { return this.repository.getWorkOrder(context.tenantId, id); }
  getTask(context: RequestContext, id: string) { return this.repository.getTask(context.tenantId, id); }

  createDemand(context: RequestContext, input: {
    code?: string; sourceType: string; sourceSystem?: string; sourceId?: string; sourceLineId?: string; sourceRevision?: number;
    productId: string; productName?: string; qty: string; uom: string; dueDate: string; priority?: number;
    factoryResourceId: string; correlationId?: string; payloadSnapshot?: Record<string, unknown>;
  }) {
    this.requirePermission(context, "production.demand.create");
    return this.command(context, "CreateDemand", input, async (repository) => {
      const timestamp = now();
      const demand: Demand = {
        id: randomUUID(), tenantId: context.tenantId, code: input.code ?? `DM-${codeSuffix()}`, sourceType: input.sourceType,
        productId: input.productId, productName: input.productName, qty: input.qty, uom: input.uom, dueDate: input.dueDate,
        priority: input.priority ?? 50, factoryResourceId: input.factoryResourceId, status: "RECEIVED", revision: input.sourceRevision ?? 1,
        correlationId: input.correlationId ?? randomUUID(), blockReasons: [], createdBy: context.actorId, version: 1,
        createdAt: timestamp, updatedAt: timestamp,
      };
      const source: DemandSource | undefined = input.sourceId ? {
        id: randomUUID(), tenantId: context.tenantId, demandId: demand.id, sourceSystem: input.sourceSystem ?? "MANUAL",
        sourceType: input.sourceType, sourceId: input.sourceId, sourceLineId: input.sourceLineId,
        sourceRevision: input.sourceRevision ?? 1, qty: input.qty, payloadSnapshot: input.payloadSnapshot ?? {},
      } : undefined;
      await repository.insertDemand(demand, source);
      await this.recordTransition(repository, context, "Demand", demand.id, undefined, demand.status, demand.version,
        { code: demand.code, qty: demand.qty, productId: demand.productId }, undefined, undefined, demand.correlationId);
      return { statusCode: 201, body: demand, aggregateType: "Demand", aggregateId: demand.id };
    });
  }

  validateDemand(context: RequestContext, id: string, input: {
    productActive?: boolean; factoryActive?: boolean; bomEffective?: boolean; routingEffective?: boolean;
  }) {
    this.requirePermission(context, "production.demand.review");
    return this.command(context, "ValidateDemand", { id, ...input }, async (repository) => {
      const demand = await repository.getDemand(context.tenantId, id);
      if (!demand) this.notFound("需求");
      if (!(["RECEIVED", "BLOCKED"] as string[]).includes(demand.status)) this.illegal("需求", demand.status, ["RECEIVED", "BLOCKED"]);
      this.requireExpectedVersion(context, demand.version);
      const missing: string[] = [];
      if (input.productActive === false) missing.push("产品未启用");
      if (input.factoryActive === false) missing.push("工厂不可用");
      if (input.bomEffective === false) missing.push("缺少有效 BOM");
      if (input.routingEffective === false) missing.push("缺少有效工艺路线");
      const validating = cloneWithVersion(demand);
      validating.status = "VALIDATING";
      const result = cloneWithVersion(validating);
      result.status = missing.length ? "BLOCKED" : "PENDING_REVIEW";
      result.blockReasons = missing;
      const updated = await repository.updateDemand(result, demand.version);
      if (!updated) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "需求已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "Demand", id, demand.status, "VALIDATING", validating.version, {}, undefined, undefined, demand.correlationId);
      await this.recordTransition(repository, context, "Demand", id, "VALIDATING", result.status, result.version,
        { blockReasons: missing }, missing.length ? "MASTER_DATA_MISSING" : undefined, missing.join("；"), demand.correlationId);
      return { statusCode: 200, body: result, aggregateType: "Demand", aggregateId: id };
    });
  }

  approveDemand(context: RequestContext, id: string, input: { remark?: string }) {
    this.requirePermission(context, "production.demand.approve");
    return this.command(context, "ApproveDemand", { id, ...input }, async (repository) => {
      const demand = await repository.getDemand(context.tenantId, id);
      if (!demand) this.notFound("需求");
      if (demand.status !== "PENDING_REVIEW") this.illegal("需求", demand.status, ["PENDING_REVIEW"]);
      this.requireExpectedVersion(context, demand.version);
      if (demand.createdBy === context.actorId) {
        throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", "需求制单人不能审批本人创建的需求", "请由另一名具备审批权限的人员操作");
      }
      const result = cloneWithVersion(demand); result.status = "APPROVED";
      if (!await repository.updateDemand(result, demand.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "需求已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "Demand", id, demand.status, result.status, result.version, {}, undefined, input.remark, demand.correlationId);
      await this.audit(repository, context, "DEMAND_APPROVE", "Demand", id, demand, result, input.remark);
      return { statusCode: 200, body: result, aggregateType: "Demand", aggregateId: id };
    });
  }

  createWorkOrder(context: RequestContext, input: {
    code?: string; productId: string; productName?: string; factoryResourceId: string; workshopResourceId?: string;
    lineResourceId?: string; workCenterResourceId: string; plannedQty: string; inputQty?: string; uom: string; dueDate: string;
    bomSnapshotId?: string; routingSnapshotId?: string; scheduleCandidateId?: string; kittingCheckId?: string;
    kittingStatus?: "READY" | "PARTIAL_READY" | "SHORTAGE" | "EXPIRED"; assigneeEmployeeId?: string;
    correlationId?: string; demandLinks?: Array<{ demandId: string; allocatedQty: string; priorityRank?: number; customerLocked?: boolean; promisedDate?: string }>;
  }) {
    this.requirePermission(context, "production.work-order.create");
    return this.command(context, "CreateWorkOrder", input, async (repository) => {
      const links = input.demandLinks ?? [];
      if (links.length && compareDecimal(sumDecimals(links.map((item) => item.allocatedQty)), input.plannedQty) !== 0) {
        throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "工单需求分配合计必须等于计划数量", "调整需求分配数量后重试");
      }
      for (const link of links) {
        const demand = await repository.getDemand(context.tenantId, link.demandId);
        if (!demand) this.notFound("关联需求");
        if (!(["APPROVED", "PLANNED"] as string[]).includes(demand.status)) this.illegal("关联需求", demand.status, ["APPROVED", "PLANNED"]);
      }
      const timestamp = now();
      const order: WorkOrder = {
        id: randomUUID(), tenantId: context.tenantId, code: input.code ?? `WO-${codeSuffix()}`, productId: input.productId,
        productName: input.productName, factoryResourceId: input.factoryResourceId, workshopResourceId: input.workshopResourceId,
        lineResourceId: input.lineResourceId, workCenterResourceId: input.workCenterResourceId, plannedQty: input.plannedQty,
        inputQty: input.inputQty ?? "0", reportedGoodQty: "0", reportedDefectQty: "0", reportedScrapQty: "0", postedQty: "0",
        uom: input.uom, dueDate: input.dueDate, status: input.bomSnapshotId && input.routingSnapshotId ? "PLANNED" : "DRAFT",
        bomSnapshotId: input.bomSnapshotId, routingSnapshotId: input.routingSnapshotId, scheduleCandidateId: input.scheduleCandidateId,
        kittingCheckId: input.kittingCheckId, kittingStatus: input.kittingStatus, assigneeEmployeeId: input.assigneeEmployeeId,
        correlationId: input.correlationId ?? randomUUID(), parameterSnapshot: {}, createdBy: context.actorId, version: 1,
        createdAt: timestamp, updatedAt: timestamp,
      };
      const demandLinks: WorkOrderDemand[] = links.map((item, index) => ({
        id: randomUUID(), tenantId: context.tenantId, workOrderId: order.id, demandId: item.demandId,
        allocatedQty: item.allocatedQty, priorityRank: item.priorityRank ?? index + 1,
        customerLocked: item.customerLocked ?? false, promisedDate: item.promisedDate,
      }));
      await repository.insertWorkOrder(order, demandLinks);
      await this.recordTransition(repository, context, "WorkOrder", order.id, undefined, order.status, order.version,
        { code: order.code, plannedQty: order.plannedQty }, undefined, undefined, order.correlationId);
      return { statusCode: 201, body: order, aggregateType: "WorkOrder", aggregateId: order.id };
    });
  }

  private releaseBlockers(order: WorkOrder) {
    const blockers: Array<{ code: string; message: string; repairAction: string }> = [];
    if (!order.bomSnapshotId) blockers.push({ code: "BOM_SNAPSHOT_MISSING", message: "缺少生效 BOM 快照", repairAction: "选择有效 BOM 后重新生成工单快照" });
    if (!order.routingSnapshotId) blockers.push({ code: "ROUTING_SNAPSHOT_MISSING", message: "缺少生效工艺快照", repairAction: "选择有效工艺路线后重新生成快照" });
    if (!order.scheduleCandidateId) blockers.push({ code: "APS_NOT_PUBLISHED", message: "APS 排程尚未发布", repairAction: "完成排程并发布候选方案" });
    if (order.kittingStatus !== "READY") blockers.push({ code: "KITTING_NOT_READY", message: `物料齐套状态为 ${order.kittingStatus ?? "未检查"}`, repairAction: "重新执行齐套检查并完成库存预占" });
    return blockers;
  }

  async releaseImpact(context: RequestContext, id: string) {
    const order = await this.repository.getWorkOrder(context.tenantId, id);
    if (!order) this.notFound("工单");
    return { canRelease: this.releaseBlockers(order).length === 0, blockers: this.releaseBlockers(order), version: order.version };
  }

  releaseWorkOrder(context: RequestContext, id: string, input: { reason?: string }) {
    this.requirePermission(context, "production.work-order.release");
    return this.command(context, "ReleaseWorkOrder", { id, ...input }, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, id);
      if (!order) this.notFound("工单");
      if (!(["PLANNED", "SCHEDULED", "KITTING"] as string[]).includes(order.status)) this.illegal("工单", order.status, ["PLANNED", "SCHEDULED", "KITTING"]);
      this.requireExpectedVersion(context, order.version);
      const blockers = this.releaseBlockers(order);
      if (blockers.length) {
        const kitting = blockers.some((item) => item.code === "KITTING_NOT_READY");
        throw new ProductionError(kitting ? "PRODUCTION_422_KITTING_BLOCKED" : "PRODUCTION_422_MASTER_DATA_MISSING",
          "工单未满足下达条件", "按阻断项完成修复后重新执行影响预览", { details: { blockers } });
      }
      const result = cloneWithVersion(order); result.status = "RELEASED";
      if (!await repository.updateWorkOrder(result, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "WorkOrder", id, order.status, result.status, result.version, {}, undefined, input.reason, order.correlationId);
      await this.audit(repository, context, "WORK_ORDER_RELEASE", "WorkOrder", id, order, result, input.reason);
      return { statusCode: 200, body: result, aggregateType: "WorkOrder", aggregateId: id };
    });
  }

  private changeWorkOrderState(context: RequestContext, id: string, commandType: string, permission: string,
    allowed: string[], nextStatus: WorkOrder["status"], input: { reason?: string }) {
    this.requirePermission(context, permission);
    return this.command(context, commandType, { id, ...input }, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, id);
      if (!order) this.notFound("工单");
      if (!allowed.includes(order.status)) this.illegal("工单", order.status, allowed);
      this.requireExpectedVersion(context, order.version);
      const result = cloneWithVersion(order); result.status = nextStatus;
      if (!await repository.updateWorkOrder(result, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "WorkOrder", id, order.status, result.status, result.version, {}, undefined, input.reason, order.correlationId);
      await this.audit(repository, context, commandType, "WorkOrder", id, order, result, input.reason);
      return { statusCode: 200, body: result, aggregateType: "WorkOrder", aggregateId: id };
    });
  }

  startWorkOrder(context: RequestContext, id: string, input: { reason?: string }) {
    return this.changeWorkOrderState(context, id, "StartWorkOrder", "production.work-order.start", ["RELEASED"], "IN_PROGRESS", input);
  }
  pauseWorkOrder(context: RequestContext, id: string, input: { reason?: string }) {
    if (!input.reason?.trim()) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "暂停工单必须填写原因", "填写可审计的暂停原因");
    return this.changeWorkOrderState(context, id, "PauseWorkOrder", "production.work-order.pause", ["IN_PROGRESS"], "PAUSED", input);
  }
  resumeWorkOrder(context: RequestContext, id: string, input: { reason?: string }) {
    return this.changeWorkOrderState(context, id, "ResumeWorkOrder", "production.work-order.pause", ["PAUSED"], "IN_PROGRESS", input);
  }

  submitReport(context: RequestContext, workOrderId: string, input: {
    operationId?: string; goodQty: string; defectQty?: string; scrapQty?: string; inputQty?: string; uom: string; source?: string; remark?: string;
  }) {
    this.requirePermission(context, "production.work-order.report");
    return this.command(context, "SubmitWorkReport", { workOrderId, ...input }, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, workOrderId);
      if (!order) this.notFound("工单");
      if (order.status !== "IN_PROGRESS") this.illegal("工单", order.status, ["IN_PROGRESS"]);
      this.requireExpectedVersion(context, order.version);
      const defect = input.defectQty ?? "0"; const scrap = input.scrapQty ?? "0"; const addedInput = input.inputQty ?? "0";
      const reportTotal = sumDecimals([input.goodQty, defect, scrap]);
      if (compareDecimal(reportTotal, "0") <= 0) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "本次报工数量必须大于 0", "录入合格、不良或报废数量");
      const nextInput = addDecimal(order.inputQty, addedInput);
      const nextTotal = sumDecimals([order.reportedGoodQty, order.reportedDefectQty, order.reportedScrapQty, reportTotal]);
      const reportableLimit = minDecimal(nextInput, order.plannedQty);
      if (compareDecimal(nextTotal, reportableLimit) > 0) {
        throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "累计报工数量超过投入量或可报上限", "减少本次数量或先补充有效投入", {
          fieldErrors: [{ field: "goodQty/defectQty/scrapQty", message: `可报上限 ${subtractDecimal(reportableLimit, sumDecimals([order.reportedGoodQty, order.reportedDefectQty, order.reportedScrapQty]))}` }],
          details: { cumulativeAfterSubmit: nextTotal, cumulativeInput: nextInput, plannedQty: order.plannedQty, reportableLimit },
        });
      }
      const timestamp = now();
      const report: WorkReport = {
        id: randomUUID(), tenantId: context.tenantId, workOrderId, operationId: input.operationId, goodQty: input.goodQty,
        defectQty: defect, scrapQty: scrap, inputQty: addedInput, uom: input.uom, status: "POSTED", reportedBy: context.actorId,
        reportedAt: timestamp, source: input.source ?? "WEB", remark: input.remark, version: 1, createdAt: timestamp, updatedAt: timestamp,
      };
      const result = cloneWithVersion(order);
      result.inputQty = nextInput; result.reportedGoodQty = addDecimal(order.reportedGoodQty, input.goodQty);
      result.reportedDefectQty = addDecimal(order.reportedDefectQty, defect); result.reportedScrapQty = addDecimal(order.reportedScrapQty, scrap);
      await repository.insertWorkReport(report);
      if (!await repository.updateWorkOrder(result, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单报工发生并发冲突", "刷新工单后重新核对可报数量");
      await this.recordTransition(repository, context, "WorkReport", report.id, undefined, "SUBMITTED", 1, { workOrderId });
      await this.recordTransition(repository, context, "WorkReport", report.id, "SUBMITTED", "PROCESSING", 1, { workOrderId });
      await this.recordTransition(repository, context, "WorkReport", report.id, "PROCESSING", "POSTED", 1,
        { workOrderId, goodQty: report.goodQty, defectQty: report.defectQty, scrapQty: report.scrapQty }, undefined, undefined, order.correlationId);
      return { statusCode: 201, body: { report, workOrder: result }, aggregateType: "WorkReport", aggregateId: report.id };
    });
  }

  correctReport(context: RequestContext, reportId: string, input: {
    goodQty: string; defectQty?: string; scrapQty?: string; inputQty?: string; reasonCode: string; reason: string;
  }) {
    this.requirePermission(context, "production.work-order.report.correct");
    return this.command(context, "CorrectWorkReport", { reportId, ...input }, async (repository) => {
      const original = await repository.getWorkReport(context.tenantId, reportId);
      if (!original) this.notFound("报工记录");
      if (original.status !== "POSTED") this.illegal("报工记录", original.status, ["POSTED"]);
      const order = await repository.getWorkOrder(context.tenantId, original.workOrderId);
      if (!order) this.notFound("工单");
      if (order.status === "CLOSED") this.illegal("工单", order.status, ["IN_PROGRESS", "PAUSED", "COMPLETED"]);
      const defect = input.defectQty ?? "0"; const scrap = input.scrapQty ?? "0"; const newInput = input.inputQty ?? original.inputQty;
      const baseGood = subtractDecimal(order.reportedGoodQty, original.goodQty);
      const baseDefect = subtractDecimal(order.reportedDefectQty, original.defectQty);
      const baseScrap = subtractDecimal(order.reportedScrapQty, original.scrapQty);
      const baseInput = subtractDecimal(order.inputQty, original.inputQty);
      const afterInput = addDecimal(baseInput, newInput);
      const afterTotal = sumDecimals([baseGood, baseDefect, baseScrap, input.goodQty, defect, scrap]);
      if (compareDecimal(afterTotal, minDecimal(afterInput, order.plannedQty)) > 0) {
        throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "更正后累计报工超过投入量或计划上限", "调整更正数量或投入数量");
      }
      const timestamp = now();
      const replacement: WorkReport = { ...structuredClone(original), id: randomUUID(), goodQty: input.goodQty, defectQty: defect,
        scrapQty: scrap, inputQty: newInput, status: "POSTED", reportedBy: context.actorId, reportedAt: timestamp,
        remark: input.reason, version: 1, createdAt: timestamp, updatedAt: timestamp };
      const corrected = cloneWithVersion(original); corrected.status = "CORRECTED";
      const correction: ReportCorrection = { id: randomUUID(), tenantId: context.tenantId, originalReportId: original.id,
        replacementReportId: replacement.id, reasonCode: input.reasonCode, reason: input.reason,
        originalSnapshot: original, correctedSnapshot: replacement, status: "POSTED", createdBy: context.actorId, createdAt: timestamp };
      const updatedOrder = cloneWithVersion(order); updatedOrder.inputQty = afterInput;
      updatedOrder.reportedGoodQty = addDecimal(baseGood, input.goodQty); updatedOrder.reportedDefectQty = addDecimal(baseDefect, defect);
      updatedOrder.reportedScrapQty = addDecimal(baseScrap, scrap);
      if (!await repository.updateWorkReport(corrected, original.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "报工已被并发更正", "刷新后核对");
      await repository.insertReportCorrection(correction, replacement);
      if (!await repository.updateWorkOrder(updatedOrder, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单已被并发修改", "刷新后核对");
      await this.recordTransition(repository, context, "WorkReport", original.id, "POSTED", "CORRECTING", corrected.version, { correctionId: correction.id });
      await this.recordTransition(repository, context, "WorkReport", original.id, "CORRECTING", "CORRECTED", corrected.version, { replacementReportId: replacement.id }, input.reasonCode, input.reason, order.correlationId);
      await this.audit(repository, context, "WORK_REPORT_CORRECT", "WorkReport", original.id, original, replacement, input.reason);
      return { statusCode: 201, body: { correction, replacementReport: replacement, workOrder: updatedOrder }, aggregateType: "WorkReport", aggregateId: original.id };
    });
  }

  createInspection(context: RequestContext, input: { workOrderId: string; sampleQty: string; parentInspectionId?: string }) {
    this.requirePermission(context, "production.quality.inspect");
    return this.command(context, "CreateInspection", input, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, input.workOrderId);
      if (!order) this.notFound("工单");
      if (!(["IN_PROGRESS", "PAUSED", "COMPLETED"] as string[]).includes(order.status)) this.illegal("工单", order.status, ["IN_PROGRESS", "PAUSED", "COMPLETED"]);
      if (input.parentInspectionId) {
        const parent = await repository.getInspection(context.tenantId, input.parentInspectionId);
        if (!parent) this.notFound("原检验单");
        if (parent.workOrderId !== order.id || parent.status !== "REWORK") this.illegal("原检验单", parent.status, ["REWORK"]);
      }
      const inspections = await repository.listInspections(context.tenantId, order.id);
      const reserved = sumDecimals(inspections.filter((item) => ["CREATED","SAMPLING","INSPECTING","PASSED","DISPOSITION_PENDING","REWORK","REINSPECTION"].includes(item.status))
        .filter((item) => !item.parentInspectionId).map((item) => item.sampleQty));
      if (!input.parentInspectionId && compareDecimal(addDecimal(reserved, input.sampleQty), order.reportedGoodQty) > 0) {
        throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "送检数量超过已报合格且未送检数量", "减少送检数量或先完成合格报工", { details: { reportedGoodQty: order.reportedGoodQty, alreadyInspectedQty: reserved } });
      }
      const timestamp = now();
      const inspection: Inspection = { id: randomUUID(), tenantId: context.tenantId, code: `FQC-${codeSuffix()}`,
        workOrderId: order.id, inspectionType: "FQC", parentInspectionId: input.parentInspectionId, sampleQty: input.sampleQty,
        passedQty: "0", failedQty: "0", status: input.parentInspectionId ? "REINSPECTION" : "CREATED", createdBy: context.actorId,
        version: 1, createdAt: timestamp, updatedAt: timestamp };
      await repository.insertInspection(inspection);
      await this.recordTransition(repository, context, "Inspection", inspection.id, undefined, inspection.status, inspection.version,
        { workOrderId: order.id, sampleQty: inspection.sampleQty }, undefined, undefined, order.correlationId);
      return { statusCode: 201, body: inspection, aggregateType: "Inspection", aggregateId: inspection.id };
    });
  }

  listInspections(context: RequestContext, workOrderId?: string) { return this.repository.listInspections(context.tenantId, workOrderId); }

  submitInspectionResult(context: RequestContext, id: string, input: { passedQty: string; failedQty?: string; reason?: string }) {
    this.requirePermission(context, "production.quality.inspect");
    return this.command(context, "SubmitInspectionResult", { id, ...input }, async (repository) => {
      const inspection = await repository.getInspection(context.tenantId, id);
      if (!inspection) this.notFound("检验单");
      if (!(["CREATED", "REINSPECTION"] as string[]).includes(inspection.status)) this.illegal("检验单", inspection.status, ["CREATED", "REINSPECTION"]);
      this.requireExpectedVersion(context, inspection.version);
      const failed = input.failedQty ?? "0";
      if (compareDecimal(addDecimal(input.passedQty, failed), inspection.sampleQty) !== 0) {
        throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "检验合格量与不合格量之和必须等于送检量", "核对检验数量后提交");
      }
      const inspecting = cloneWithVersion(inspection); inspecting.status = "INSPECTING";
      const result = cloneWithVersion(inspecting); result.passedQty = input.passedQty; result.failedQty = failed;
      result.inspectorId = context.actorId; result.inspectedAt = now(); result.resultReason = input.reason;
      result.status = compareDecimal(failed, "0") > 0 ? "DISPOSITION_PENDING" : "PASSED";
      if (!await repository.updateInspection(result, inspection.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "检验单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "Inspection", id, inspection.status, "INSPECTING", inspecting.version, {});
      if (result.status === "DISPOSITION_PENDING") {
        await this.recordTransition(repository, context, "Inspection", id, "INSPECTING", "FAILED", result.version, { failedQty: failed }, "FQC_FAILED", input.reason);
        await this.recordTransition(repository, context, "Inspection", id, "FAILED", "DISPOSITION_PENDING", result.version, { failedQty: failed }, "DISPOSITION_REQUIRED", input.reason);
      } else {
        await this.recordTransition(repository, context, "Inspection", id, "INSPECTING", "PASSED", result.version, { passedQty: result.passedQty });
      }
      await this.audit(repository, context, "FQC_RESULT", "Inspection", id, inspection, result, input.reason);
      return { statusCode: 200, body: result, aggregateType: "Inspection", aggregateId: id };
    });
  }

  createRework(context: RequestContext, id: string, input: { qty: string; reason: string }) {
    this.requirePermission(context, "production.quality.disposition");
    return this.command(context, "CreateRework", { id, ...input }, async (repository) => {
      const inspection = await repository.getInspection(context.tenantId, id);
      if (!inspection) this.notFound("检验单");
      if (inspection.status !== "DISPOSITION_PENDING") this.illegal("检验单", inspection.status, ["DISPOSITION_PENDING"]);
      if (compareDecimal(input.qty, inspection.failedQty) > 0) throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "返工数量超过不合格数量", "调整返工数量");
      const timestamp = now();
      const rework: ReworkOrder = { id: randomUUID(), tenantId: context.tenantId, code: `RW-${codeSuffix()}`,
        sourceInspectionId: id, workOrderId: inspection.workOrderId, qty: input.qty, status: "CREATED", createdBy: context.actorId, createdAt: timestamp };
      const result = cloneWithVersion(inspection); result.status = "REWORK";
      await repository.insertReworkOrder(rework);
      if (!await repository.updateInspection(result, inspection.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "检验单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "Inspection", id, inspection.status, result.status, result.version, { reworkOrderId: rework.id, qty: input.qty }, "REWORK", input.reason);
      await this.audit(repository, context, "FQC_REWORK", "Inspection", id, inspection, result, input.reason);
      return { statusCode: 201, body: { inspection: result, reworkOrder: rework }, aggregateType: "Inspection", aggregateId: id };
    });
  }

  scrapInspection(context: RequestContext, id: string, input: { qty: string; reason: string }) {
    this.requirePermission(context, "production.quality.disposition");
    return this.command(context, "ScrapInspection", { id, ...input }, async (repository) => {
      const inspection = await repository.getInspection(context.tenantId, id);
      if (!inspection) this.notFound("检验单");
      if (inspection.status !== "DISPOSITION_PENDING") this.illegal("检验单", inspection.status, ["DISPOSITION_PENDING"]);
      if (inspection.inspectorId === context.actorId) throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", "检验人与报废审批人必须分离", "请由另一名质量主管审批报废");
      if (compareDecimal(input.qty, inspection.failedQty) !== 0) throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "P0 报废处置必须覆盖本检验单全部不合格数量", "按不合格数量提交，或先走返工路径");
      const pending = cloneWithVersion(inspection); pending.status = "SCRAP_PENDING";
      const result = cloneWithVersion(pending); result.status = "SCRAPPED";
      if (!await repository.updateInspection(result, inspection.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "检验单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "Inspection", id, inspection.status, "SCRAP_PENDING", pending.version, { qty: input.qty }, "SCRAP_APPROVAL", input.reason);
      await this.recordTransition(repository, context, "Inspection", id, "SCRAP_PENDING", "SCRAPPED", result.version, { qty: input.qty }, "SCRAPPED", input.reason);
      await this.audit(repository, context, "FQC_SCRAP", "Inspection", id, inspection, result, input.reason);
      return { statusCode: 200, body: result, aggregateType: "Inspection", aggregateId: id };
    });
  }

  private async completionAvailable(repository: ProductionRepository, order: WorkOrder, inspection: Inspection) {
    const completions = await repository.listCompletions(order.tenantId, order.id);
    const inspectionCommitted = sumDecimals(completions.filter((item) => item.inspectionId === inspection.id && ["POSTING", "POSTED"].includes(item.status)).map((item) => item.qty));
    const orderCommitted = sumDecimals(completions.filter((item) => ["POSTING", "POSTED"].includes(item.status)).map((item) => item.qty));
    return minDecimal(subtractDecimal(inspection.passedQty, inspectionCommitted), subtractDecimal(order.reportedGoodQty, orderCommitted));
  }

  async allocationPreview(context: RequestContext, workOrderId: string, qty: string) {
    const order = await this.repository.getWorkOrder(context.tenantId, workOrderId);
    if (!order) this.notFound("工单");
    return { workOrderId, qty, allocations: await this.calculateAllocations(this.repository, order, qty, "PREVIEW") };
  }

  createCompletion(context: RequestContext, workOrderId: string, input: {
    inspectionId: string; qty: string; uom: string; warehouseResourceId: string; inventoryWarehouseId: string;
    binId?: string; traceMode: "NONE" | "BATCH" | "SERIAL"; batchNo?: string; serialNumbers?: string[];
    productionDate: string; allocationRevision: number; remark?: string;
  }) {
    this.requirePermission(context, "production.completion.post");
    return this.command(context, "CreateCompletion", { workOrderId, ...input }, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, workOrderId);
      if (!order) this.notFound("工单");
      if (!(["IN_PROGRESS", "PAUSED", "COMPLETED"] as string[]).includes(order.status)) this.illegal("工单", order.status, ["IN_PROGRESS", "PAUSED", "COMPLETED"]);
      const inspection = await repository.getInspection(context.tenantId, input.inspectionId);
      if (!inspection || inspection.workOrderId !== order.id) this.notFound("FQC 检验单");
      if (inspection.status !== "PASSED") throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "FQC 未通过或处置未关闭，禁止完工入库", "完成 FQC 并确保结果为 PASSED", { details: { inspectionStatus: inspection.status } });
      const available = await this.completionAvailable(repository, order, inspection);
      if (compareDecimal(input.qty, available) > 0) throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "完工数量超过 FQC 合格且未提交入库数量", "减少完工数量或完成新的 FQC", { details: { availableQty: available } });
      const serials = [...new Set(input.serialNumbers ?? [])];
      if (input.traceMode === "BATCH" && !input.batchNo?.trim()) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "批次追溯模式必须填写批次号", "填写批次号");
      if (input.traceMode === "SERIAL") {
        if (serials.length !== input.serialNumbers?.length) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "本次提交包含重复序列号", "移除重复序列号");
        if (decimalToScaled(input.qty) % 1_000_000n !== 0n || BigInt(serials.length) !== decimalToScaled(input.qty) / 1_000_000n) {
          throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "序列号数量必须与整数完工数量一致", "逐件扫描唯一序列号");
        }
        const duplicate = await repository.serialNumbersExist(context.tenantId, serials);
        if (duplicate.length) throw new ProductionError("PRODUCTION_409_IDEMPOTENCY_CONFLICT", "序列号已入库或正在入库", "核对序列号后重试", { details: { serialNumbers: duplicate } });
      }
      if (input.traceMode === "NONE" && (input.batchNo || serials.length)) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "无追溯模式不应提交批次或序列号", "清空批次与序列号字段");
      const timestamp = now(); const completionId = randomUUID(); const taskId = randomUUID();
      const completion: Completion = { id: completionId, tenantId: context.tenantId, code: `CMP-${codeSuffix()}`, workOrderId,
        inspectionId: inspection.id, qty: input.qty, uom: input.uom, warehouseResourceId: input.warehouseResourceId,
        inventoryWarehouseId: input.inventoryWarehouseId, binId: input.binId, traceMode: input.traceMode, batchNo: input.batchNo,
        serialNumbers: serials, productionDate: input.productionDate, allocationRevision: input.allocationRevision, status: "POSTING",
        inventoryIdempotencyKey: `inventory-completion:${context.tenantId}:${completionId}`, taskId, remark: input.remark,
        createdBy: context.actorId, version: 1, createdAt: timestamp, updatedAt: timestamp };
      const task: OperationTask = { id: taskId, tenantId: context.tenantId, taskType: "FINISHED_GOODS_RECEIPT",
        aggregateType: "Completion", aggregateId: completionId, status: "RUNNING", progress: 20, retryCount: 0, maxRetryCount: 4,
        input: { completionId, inventoryIdempotencyKey: completion.inventoryIdempotencyKey }, traceId: context.traceId,
        createdBy: context.actorId, createdAt: timestamp, updatedAt: timestamp };
      await repository.insertCompletion(completion); await repository.insertTask(task);
      await this.recordTransition(repository, context, "Completion", completion.id, undefined, "SUBMITTED", completion.version, { workOrderId, qty: input.qty });
      await this.recordTransition(repository, context, "Completion", completion.id, "SUBMITTED", "POSTING", completion.version,
        { workOrderId, qty: input.qty, taskId, inventoryIdempotencyKey: completion.inventoryIdempotencyKey }, undefined, undefined, order.correlationId);
      await this.audit(repository, context, "COMPLETION_SUBMIT", "Completion", completion.id, undefined, completion, input.remark);
      return { statusCode: 202, body: { completionId, taskId, status: "POSTING", idempotencyKey: context.idempotencyKey!, traceId: context.traceId }, aggregateType: "Completion", aggregateId: completionId };
    });
  }

  async getCompletion(context: RequestContext, id: string) {
    const completion = await this.repository.getCompletion(context.tenantId, id);
    if (!completion) this.notFound("完工记录");
    return { ...completion, allocations: await this.repository.listCompletionAllocations(context.tenantId, id) };
  }

  inventoryResult(context: RequestContext, id: string, input: { result: "POSTED" | "REJECTED" | "UNKNOWN"; externalTransactionId?: string; failureCode?: string; failureMessage?: string }) {
    this.requirePermission(context, "production.inventory.callback");
    return this.command<any>(context, "InventoryCompletionResult", { id, ...input }, async (repository) => {
      const completion = await repository.getCompletion(context.tenantId, id);
      if (!completion) this.notFound("完工记录");
      if (completion.status === "POSTED" && input.result === "POSTED" && completion.externalTransactionId === input.externalTransactionId) {
        return { statusCode: 200, body: completion, aggregateType: "Completion", aggregateId: id };
      }
      if (completion.status !== "POSTING") this.illegal("完工记录", completion.status, ["POSTING"]);
      const task = await repository.getTask(context.tenantId, completion.taskId);
      if (!task) this.notFound("完工任务");
      if (input.result === "UNKNOWN") {
        const retryTask = { ...task, status: "RETRY_WAIT" as const, progress: task.progress, retryCount: task.retryCount + 1,
          errorCode: "INVENTORY_RESULT_UNKNOWN", errorMessage: "库存结果暂时未知，保留原幂等关系查询", updatedAt: now() };
        await repository.updateTask(retryTask);
        return { statusCode: 202, body: { ...completion, task: retryTask }, aggregateType: "Completion", aggregateId: id };
      }
      if (input.result === "REJECTED") {
        const result = cloneWithVersion(completion); result.status = "FAILED";
        result.failureCode = input.failureCode ?? "INVENTORY_REJECTED"; result.failureMessage = input.failureMessage ?? "库存明确拒绝入库";
        if (!await repository.updateCompletion(result, completion.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "完工记录已被并发修改", "查询原任务结果");
        await repository.updateTask({ ...task, status: "MANUAL_INTERVENTION", errorCode: result.failureCode, errorMessage: result.failureMessage, updatedAt: now() });
        await this.recordTransition(repository, context, "Completion", id, "POSTING", "FAILED", result.version, { taskId: task.id }, result.failureCode, result.failureMessage);
        return { statusCode: 200, body: result, aggregateType: "Completion", aggregateId: id };
      }
      if (!input.externalTransactionId) throw new ProductionError("PRODUCTION_400_INVALID_ARGUMENT", "库存确认成功时必须返回唯一库存流水号", "补充 externalTransactionId 后重试");
      const order = await repository.getWorkOrder(context.tenantId, completion.workOrderId);
      if (!order) this.notFound("工单");
      const result = cloneWithVersion(completion); result.status = "POSTED"; result.externalTransactionId = input.externalTransactionId;
      result.postedAt = now(); result.failureCode = undefined; result.failureMessage = undefined;
      if (!await repository.updateCompletion(result, completion.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "完工记录已被并发修改", "查询原任务结果");
      const updatedOrder = cloneWithVersion(order); updatedOrder.postedQty = addDecimal(order.postedQty, completion.qty);
      if (compareDecimal(updatedOrder.postedQty, order.plannedQty) >= 0) updatedOrder.status = "COMPLETED";
      if (!await repository.updateWorkOrder(updatedOrder, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单完工量发生并发冲突", "系统将使用原库存流水进行对账", { retryable: true });
      const allocations = await this.calculateAllocations(repository, order, completion.qty, completion.id);
      await repository.insertCompletionAllocations(allocations);
      await repository.updateTask({ ...task, status: "SUCCEEDED", progress: 100, result: { externalTransactionId: input.externalTransactionId }, updatedAt: now() });
      await this.recordTransition(repository, context, "Completion", id, "POSTING", "POSTED", result.version,
        { workOrderId: order.id, qty: completion.qty, externalTransactionId: input.externalTransactionId, allocations }, undefined, undefined, order.correlationId);
      if (updatedOrder.status !== order.status) await this.recordTransition(repository, context, "WorkOrder", order.id, order.status, updatedOrder.status, updatedOrder.version, { postedQty: updatedOrder.postedQty }, undefined, undefined, order.correlationId);
      await this.audit(repository, context, "COMPLETION_POSTED", "Completion", id, completion, result);
      return { statusCode: 200, body: { completion: result, workOrder: updatedOrder, allocations }, aggregateType: "Completion", aggregateId: id };
    });
  }

  retryCompletion(context: RequestContext, id: string, input: { binId?: string; batchNo?: string; remark?: string }) {
    this.requirePermission(context, "production.completion.retry");
    return this.command(context, "RetryCompletion", { id, ...input }, async (repository) => {
      const completion = await repository.getCompletion(context.tenantId, id);
      if (!completion) this.notFound("完工记录");
      if (completion.status !== "FAILED") this.illegal("完工记录", completion.status, ["FAILED"]);
      const task = await repository.getTask(context.tenantId, completion.taskId);
      if (!task) this.notFound("完工任务");
      const result = cloneWithVersion(completion); result.status = "POSTING"; result.binId = input.binId ?? completion.binId;
      result.batchNo = input.batchNo ?? completion.batchNo; result.remark = input.remark ?? completion.remark;
      result.failureCode = undefined; result.failureMessage = undefined;
      if (!await repository.updateCompletion(result, completion.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "完工记录已被并发修改", "刷新后重试");
      await repository.updateTask({ ...task, status: "RUNNING", retryCount: task.retryCount + 1, progress: 20,
        errorCode: undefined, errorMessage: undefined, input: { ...task.input, retry: task.retryCount + 1, inventoryIdempotencyKey: completion.inventoryIdempotencyKey }, updatedAt: now() });
      await this.recordTransition(repository, context, "Completion", id, "FAILED", "POSTING", result.version,
        { inventoryIdempotencyKey: completion.inventoryIdempotencyKey, retryCount: task.retryCount + 1 }, "RETRY", input.remark);
      return { statusCode: 202, body: { completionId: id, taskId: completion.taskId, status: "POSTING", inventoryIdempotencyKey: completion.inventoryIdempotencyKey }, aggregateType: "Completion", aggregateId: id };
    });
  }

  private async calculateAllocations(repository: ProductionRepository, order: WorkOrder, qty: string, completionId: string): Promise<CompletionAllocation[]> {
    const links = await repository.listWorkOrderDemands(order.tenantId, order.id);
    if (!links.length) return [];
    const completions = await repository.listCompletions(order.tenantId, order.id);
    const already: Record<string, bigint> = {};
    for (const completion of completions.filter((item) => item.status === "POSTED")) {
      const allocations = await repository.listCompletionAllocations(order.tenantId, completion.id);
      for (const allocation of allocations) already[allocation.demandId] = (already[allocation.demandId] ?? 0n) + decimalToScaled(allocation.qty);
    }
    let remaining = decimalToScaled(qty); const values: CompletionAllocation[] = [];
    const sorted = [...links].sort((a, b) => Number(b.customerLocked) - Number(a.customerLocked) || a.priorityRank - b.priorityRank ||
      (a.promisedDate ?? "9999").localeCompare(b.promisedDate ?? "9999") || a.demandId.localeCompare(b.demandId));
    for (const link of sorted) {
      if (remaining <= 0n) break;
      const capacity = decimalToScaled(link.allocatedQty) - (already[link.demandId] ?? 0n);
      if (capacity <= 0n) continue;
      const allocated = capacity < remaining ? capacity : remaining;
      values.push({ id: randomUUID(), tenantId: order.tenantId, completionId, demandId: link.demandId,
        qty: scaledToDecimal(allocated), rank: values.length + 1, ruleEvidence: { customerLocked: link.customerLocked,
          priorityRank: link.priorityRank, promisedDate: link.promisedDate, deterministicTieBreak: link.demandId }, createdAt: now() });
      remaining -= allocated;
    }
    if (remaining > 0n) throw new ProductionError("PRODUCTION_422_QUANTITY_VIOLATION", "完工数量超过工单需求分配的剩余数量", "调整完工数量或先修订需求 pegging", { details: { unallocatedQty: scaledToDecimal(remaining) } });
    return values;
  }

  async closeCheck(context: RequestContext, workOrderId: string): Promise<CloseCheck> {
    const order = await this.repository.getWorkOrder(context.tenantId, workOrderId);
    if (!order) this.notFound("工单");
    const blockers: CloseCheck["blockers"] = [];
    if (order.status !== "COMPLETED" && order.status !== "CLOSING") blockers.push({ code: "WORK_ORDER_NOT_COMPLETED", message: `工单状态为 ${order.status}`, repairAction: "完成生产、检验及入库后再结案" });
    const inspections = await this.repository.listInspections(context.tenantId, workOrderId);
    const openInspections = inspections.filter((item) => !["PASSED", "SCRAPPED"].includes(item.status));
    if (openInspections.length) blockers.push({ code: "FQC_OPEN", message: `存在 ${openInspections.length} 条未关闭 FQC`, repairAction: "完成检验或质量处置" });
    const completions = await this.repository.listCompletions(context.tenantId, workOrderId);
    const pending = completions.filter((item) => ["POSTING", "FAILED", "REVERSING"].includes(item.status));
    if (pending.length) blockers.push({ code: "COMPLETION_OPEN", message: `存在 ${pending.length} 条未确定完工入库`, repairAction: "查询、修复或完成库存任务" });
    if (compareDecimal(order.postedQty, "0") <= 0) blockers.push({ code: "NO_POSTED_COMPLETION", message: "没有库存已确认的完工数量", repairAction: "至少完成一笔成品入库" });
    if (await this.repository.hasBlockingMaterialTransactions(context.tenantId, workOrderId)) blockers.push({ code: "MATERIAL_TRANSACTION_OPEN", message: "仍有投料或退料任务未关闭", repairAction: "完成库存对账" });
    return { canClose: blockers.length === 0, blockers, checkedAt: now() };
  }

  closeSubmit(context: RequestContext, workOrderId: string, input: { reason?: string; varianceSnapshot?: Record<string, unknown> }) {
    this.requirePermission(context, "production.close.submit");
    return this.command(context, "SubmitWorkOrderClose", { workOrderId, ...input }, async (repository) => {
      const order = await repository.getWorkOrder(context.tenantId, workOrderId);
      if (!order) this.notFound("工单");
      if (order.status !== "COMPLETED") this.illegal("工单", order.status, ["COMPLETED"]);
      this.requireExpectedVersion(context, order.version);
      const check = await this.closeCheckWith(repository, context, order);
      if (!check.canClose) throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "工单仍存在未关闭事项，不能提交结案", "逐项处理结案检查中的阻断项", { details: check });
      const timestamp = now();
      const close: CloseRequest = { id: randomUUID(), tenantId: context.tenantId, workOrderId, status: "REVIEW_PENDING",
        checkSnapshot: check, varianceSnapshot: input.varianceSnapshot ?? {}, reason: input.reason, submittedBy: context.actorId,
        submittedAt: timestamp, version: 1, createdAt: timestamp, updatedAt: timestamp };
      const updatedOrder = cloneWithVersion(order); updatedOrder.status = "CLOSING";
      await repository.insertCloseRequest(close);
      if (!await repository.updateWorkOrder(updatedOrder, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单已被并发修改", "刷新后重试");
      await this.recordTransition(repository, context, "WorkOrder", workOrderId, "COMPLETED", "CLOSING", updatedOrder.version, { closeRequestId: close.id }, undefined, input.reason, order.correlationId);
      await this.audit(repository, context, "WORK_ORDER_CLOSE_SUBMIT", "WorkOrder", workOrderId, order, updatedOrder, input.reason);
      return { statusCode: 201, body: close, aggregateType: "WorkOrderClose", aggregateId: close.id };
    });
  }

  private async closeCheckWith(repository: ProductionRepository, context: RequestContext, order: WorkOrder): Promise<CloseCheck> {
    const blockers: CloseCheck["blockers"] = [];
    const inspections = await repository.listInspections(context.tenantId, order.id);
    if (inspections.some((item) => !["PASSED", "SCRAPPED"].includes(item.status))) blockers.push({ code: "FQC_OPEN", message: "存在未关闭 FQC", repairAction: "完成检验或质量处置" });
    const completions = await repository.listCompletions(context.tenantId, order.id);
    if (completions.some((item) => ["POSTING", "FAILED", "REVERSING"].includes(item.status))) blockers.push({ code: "COMPLETION_OPEN", message: "存在未确定完工任务", repairAction: "完成库存任务" });
    if (compareDecimal(order.postedQty, "0") <= 0) blockers.push({ code: "NO_POSTED_COMPLETION", message: "没有已入库完工数量", repairAction: "完成成品入库" });
    if (await repository.hasBlockingMaterialTransactions(context.tenantId, order.id)) blockers.push({ code: "MATERIAL_TRANSACTION_OPEN", message: "投退料未关闭", repairAction: "完成库存对账" });
    return { canClose: blockers.length === 0, blockers, checkedAt: now() };
  }

  approveClose(context: RequestContext, closeId: string, input: { remark?: string }) {
    this.requirePermission(context, "production.close.approve");
    return this.command(context, "ApproveWorkOrderClose", { closeId, ...input }, async (repository) => {
      const close = await repository.getCloseRequest(context.tenantId, closeId);
      if (!close) this.notFound("结案申请");
      if (close.status !== "REVIEW_PENDING") this.illegal("结案申请", close.status, ["REVIEW_PENDING"]);
      if (close.submittedBy === context.actorId) throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", "结案制单人与复核人必须为不同账号", "请由另一名具备结案复核权限的人员操作");
      const order = await repository.getWorkOrder(context.tenantId, close.workOrderId);
      if (!order) this.notFound("工单");
      if (order.status !== "CLOSING") this.illegal("工单", order.status, ["CLOSING"]);
      const latestCheck = await this.closeCheckWith(repository, context, order);
      if (!latestCheck.canClose) throw new ProductionError("PRODUCTION_409_ILLEGAL_STATE", "复核时发现新的未关闭事项", "处理阻断项后重新复核", { details: latestCheck });
      const timestamp = now(); const result = cloneWithVersion(close); result.status = "APPROVED";
      result.approvedBy = context.actorId; result.approvedAt = timestamp;
      const updatedOrder = cloneWithVersion(order); updatedOrder.status = "CLOSED";
      if (!await repository.updateCloseRequest(result, close.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "结案申请已被并发处理", "刷新后查看结果");
      if (!await repository.updateWorkOrder(updatedOrder, order.version)) throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "工单已被并发修改", "刷新后查看结果");
      await this.recordTransition(repository, context, "WorkOrder", order.id, "CLOSING", "CLOSED", updatedOrder.version, { closeRequestId: close.id }, undefined, input.remark, order.correlationId);
      await this.audit(repository, context, "WORK_ORDER_CLOSE_APPROVE", "WorkOrder", order.id, order, updatedOrder, input.remark);
      return { statusCode: 200, body: { closeRequest: result, workOrder: updatedOrder }, aggregateType: "WorkOrderClose", aggregateId: close.id };
    });
  }

  startPlanningTask(context: RequestContext, type: "MRP" | "APS", input: Record<string, unknown>) {
    this.requirePermission(context, type === "MRP" ? "production.mrp.run" : "production.aps.run");
    return this.command(context, `Start${type}Task`, input, async (repository) => {
      const timestamp = now();
      const task: OperationTask = { id: randomUUID(), tenantId: context.tenantId, taskType: `${type}_RUN`, status: "RUNNING",
        progress: 0, retryCount: 0, maxRetryCount: 4, input, traceId: context.traceId, createdBy: context.actorId,
        createdAt: timestamp, updatedAt: timestamp };
      await repository.insertTask(task);
      await this.recordTransition(repository, context, "OperationTask", task.id, "PENDING", "RUNNING", 1, { taskType: task.taskType });
      return { statusCode: 202, body: { taskId: task.id, status: task.status, traceId: context.traceId }, aggregateType: "OperationTask", aggregateId: task.id };
    });
  }

  async dashboard(context: RequestContext) {
    const query: ListQuery = { limit: 10_000, offset: 0 };
    const [orders, demands, inspections] = await Promise.all([
      this.repository.listWorkOrders(context.tenantId, query), this.repository.listDemands(context.tenantId, query),
      this.repository.listInspections(context.tenantId),
    ]);
    const active = orders.items.filter((item) => !["CLOSED", "CANCELLED"].includes(item.status));
    const atRisk = active.filter((item) => item.dueDate < new Date().toISOString().slice(0, 10) && item.status !== "COMPLETED");
    const totalPlanned = sumDecimals(active.map((item) => item.plannedQty));
    const totalPosted = sumDecimals(active.map((item) => item.postedQty));
    return {
      kpis: {
        activeWorkOrders: active.length, overdueWorkOrders: atRisk.length,
        completionRatePercent: compareDecimal(totalPlanned, "0") > 0 ? Number((decimalToScaled(totalPosted) * 10_000n / decimalToScaled(totalPlanned))) / 100 : 0,
        pendingDemands: demands.items.filter((item) => ["RECEIVED", "VALIDATING", "PENDING_REVIEW", "BLOCKED"].includes(item.status)).length,
        openFqc: inspections.filter((item) => !["PASSED", "SCRAPPED"].includes(item.status)).length,
      },
      risks: atRisk.slice(0, 20).map((item) => ({ type: "OVERDUE_WORK_ORDER", workOrderId: item.id, code: item.code, dueDate: item.dueDate, status: item.status })),
      updatedAt: now(), dataScope: { tenantId: context.tenantId },
    };
  }
}
