import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { ProductionError } from "../../errors.js";
import type { RequestContext } from "../../types.js";
import type { PlatformService } from "./service.js";

const page = z.coerce.number().int().min(1).default(1);
const pageSize = z.coerce.number().int().min(1).max(200).default(50);
const idParam = z.object({ id: z.string().min(1) });

const orgUnitInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: z.enum(["company", "department", "factory", "workshop"]),
  parentId: z.string().nullable(),
  managerEmployeeId: z.string().nullable(),
  status: z.enum(["enabled", "disabled"]),
});

const resourceInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: z.enum(["line", "warehouse", "work_center"]),
  ownerOrgId: z.string().min(1).max(100),
  factoryOrgId: z.string().nullable(),
  workshopOrgId: z.string().nullable(),
  managerEmployeeId: z.string().nullable(),
  specification: z.string().max(500),
  status: z.enum(["enabled", "disabled"]),
});

const positionInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  orgId: z.string().min(1).max(100),
  defaultRoleIds: z.array(z.string().min(1)).default([]),
  resourceIds: z.array(z.string().min(1)).default([]),
  status: z.enum(["enabled", "disabled"]),
});

const employeeInput = z.object({
  id: z.string().optional(),
  employeeNo: z.string().min(1).max(50),
  name: z.string().min(1).max(100),
  primaryOrgId: z.string().min(1).max(100),
  primaryPositionId: z.string().min(1).max(100),
  mobile: z.string().max(50),
  email: z.string().max(200),
  status: z.enum(["active", "transferring", "leave", "resigned"]),
});

const accountInput = z.object({
  id: z.string().optional(),
  loginName: z.string().min(1).max(100),
  employeeId: z.string().min(1).max(100),
  authType: z.enum(["password", "sso", "legacy_erp"]),
  status: z.enum(["pending_activation", "enabled", "locked", "disabled"]),
  directRoleIds: z.array(z.string().min(1)).default([]),
  password: z.string().min(6).max(200).optional(),
});

const roleInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(500),
  dataScope: z.string().min(1).max(50),
  scopeValues: z.array(z.string()).default([]),
  status: z.enum(["enabled", "disabled"]),
});

const roleGrantInput = z.object({
  grants: z.array(z.object({
    permissionId: z.string().min(1),
    effect: z.enum(["allow", "deny"]),
    fieldMode: z.enum(["visible", "hidden", "masked", "readonly", "export_denied"]).optional(),
  })),
});

const adapterInput = z.object({
  id: z.string().optional(),
  permissionCode: z.string().min(1).max(200),
  permissionName: z.string().min(1).max(200),
  module: z.string().min(1).max(100),
  legacyRoleCode: z.string().min(1).max(100),
  legacyScope: z.string().min(1).max(100),
  status: z.enum(["draft", "pending_sync", "synced", "conflict", "failed", "disabled"]),
  lastSyncAt: z.string().nullable(),
  errorMessage: z.string().default(""),
});

const approvalRuleInput = z.object({
  id: z.string().optional(),
  module: z.string().min(1).max(100),
  documentType: z.string().min(1).max(100),
  resolver: z.enum(["by_role", "by_position", "by_org_manager"]),
  resolverValue: z.string().min(1).max(100),
  fallback: z.enum(["block", "tenant_admin", "unassigned_pool"]),
  status: z.enum(["enabled", "disabled"]),
});

const dictionaryInput = z.object({
  id: z.string().optional(),
  category: z.string().min(1).max(100),
  code: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  status: z.enum(["enabled", "disabled"]),
});

const parameterInput = z.object({
  id: z.string().optional(),
  code: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  value: z.string().min(1).max(500),
  valueType: z.enum(["integer", "boolean", "text"]),
  effectiveMode: z.enum(["immediate", "next_login"]),
});

const capabilityInput = z.object({
  code: z.string().min(1).max(100),
  enabled: z.boolean(),
});

const sessionRevocationInput = z.object({
  account: z.string().min(1).max(100),
  jti: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
});

const auditLogQuery = z.object({
  module: z.string().optional(),
  result: z.enum(["success", "failed", "denied"]).optional(),
  operator: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  page,
  pageSize,
});

const actorPermissionsQuery = z.object({
  loginName: z.string().optional(),
  activeRole: z.string().optional(),
});

