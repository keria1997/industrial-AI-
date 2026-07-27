import { randomUUID, scryptSync, randomBytes } from "node:crypto";
import { ProductionError } from "../../errors.js";
import type { RequestContext } from "../../types.js";
import type { PlatformStore } from "./store.js";
import type {
  AccountDto, AccountAuthType, AccountStatus, ActorPermissionsDto, ApprovalRuleDto, AuditLogDto,
  AuditLogFilter, AuditResult, CapabilityDto, DictionaryDto, EmployeeDto, EmployeeStatus,
  EnterpriseResourceDto, FieldMode, GrantEffect, OrgUnitDto, OrgUnitType, ParameterDto,
  ParameterEffectiveMode, ParameterValueType, PermissionAdapterDto, PermissionResourceDto,
  PlatformSnapshotDto, PositionDto, ResourceType, RoleDto, RoleGrantDto, SecurityParametersDto,
  SessionRevocation, TenantDto, TenantStatus,
} from "./types.js";

const now = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const workbenchRoleCodeMap: Record<string, string> = {
  "超级管理员": "TENANT_ADMIN",
  "系统管理员": "TENANT_ADMIN",
  "老板": "PRODUCTION_VIEWER",
  "计划员": "PRODUCTION_DIRECTOR",
  "车间": "PRODUCTION_WORKSHOP",
  "仓管": "WAREHOUSE_ADMIN",
  "采购": "PURCHASE_STAFF",
  "销售": "SALE_STAFF",
  "财务": "FINANCE_STAFF",
};

export class PlatformService {
  constructor(private readonly store: PlatformStore) {}

  private requirePermission(context: RequestContext, permission: string) {
    if (!context.permissions.has("*") && !context.permissions.has(permission)) {
      throw new ProductionError("PRODUCTION_403_PERMISSION_DENIED", `缺少操作权限：${permission}`, "请联系平台管理员授予对应平台权限");
    }
  }

  private requireExpectedVersion(context: RequestContext, currentVersion: number) {
    if (context.expectedVersion !== undefined && context.expectedVersion !== currentVersion) {
      throw new ProductionError("PRODUCTION_409_VERSION_CONFLICT", "数据已被其他用户更新", "请刷新数据后重新确认本次操作", {
        details: { expectedVersion: context.expectedVersion, currentVersion },
      });
    }
  }

  private notFound(label: string): never {
    throw new ProductionError("PRODUCTION_404_NOT_FOUND", `${label}不存在或不在当前数据范围内`, "请刷新列表并确认租户与数据权限");
  }

  private async audit(store: PlatformStore, context: RequestContext, action: string, module: string, target: string, result: AuditResult) {
    const log: AuditLogDto = {
      id: randomUUID(), tenantId: context.tenantId, time: now(), operator: context.actorId,
      module, action, target, result, traceId: context.traceId,
      ipAddress: context.ipAddress, userAgent: context.userAgent,
    };
    await store.addAuditLog(log);
  }

  private stripPasswordHash(account: AccountDto): AccountDto {
    return { ...account, passwordHash: undefined };
  }

  private collectOrgDescendants(orgUnits: OrgUnitDto[], rootIds: string[]): Set<string> {
    const result = new Set(rootIds);
    let changed = true;
    while (changed) {
      changed = false;
      for (const unit of orgUnits) {
        if (unit.parentId && result.has(unit.parentId) && !result.has(unit.id)) {
          result.add(unit.id);
          changed = true;
        }
      }
    }
    return result;
  }

  private async getActorRoleIds(tenantId: string, loginName: string, activeRole?: string): Promise<string[]> {
    const roles = await this.store.listRoles(tenantId);
    const mappedRoleCode = workbenchRoleCodeMap[activeRole ?? ""];
    const mappedRole = mappedRoleCode ? roles.find((r) => r.code === mappedRoleCode && r.status === "enabled") : undefined;
    if (mappedRole) return [mappedRole.id];

    const account = await this.store.getAccountByLoginName(tenantId, loginName);
    if (!account || account.status !== "enabled") return [];
    const employees = await this.store.listEmployees(tenantId);
    const employee = employees.find((e) => e.id === account.employeeId && e.status === "active");
    if (!employee) return [];
    const positions = await this.store.listPositions(tenantId);
    const position = positions.find((p) => p.id === employee.primaryPositionId && p.status === "enabled");
    const roleIds = Array.from(new Set([...(account.directRoleIds ?? []), ...(position?.defaultRoleIds ?? [])]));
    return roleIds.filter((id) => roles.some((r) => r.id === id && r.status === "enabled"));
  }

  private async isActorEnabled(tenantId: string, loginName: string): Promise<boolean> {
    const account = await this.store.getAccountByLoginName(tenantId, loginName);
    if (!account || account.status !== "enabled") return false;
    const employees = await this.store.listEmployees(tenantId);
    return employees.some((e) => e.id === account.employeeId && e.status === "active");
  }

  private async listAllRoleGrants(tenantId: string, roleIds: string[]): Promise<RoleGrantDto[]> {
    const result: RoleGrantDto[] = [];
    for (const roleId of roleIds) {
      const grants = await this.store.listRoleGrants(tenantId, roleId);
      result.push(...grants);
    }
    return result;
  }

  private async getAuthorizedFactoryOrgIds(tenantId: string, loginName: string, activeRole?: string): Promise<string[]> {
    const orgUnits = await this.store.listOrgUnits(tenantId);
    const roles = await this.store.listRoles(tenantId);
    const resources = await this.store.listResources(tenantId);
    const enabledFactories = orgUnits.filter((o) => o.type === "factory" && o.status === "enabled");
    const roleIds = await this.getActorRoleIds(tenantId, loginName, activeRole);
    const activeRoles = roles.filter((r) => roleIds.includes(r.id) && r.status === "enabled");
    if (activeRoles.some((r) => r.dataScope === "tenant_all")) return enabledFactories.map((f) => f.id);

    const allowed = new Set<string>();
    for (const role of activeRoles) {
      if (role.dataScope === "factory_set") role.scopeValues.forEach((v) => allowed.add(v));
      if (role.dataScope === "warehouse_set") {
        resources.filter((r) => role.scopeValues.includes(r.id) && r.status === "enabled").forEach((r) => {
          if (r.factoryOrgId) allowed.add(r.factoryOrgId);
        });
      }
      if (role.dataScope === "org_tree") {
        const descendants = this.collectOrgDescendants(orgUnits, role.scopeValues);
        enabledFactories.filter((f) => descendants.has(f.id)).forEach((f) => allowed.add(f.id));
      }
    }
    return enabledFactories.filter((f) => allowed.has(f.id)).map((f) => f.id);
  }

  async getSnapshot(context: RequestContext): Promise<PlatformSnapshotDto> {
    this.requirePermission(context, "platform.permission.preview");
    const tenantId = context.tenantId;
    const tenant = await this.store.getTenant(tenantId);
    if (!tenant) this.notFound("租户");
    const [capabilities, orgUnits, resources, positions, employees, accounts, roles, permissions, adapters, approvalRules, dictionaries, parameters, auditLogs] = await Promise.all([
      this.store.listCapabilities(tenantId),
      this.store.listOrgUnits(tenantId),
      this.store.listResources(tenantId),
      this.store.listPositions(tenantId),
      this.store.listEmployees(tenantId),
      this.store.listAccounts(tenantId),
      this.store.listRoles(tenantId),
      this.store.listPermissions(tenantId),
      this.store.listAdapters(tenantId),
      this.store.listApprovalRules(tenantId),
      this.store.listDictionaries(tenantId),
      this.store.listParameters(tenantId),
      this.store.listAuditLogs(tenantId),
    ]);
    const roleIds = roles.map((r) => r.id);
    const roleGrants: RoleGrantDto[] = [];
    for (const roleId of roleIds) {
      const grants = await this.store.listRoleGrants(tenantId, roleId);
      roleGrants.push(...grants);
    }
    return {
      tenant, capabilities, orgUnits, resources, positions, employees,
      accounts: accounts.map((a) => this.stripPasswordHash(a)),
      roles, permissions, roleGrants, adapters, approvalRules, dictionaries, parameters, auditLogs,
    };
  }