export function registerPlatformRoutes(
  app: FastifyInstance,
  contextFor: (request: FastifyRequest) => RequestContext,
  service: PlatformService,
) {
  const write = async <T>(
    request: FastifyRequest, reply: FastifyReply,
    action: (context: RequestContext) => Promise<T>, status = 200,
  ) => {
    const context = contextFor(request);
    reply.header("X-Trace-Id", context.traceId);
    const result = await action(context);
    if (result && typeof result === "object" && "version" in result) {
      reply.header("ETag", `"${(result as { version: number }).version}"`);
    }
    return reply.status(status).send(result);
  };

  const read = async <T>(request: FastifyRequest, reply: FastifyReply, action: (context: RequestContext) => Promise<T>) => {
    const context = contextFor(request);
    reply.header("X-Trace-Id", context.traceId);
    return action(context);
  };

  app.get("/api/v1/platform/snapshot", async (request, reply) => read(request, reply, (ctx) => service.getSnapshot(ctx)));
  app.get("/api/v1/platform/actor-permissions", async (request, reply) => {
    const query = actorPermissionsQuery.parse(request.query);
    return read(request, reply, (ctx) => service.getActorPermissions(ctx, query.loginName, query.activeRole));
  });

  app.get("/api/v1/platform/org-units", async (request, reply) => read(request, reply, (ctx) => service.listOrgUnits(ctx)));
  app.post("/api/v1/platform/org-units", async (request, reply) => write(request, reply, (ctx) => service.saveOrgUnit(ctx, orgUnitInput.parse(request.body)), 201));
  app.put("/api/v1/platform/org-units/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = orgUnitInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveOrgUnit(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/org-units/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteOrgUnit(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/resources", async (request, reply) => read(request, reply, (ctx) => service.listResources(ctx)));
  app.post("/api/v1/platform/resources", async (request, reply) => write(request, reply, (ctx) => service.saveResource(ctx, resourceInput.parse(request.body)), 201));
  app.put("/api/v1/platform/resources/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = resourceInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveResource(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/resources/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteResource(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/positions", async (request, reply) => read(request, reply, (ctx) => service.listPositions(ctx)));
  app.post("/api/v1/platform/positions", async (request, reply) => write(request, reply, (ctx) => service.savePosition(ctx, positionInput.parse(request.body)), 201));
  app.put("/api/v1/platform/positions/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = positionInput.parse(request.body);
    return write(request, reply, (ctx) => service.savePosition(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/positions/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deletePosition(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/employees", async (request, reply) => read(request, reply, (ctx) => service.listEmployees(ctx)));
  app.post("/api/v1/platform/employees", async (request, reply) => write(request, reply, (ctx) => service.saveEmployee(ctx, employeeInput.parse(request.body)), 201));
  app.put("/api/v1/platform/employees/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = employeeInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveEmployee(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/employees/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteEmployee(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/accounts", async (request, reply) => read(request, reply, (ctx) => service.listAccounts(ctx)));
  app.post("/api/v1/platform/accounts", async (request, reply) => write(request, reply, (ctx) => service.saveAccount(ctx, accountInput.parse(request.body)), 201));
  app.put("/api/v1/platform/accounts/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = accountInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveAccount(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/accounts/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteAccount(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/roles", async (request, reply) => read(request, reply, (ctx) => service.listRoles(ctx)));
  app.post("/api/v1/platform/roles", async (request, reply) => write(request, reply, (ctx) => service.saveRole(ctx, roleInput.parse(request.body)), 201));
  app.put("/api/v1/platform/roles/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = roleInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveRole(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/roles/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteRole(ctx, params.id));
    return reply.status(204).send();
  });
  app.put("/api/v1/platform/roles/:id/grants", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = roleGrantInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveRoleGrants(ctx, params.id, body.grants));
  });
  app.get("/api/v1/platform/roles/:id/grants", async (request, reply) => {
    const params = idParam.parse(request.params);
    return read(request, reply, (ctx) => service.listRoleGrants(ctx, params.id));
  });

  app.get("/api/v1/platform/adapters", async (request, reply) => read(request, reply, (ctx) => service.listAdapters(ctx)));
  app.post("/api/v1/platform/adapters", async (request, reply) => write(request, reply, (ctx) => service.saveAdapter(ctx, adapterInput.parse(request.body)), 201));
  app.put("/api/v1/platform/adapters/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = adapterInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveAdapter(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/adapters/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteAdapter(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/approval-rules", async (request, reply) => read(request, reply, (ctx) => service.listApprovalRules(ctx)));
  app.post("/api/v1/platform/approval-rules", async (request, reply) => write(request, reply, (ctx) => service.saveApprovalRule(ctx, approvalRuleInput.parse(request.body)), 201));
  app.put("/api/v1/platform/approval-rules/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = approvalRuleInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveApprovalRule(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/approval-rules/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteApprovalRule(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/dictionaries", async (request, reply) => read(request, reply, (ctx) => service.listDictionaries(ctx)));
  app.post("/api/v1/platform/dictionaries", async (request, reply) => write(request, reply, (ctx) => service.saveDictionary(ctx, dictionaryInput.parse(request.body)), 201));
  app.put("/api/v1/platform/dictionaries/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = dictionaryInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveDictionary(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/dictionaries/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteDictionary(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/parameters", async (request, reply) => read(request, reply, (ctx) => service.listParameters(ctx)));
  app.post("/api/v1/platform/parameters", async (request, reply) => write(request, reply, (ctx) => service.saveParameter(ctx, parameterInput.parse(request.body)), 201));
  app.put("/api/v1/platform/parameters/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    const body = parameterInput.parse(request.body);
    return write(request, reply, (ctx) => service.saveParameter(ctx, { ...body, id: params.id }));
  });
  app.delete("/api/v1/platform/parameters/:id", async (request, reply) => {
    const params = idParam.parse(request.params);
    await write(request, reply, (ctx) => service.deleteParameter(ctx, params.id));
    return reply.status(204).send();
  });

  app.get("/api/v1/platform/parameters/security", async (request, reply) => read(request, reply, (ctx) => service.getSecurityParameters(ctx)));

  app.get("/api/v1/platform/audit-logs", async (request, reply) => {
    const query = auditLogQuery.parse(request.query);
    return read(request, reply, (ctx) => service.listAuditLogs(ctx, query));
  });

  app.get("/api/v1/platform/capabilities", async (request, reply) => read(request, reply, (ctx) => service.listCapabilities(ctx)));
  app.post("/api/v1/platform/capabilities", async (request, reply) => write(request, reply, (ctx) => service.saveCapability(ctx, capabilityInput.parse(request.body))));

  app.post("/api/v1/platform/session-revocation", async (request, reply) => write(request, reply, (ctx) => service.revokeSession(ctx, sessionRevocationInput.parse(request.body)), 201));
}