  async getActorPermissions(context: RequestContext, loginName?: string, activeRole?: string): Promise<ActorPermissionsDto> {
    this.requirePermission(context, "platform.actor.view");
    const tenantId = context.tenantId;
    const account = loginName ?? context.actorId;
    const enabled = await this.isActorEnabled(tenantId, account);
    const roleIds = enabled ? await this.getActorRoleIds(tenantId, account, activeRole) : [];
    const roles = await this.store.listRoles(tenantId);
    const permissions = await this.store.listPermissions(tenantId);
    const allGrants = await this.listAllRoleGrants(tenantId, roleIds);
    const activeRoles = roles.filter((r) => roleIds.includes(r.id) && r.status === "enabled");

    const permissionCodes: string[] = [];
    const deniedPermissionCodes: string[] = [];
    const fieldModes: Record<string, FieldMode> = {};

    for (const perm of permissions) {
      const grants = allGrants.filter((g) => g.permissionId === perm.id);
      if (grants.some((g) => g.effect === "deny")) {
        deniedPermissionCodes.push(perm.code);
        const denyGrant = grants.find((g) => g.effect === "deny" && g.fieldMode);
        if (denyGrant?.fieldMode) fieldModes[perm.code] = denyGrant.fieldMode;
        continue;
      }
      if (grants.some((g) => g.effect === "allow")) {
        permissionCodes.push(perm.code);
        const allowGrant = grants.find((g) => g.effect === "allow" && g.fieldMode);
        if (allowGrant?.fieldMode) fieldModes[perm.code] = allowGrant.fieldMode;
      }
    }

    const authorizedFactoryOrgIds = enabled ? await this.getAuthorizedFactoryOrgIds(tenantId, account, activeRole) : [];
    const orgUnits = await this.store.listOrgUnits(tenantId);
    const authorizedFactoryCodes = orgUnits
      .filter((o) => o.type === "factory" && o.status === "enabled" && authorizedFactoryOrgIds.includes(o.id))
      .map((o) => o.code);

    return {
      loginName: account,
      activeRole: activeRole ?? null,
      enabled,
      roleIds,
      roleCodes: activeRoles.map((r) => r.code),
      permissionCodes,
      deniedPermissionCodes,
      fieldModes,
      authorizedFactoryOrgIds,
      authorizedFactoryCodes,
      dataScopes: activeRoles.map((r) => ({ roleCode: r.code, dataScope: r.dataScope, scopeValues: r.scopeValues })),
    };
  }

  async resolvePermissions(context: RequestContext, loginName: string): Promise<string[]> {
    const tenantId = context.tenantId;
    if (!(await this.isActorEnabled(tenantId, loginName))) return [];
    const roleIds = await this.getActorRoleIds(tenantId, loginName);
    const permissions = await this.store.listPermissions(tenantId);
    const allGrants = await this.listAllRoleGrants(tenantId, roleIds);
    const result: string[] = [];
    for (const perm of permissions) {
      const grants = allGrants.filter((g) => g.permissionId === perm.id);
      if (grants.some((g) => g.effect === "deny")) continue;
      if (grants.some((g) => g.effect === "allow")) result.push(perm.code);
    }
    return result;
  }

  async listOrgUnits(context: RequestContext): Promise<OrgUnitDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listOrgUnits(context.tenantId);
  }

  async saveOrgUnit(context: RequestContext, input: {
    id?: string; code: string; name: string; type: OrgUnitType; parentId: string | null;
    managerEmployeeId: string | null; status: "enabled" | "disabled";
  }): Promise<OrgUnitDto> {
    this.requirePermission(context, "platform.org.manage");
    return this.store.transaction(async (store) => {
      const existing = input.id ? await store.getOrgUnit(context.tenantId, input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: OrgUnitDto = {
          ...existing, code: input.code, name: input.name, type: input.type, parentId: input.parentId,
          managerEmployeeId: input.managerEmployeeId, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveOrgUnit(updated);
        await this.audit(store, context, "修改组织架构", "平台管理", `${updated.code} / ${updated.name}`, "success");
        return updated;
      }
      const created: OrgUnitDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, code: input.code, name: input.name,
        type: input.type, parentId: input.parentId, managerEmployeeId: input.managerEmployeeId,
        status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveOrgUnit(created);
      await this.audit(store, context, "新增组织架构", "平台管理", `${created.code} / ${created.name}`, "success");
      return created;
    });
  }

  async deleteOrgUnit(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.org.manage");
    await this.store.transaction(async (store) => {
      const existing = await store.getOrgUnit(context.tenantId, id);
      if (!existing) this.notFound("组织架构");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteOrgUnit(context.tenantId, id);
      await this.audit(store, context, "删除组织架构", "平台管理", `${existing.code} / ${existing.name}`, "success");
    });
  }

  async listResources(context: RequestContext): Promise<EnterpriseResourceDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listResources(context.tenantId);
  }

  async saveResource(context: RequestContext, input: {
    id?: string; code: string; name: string; type: ResourceType; ownerOrgId: string;
    factoryOrgId: string | null; workshopOrgId: string | null; managerEmployeeId: string | null;
    specification: string; status: "enabled" | "disabled";
  }): Promise<EnterpriseResourceDto> {
    this.requirePermission(context, "platform.resource.manage");
    return this.store.transaction(async (store) => {
      const resources = await store.listResources(context.tenantId);
      const existing = input.id ? resources.find((r) => r.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: EnterpriseResourceDto = {
          ...existing, code: input.code, name: input.name, type: input.type, ownerOrgId: input.ownerOrgId,
          factoryOrgId: input.factoryOrgId, workshopOrgId: input.workshopOrgId,
          managerEmployeeId: input.managerEmployeeId, specification: input.specification, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveResource(updated);
        await this.audit(store, context, "修改企业资源", "平台管理", `${updated.code} / ${updated.name}`, "success");
        return updated;
      }
      const created: EnterpriseResourceDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, code: input.code, name: input.name,
        type: input.type, ownerOrgId: input.ownerOrgId, factoryOrgId: input.factoryOrgId,
        workshopOrgId: input.workshopOrgId, managerEmployeeId: input.managerEmployeeId,
        specification: input.specification, status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveResource(created);
      await this.audit(store, context, "新增企业资源", "平台管理", `${created.code} / ${created.name}`, "success");
      return created;
    });
  }

  async deleteResource(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.resource.manage");
    await this.store.transaction(async (store) => {
      const resources = await store.listResources(context.tenantId);
      const existing = resources.find((r) => r.id === id);
      if (!existing) this.notFound("企业资源");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteResource(context.tenantId, id);
      await this.audit(store, context, "删除企业资源", "平台管理", `${existing.code} / ${existing.name}`, "success");
    });
  }

  async listPositions(context: RequestContext): Promise<PositionDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listPositions(context.tenantId);
  }

  async savePosition(context: RequestContext, input: {
    id?: string; code: string; name: string; orgId: string; defaultRoleIds: string[];
    resourceIds: string[]; status: "enabled" | "disabled";
  }): Promise<PositionDto> {
    this.requirePermission(context, "platform.position.manage");
    return this.store.transaction(async (store) => {
      const positions = await store.listPositions(context.tenantId);
      const existing = input.id ? positions.find((p) => p.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: PositionDto = {
          ...existing, code: input.code, name: input.name, orgId: input.orgId,
          defaultRoleIds: input.defaultRoleIds, resourceIds: input.resourceIds, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.savePosition(updated);
        await this.audit(store, context, "修改岗位", "平台管理", `${updated.code} / ${updated.name}`, "success");
        return updated;
      }
      const created: PositionDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, code: input.code, name: input.name,
        orgId: input.orgId, defaultRoleIds: input.defaultRoleIds, resourceIds: input.resourceIds,
        status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.savePosition(created);
      await this.audit(store, context, "新增岗位", "平台管理", `${created.code} / ${created.name}`, "success");
      return created;
    });
  }

  async deletePosition(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.position.manage");
    await this.store.transaction(async (store) => {
      const positions = await store.listPositions(context.tenantId);
      const existing = positions.find((p) => p.id === id);
      if (!existing) this.notFound("岗位");
      this.requireExpectedVersion(context, existing.version);
      await store.deletePosition(context.tenantId, id);
      await this.audit(store, context, "删除岗位", "平台管理", `${existing.code} / ${existing.name}`, "success");
    });
  }

  async listEmployees(context: RequestContext): Promise<EmployeeDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listEmployees(context.tenantId);
  }

  async saveEmployee(context: RequestContext, input: {
    id?: string; employeeNo: string; name: string; primaryOrgId: string; primaryPositionId: string;
    mobile: string; email: string; status: EmployeeStatus;
  }): Promise<EmployeeDto> {
    this.requirePermission(context, "platform.employee.manage");
    return this.store.transaction(async (store) => {
      const employees = await store.listEmployees(context.tenantId);
      const existing = input.id ? employees.find((e) => e.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: EmployeeDto = {
          ...existing, employeeNo: input.employeeNo, name: input.name, primaryOrgId: input.primaryOrgId,
          primaryPositionId: input.primaryPositionId, mobile: input.mobile, email: input.email, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveEmployee(updated);
        await this.audit(store, context, "修改员工", "平台管理", `${updated.employeeNo} / ${updated.name}`, "success");
        return updated;
      }
      const created: EmployeeDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, employeeNo: input.employeeNo, name: input.name,
        primaryOrgId: input.primaryOrgId, primaryPositionId: input.primaryPositionId, mobile: input.mobile,
        email: input.email, status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveEmployee(created);
      await this.audit(store, context, "新增员工", "平台管理", `${created.employeeNo} / ${created.name}`, "success");
      return created;
    });
  }

  async deleteEmployee(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.employee.manage");
    await this.store.transaction(async (store) => {
      const employees = await store.listEmployees(context.tenantId);
      const existing = employees.find((e) => e.id === id);
      if (!existing) this.notFound("员工");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteEmployee(context.tenantId, id);
      await this.audit(store, context, "删除员工", "平台管理", `${existing.employeeNo} / ${existing.name}`, "success");
    });
  }

  async listAccounts(context: RequestContext): Promise<AccountDto[]> {
    this.requirePermission(context, "platform.org.view");
    const accounts = await this.store.listAccounts(context.tenantId);
    return accounts.map((a) => this.stripPasswordHash(a));
  }

  async saveAccount(context: RequestContext, input: {
    id?: string; loginName: string; employeeId: string; authType: AccountAuthType; status: AccountStatus;
    directRoleIds: string[]; password?: string;
  }): Promise<AccountDto> {
    this.requirePermission(context, "platform.account.manage");
    return this.store.transaction(async (store) => {
      const accounts = await store.listAccounts(context.tenantId);
      const existing = input.id ? accounts.find((a) => a.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: AccountDto = {
          ...existing, loginName: input.loginName, employeeId: input.employeeId, authType: input.authType,
          status: input.status, directRoleIds: input.directRoleIds,
          passwordHash: input.password ? hashPassword(input.password) : existing.passwordHash,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveAccount(updated);
        await this.audit(store, context, "修改账号", "平台管理", updated.loginName, "success");
        return this.stripPasswordHash(updated);
      }
      const created: AccountDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, loginName: input.loginName,
        employeeId: input.employeeId, authType: input.authType, status: input.status,
        directRoleIds: input.directRoleIds,
        passwordHash: input.password ? hashPassword(input.password) : undefined,
        lastLoginAt: "", version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveAccount(created);
      await this.audit(store, context, "新增账号", "平台管理", created.loginName, "success");
      return this.stripPasswordHash(created);
    });
  }

  async deleteAccount(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.account.manage");
    await this.store.transaction(async (store) => {
      const accounts = await store.listAccounts(context.tenantId);
      const existing = accounts.find((a) => a.id === id);
      if (!existing) this.notFound("账号");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteAccount(context.tenantId, id);
      await this.audit(store, context, "删除账号", "平台管理", existing.loginName, "success");
    });
  }

  async listRoles(context: RequestContext): Promise<RoleDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listRoles(context.tenantId);
  }

  async saveRole(context: RequestContext, input: {
    id?: string; code: string; name: string; description: string; dataScope: string;
    scopeValues: string[]; status: "enabled" | "disabled";
  }): Promise<RoleDto> {
    this.requirePermission(context, "platform.role.manage");
    return this.store.transaction(async (store) => {
      const roles = await store.listRoles(context.tenantId);
      const existing = input.id ? roles.find((r) => r.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: RoleDto = {
          ...existing, code: input.code, name: input.name, description: input.description,
          dataScope: input.dataScope, scopeValues: input.scopeValues, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveRole(updated);
        await this.audit(store, context, "修改角色", "平台管理", `${updated.code} / ${updated.name}`, "success");
        return updated;
      }
      const created: RoleDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, code: input.code, name: input.name,
        description: input.description, dataScope: input.dataScope, scopeValues: input.scopeValues,
        status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveRole(created);
      await this.audit(store, context, "新增角色", "平台管理", `${created.code} / ${created.name}`, "success");
      return created;
    });
  }

  async deleteRole(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.role.manage");
    await this.store.transaction(async (store) => {
      const roles = await store.listRoles(context.tenantId);
      const existing = roles.find((r) => r.id === id);
      if (!existing) this.notFound("角色");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteRole(context.tenantId, id);
      await store.saveRoleGrants(context.tenantId, id, []);
      await this.audit(store, context, "删除角色", "平台管理", `${existing.code} / ${existing.name}`, "success");
    });
  }

  async listRoleGrants(context: RequestContext, roleId: string): Promise<RoleGrantDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listRoleGrants(context.tenantId, roleId);
  }

  async saveRoleGrants(context: RequestContext, roleId: string, grants: Array<{
    permissionId: string; effect: GrantEffect; fieldMode?: FieldMode;
  }>): Promise<RoleGrantDto[]> {
    this.requirePermission(context, "platform.role.grant");
    return this.store.transaction(async (store) => {
      const roles = await store.listRoles(context.tenantId);
      const role = roles.find((r) => r.id === roleId);
      if (!role) this.notFound("角色");
      const existingGrants = await store.listRoleGrants(context.tenantId, roleId);
      const grantDtos: RoleGrantDto[] = grants.map((g) => {
        const prev = existingGrants.find((eg) => eg.permissionId === g.permissionId);
        return {
          roleId, tenantId: context.tenantId, permissionId: g.permissionId, effect: g.effect,
          fieldMode: g.fieldMode, version: (prev?.version ?? 0) + 1, updatedAt: now(),
        };
      });
      await store.saveRoleGrants(context.tenantId, roleId, grantDtos);
      await this.audit(store, context, "修改角色授权", "平台管理", `${role!.code} / ${role!.name}`, "success");
      return grantDtos;
    });
  }

  async listAdapters(context: RequestContext): Promise<PermissionAdapterDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listAdapters(context.tenantId);
  }

  async saveAdapter(context: RequestContext, input: {
    id?: string; permissionCode: string; permissionName: string; module: string;
    legacyRoleCode: string; legacyScope: string; status: "draft" | "pending_sync" | "synced" | "conflict" | "failed" | "disabled";
    lastSyncAt: string | null; errorMessage: string;
  }): Promise<PermissionAdapterDto> {
    this.requirePermission(context, "platform.adapter.manage");
    return this.store.transaction(async (store) => {
      const adapters = await store.listAdapters(context.tenantId);
      const existing = input.id ? adapters.find((a) => a.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: PermissionAdapterDto = {
          ...existing, permissionCode: input.permissionCode, permissionName: input.permissionName,
          module: input.module, legacyRoleCode: input.legacyRoleCode, legacyScope: input.legacyScope,
          status: input.status, lastSyncAt: input.lastSyncAt, errorMessage: input.errorMessage,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveAdapter(updated);
        await this.audit(store, context, "修改权限适配器", "平台管理", `${updated.permissionCode}`, "success");
        return updated;
      }
      const created: PermissionAdapterDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, permissionCode: input.permissionCode,
        permissionName: input.permissionName, module: input.module, legacyRoleCode: input.legacyRoleCode,
        legacyScope: input.legacyScope, status: input.status, lastSyncAt: input.lastSyncAt,
        errorMessage: input.errorMessage, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveAdapter(created);
      await this.audit(store, context, "新增权限适配器", "平台管理", `${created.permissionCode}`, "success");
      return created;
    });
  }

  async deleteAdapter(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.adapter.manage");
    await this.store.transaction(async (store) => {
      const adapters = await store.listAdapters(context.tenantId);
      const existing = adapters.find((a) => a.id === id);
      if (!existing) this.notFound("权限适配器");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteAdapter(context.tenantId, id);
      await this.audit(store, context, "删除权限适配器", "平台管理", existing.permissionCode, "success");
    });
  }

  async listApprovalRules(context: RequestContext): Promise<ApprovalRuleDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listApprovalRules(context.tenantId);
  }

  async saveApprovalRule(context: RequestContext, input: {
    id?: string; module: string; documentType: string;
    resolver: "by_role" | "by_position" | "by_org_manager"; resolverValue: string;
    fallback: "block" | "tenant_admin" | "unassigned_pool"; status: "enabled" | "disabled";
  }): Promise<ApprovalRuleDto> {
    this.requirePermission(context, "platform.approval.manage");
    return this.store.transaction(async (store) => {
      const rules = await store.listApprovalRules(context.tenantId);
      const existing = input.id ? rules.find((r) => r.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: ApprovalRuleDto = {
          ...existing, module: input.module, documentType: input.documentType, resolver: input.resolver,
          resolverValue: input.resolverValue, fallback: input.fallback, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveApprovalRule(updated);
        await this.audit(store, context, "修改审批规则", "平台管理", `${updated.module} / ${updated.documentType}`, "success");
        return updated;
      }
      const created: ApprovalRuleDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, module: input.module,
        documentType: input.documentType, resolver: input.resolver, resolverValue: input.resolverValue,
        fallback: input.fallback, status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveApprovalRule(created);
      await this.audit(store, context, "新增审批规则", "平台管理", `${created.module} / ${created.documentType}`, "success");
      return created;
    });
  }

  async deleteApprovalRule(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.approval.manage");
    await this.store.transaction(async (store) => {
      const rules = await store.listApprovalRules(context.tenantId);
      const existing = rules.find((r) => r.id === id);
      if (!existing) this.notFound("审批规则");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteApprovalRule(context.tenantId, id);
      await this.audit(store, context, "删除审批规则", "平台管理", `${existing.module} / ${existing.documentType}`, "success");
    });
  }

  async listDictionaries(context: RequestContext): Promise<DictionaryDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listDictionaries(context.tenantId);
  }

  async saveDictionary(context: RequestContext, input: {
    id?: string; category: string; code: string; name: string; status: "enabled" | "disabled";
  }): Promise<DictionaryDto> {
    this.requirePermission(context, "platform.dictionary.manage");
    return this.store.transaction(async (store) => {
      const dicts = await store.listDictionaries(context.tenantId);
      const existing = input.id ? dicts.find((d) => d.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: DictionaryDto = {
          ...existing, category: input.category, code: input.code, name: input.name, status: input.status,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveDictionary(updated);
        await this.audit(store, context, "修改字典", "平台管理", `${updated.category} / ${updated.code}`, "success");
        return updated;
      }
      const created: DictionaryDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, category: input.category, code: input.code,
        name: input.name, status: input.status, version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveDictionary(created);
      await this.audit(store, context, "新增字典", "平台管理", `${created.category} / ${created.code}`, "success");
      return created;
    });
  }

  async deleteDictionary(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.dictionary.manage");
    await this.store.transaction(async (store) => {
      const dicts = await store.listDictionaries(context.tenantId);
      const existing = dicts.find((d) => d.id === id);
      if (!existing) this.notFound("字典");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteDictionary(context.tenantId, id);
      await this.audit(store, context, "删除字典", "平台管理", `${existing.category} / ${existing.code}`, "success");
    });
  }

  async listParameters(context: RequestContext): Promise<ParameterDto[]> {
    this.requirePermission(context, "platform.security.view");
    return this.store.listParameters(context.tenantId);
  }

  async saveParameter(context: RequestContext, input: {
    id?: string; code: string; name: string; value: string;
    valueType: ParameterValueType; effectiveMode: ParameterEffectiveMode;
  }): Promise<ParameterDto> {
    this.requirePermission(context, "platform.parameter.manage");
    return this.store.transaction(async (store) => {
      const params = await store.listParameters(context.tenantId);
      const existing = input.id ? params.find((p) => p.id === input.id) : undefined;
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: ParameterDto = {
          ...existing, code: input.code, name: input.name, value: input.value,
          valueType: input.valueType, effectiveMode: input.effectiveMode,
          version: existing.version + 1, updatedAt: now(),
        };
        await store.saveParameter(updated);
        await this.audit(store, context, "修改系统参数", "平台管理", `${updated.code}`, "success");
        return updated;
      }
      const created: ParameterDto = {
        id: input.id ?? randomUUID(), tenantId: context.tenantId, code: input.code, name: input.name,
        value: input.value, valueType: input.valueType, effectiveMode: input.effectiveMode,
        version: 1, createdAt: now(), updatedAt: now(),
      };
      await store.saveParameter(created);
      await this.audit(store, context, "新增系统参数", "平台管理", `${created.code}`, "success");
      return created;
    });
  }

  async deleteParameter(context: RequestContext, id: string): Promise<void> {
    this.requirePermission(context, "platform.parameter.manage");
    await this.store.transaction(async (store) => {
      const params = await store.listParameters(context.tenantId);
      const existing = params.find((p) => p.id === id);
      if (!existing) this.notFound("系统参数");
      this.requireExpectedVersion(context, existing.version);
      await store.deleteParameter(context.tenantId, id);
      await this.audit(store, context, "删除系统参数", "平台管理", existing.code, "success");
    });
  }

  async listAuditLogs(context: RequestContext, filter?: AuditLogFilter): Promise<AuditLogDto[]> {
    this.requirePermission(context, "platform.audit.view");
    return this.store.listAuditLogs(context.tenantId, filter);
  }

  async listCapabilities(context: RequestContext): Promise<CapabilityDto[]> {
    this.requirePermission(context, "platform.org.view");
    return this.store.listCapabilities(context.tenantId);
  }

  async saveCapability(context: RequestContext, input: { code: string; enabled: boolean }): Promise<CapabilityDto> {
    this.requirePermission(context, "platform.capability.manage");
    return this.store.transaction(async (store) => {
      const capabilities = await store.listCapabilities(context.tenantId);
      const existing = capabilities.find((c) => c.code === input.code);
      if (!existing) this.notFound("能力");
      const updated: CapabilityDto = {
        ...existing, enabled: input.enabled, version: existing.version + 1, updatedAt: now(),
      };
      await store.saveCapability(updated);
      await this.audit(store, context, input.enabled ? "启用能力" : "禁用能力", "平台管理", `${updated.code} / ${updated.name}`, "success");
      return updated;
    });
  }

  async revokeSession(context: RequestContext, input: { account: string; jti: string; reason: string }): Promise<SessionRevocation> {
    this.requirePermission(context, "platform.session.revoke");
    return this.store.transaction(async (store) => {
      const revocation: SessionRevocation = {
        tenantId: context.tenantId, account: input.account, jti: input.jti,
        revokedAt: now(), revokedBy: context.actorId, reason: input.reason,
      };
      await store.addSessionRevocation(context.tenantId, revocation);
      await this.audit(store, context, "撤销会话", "平台管理", `${input.account} / ${input.jti}`, "success");
      return revocation;
    });
  }

  async getSecurityParameters(context: RequestContext): Promise<SecurityParametersDto> {
    this.requirePermission(context, "platform.security.view");
    const params = await this.store.listParameters(context.tenantId);
    const get = (code: string) => params.find((p) => p.code === code)?.value;
    return {
      loginMaxFailures: Number(get("security.login.maxFailures") ?? "5"),
      sessionHours: Number(get("security.session.hours") ?? "8"),
      passwordMinLength: Number(get("security.password.minLength") ?? "8"),
      passwordRequireUppercase: get("security.password.requireUppercase") === "true",
      passwordRequireLowercase: get("security.password.requireLowercase") === "true",
      passwordRequireDigit: get("security.password.requireDigit") === "true",
      passwordRequireSpecial: get("security.password.requireSpecial") === "true",
    };
  }

  async getTenant(context: RequestContext): Promise<TenantDto> {
    const tenant = await this.store.getTenant(context.tenantId);
    if (!tenant) this.notFound("租户");
    return tenant;
  }

  async saveTenant(context: RequestContext, input: {
    id?: string; code: string; name: string; edition: string; status: TenantStatus;
    bootstrapOwnerAccountId: string; formalAdminAccountId: string; expireAt: string;
  }): Promise<TenantDto> {
    this.requirePermission(context, "platform.org.manage");
    return this.store.transaction(async (store) => {
      const existing = await store.getTenant(context.tenantId);
      if (existing) {
        this.requireExpectedVersion(context, existing.version);
        const updated: TenantDto = {
          ...existing, code: input.code, name: input.name, edition: input.edition, status: input.status,
          bootstrapOwnerAccountId: input.bootstrapOwnerAccountId, formalAdminAccountId: input.formalAdminAccountId,
          expireAt: input.expireAt, version: existing.version + 1, updatedAt: now(),
        };
        await store.saveTenant(updated);
        await this.audit(store, context, "修改租户信息", "平台管理", `${updated.code} / ${updated.name}`, "success");
        return updated;
      }
      const created: TenantDto = {
        id: input.id ?? context.tenantId, code: input.code, name: input.name, edition: input.edition,
        status: input.status, bootstrapOwnerAccountId: input.bootstrapOwnerAccountId,
        formalAdminAccountId: input.formalAdminAccountId, expireAt: input.expireAt,
        version: 1, updatedAt: now(),
      };
      await store.saveTenant(created);
      await this.audit(store, context, "新增租户", "平台管理", `${created.code} / ${created.name}`, "success");
      return created;
    });
  }
}
