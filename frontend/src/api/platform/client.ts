import { apiRequest, type ApiContext, type ApiError } from "../client";

export type { ApiContext, ApiError };

// ===== 基础枚举与公共类型 =====

export type PlatformStatus = "enabled" | "disabled";

export type OrgUnitType = "company" | "department" | "factory" | "workshop";

export type ResourceType = "line" | "warehouse" | "work_center";

export type EmployeeStatus = "active" | "transferring" | "leave" | "resigned";

export type AccountAuthType = "password" | "sso" | "legacy_erp";

export type AccountStatus = "pending_activation" | "enabled" | "locked" | "disabled";

export type PermissionType =
  | "menu" | "page" | "button" | "api" | "field" | "export" | "ai";

export type PermissionRisk = "normal" | "sensitive" | "critical";

export type GrantEffect = "allow" | "deny";

export type FieldMode = "visible" | "hidden" | "masked" | "readonly" | "export_denied";

export type AdapterStatus = "draft" | "pending_sync" | "synced" | "conflict" | "failed" | "disabled";

export type ApprovalResolver = "by_role" | "by_position" | "by_org_manager";

export type ApprovalFallback = "block" | "tenant_admin" | "unassigned_pool";

export type AuditResult = "success" | "failed" | "denied";

export type ParameterValueType = "integer" | "boolean" | "text";

export type ParameterEffectiveMode = "immediate" | "next_login";

export type TenantStatus =
  | "init_created" | "init_org_ready" | "init_permission_ready"
  | "running" | "disabled" | "expired" | "init_blocked";

// ===== DTO 类型定义（与后端 types.ts / platformSeed 对应）=====

export type TenantDto = {
  id: string;
  code: string;
  name: string;
  edition: string;
  status: TenantStatus;
  bootstrapOwnerAccountId: string;
  formalAdminAccountId: string;
  expireAt: string;
  version: number;
  updatedAt: string;
};

export type CapabilityDto = {
  code: string;
  name: string;
  enabled: boolean;
  quota: string;
  used: string;
  version: number;
  updatedAt: string;
};

export type OrgUnitDto = {
  id: string;
  code: string;
  name: string;
  type: OrgUnitType;
  parentId: string | null;
  managerEmployeeId: string | null;
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EnterpriseResourceDto = {
  id: string;
  code: string;
  name: string;
  type: ResourceType;
  ownerOrgId: string;
  factoryOrgId: string | null;
  workshopOrgId: string | null;
  managerEmployeeId: string | null;
  specification: string;
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PositionDto = {
  id: string;
  code: string;
  name: string;
  orgId: string;
  defaultRoleIds: string[];
  resourceIds: string[];
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDto = {
  id: string;
  employeeNo: string;
  name: string;
  primaryOrgId: string;
  primaryPositionId: string;
  mobile: string;
  email: string;
  status: EmployeeStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AccountDto = {
  id: string;
  loginName: string;
  employeeId: string;
  authType: AccountAuthType;
  status: AccountStatus;
  directRoleIds: string[];
  lastLoginAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleDto = {
  id: string;
  code: string;
  name: string;
  description: string;
  dataScope: string;
  scopeValues: string[];
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type PermissionResourceDto = {
  id: string;
  code: string;
  name: string;
  module: string;
  type: PermissionType;
  risk: PermissionRisk;
  version: number;
  updatedAt: string;
};

export type RoleGrantDto = {
  roleId: string;
  permissionId: string;
  effect: GrantEffect;
  fieldMode?: FieldMode;
  version: number;
  updatedAt: string;
};

export type PermissionAdapterDto = {
  id: string;
  permissionCode: string;
  permissionName: string;
  module: string;
  legacyRoleCode: string;
  legacyScope: string;
  status: AdapterStatus;
  lastSyncAt: string | null;
  errorMessage: string;
  version: number;
  updatedAt: string;
};

export type ApprovalRuleDto = {
  id: string;
  module: string;
  documentType: string;
  resolver: ApprovalResolver;
  resolverValue: string;
  fallback: ApprovalFallback;
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DictionaryDto = {
  id: string;
  category: string;
  code: string;
  name: string;
  status: PlatformStatus;
  version: number;
  updatedAt: string;
};

export type PlatformParameterDto = {
  id: string;
  code: string;
  name: string;
  value: string;
  valueType?: ParameterValueType;
  effectiveMode: ParameterEffectiveMode;
  version: number;
  updatedAt: string;
};

export type AuditRecordDto = {
  id: string;
  time: string;
  operator: string;
  module: string;
  action: string;
  target: string;
  result: AuditResult;
  traceId: string;
};

// ===== 聚合快照与权限预览 DTO =====

export type PlatformSnapshotDto = {
  tenant: TenantDto;
  capabilities: CapabilityDto[];
  orgUnits: OrgUnitDto[];
  resources: EnterpriseResourceDto[];
  positions: PositionDto[];
  employees: EmployeeDto[];
  accounts: AccountDto[];
  roles: RoleDto[];
  permissions: PermissionResourceDto[];
  roleGrants: RoleGrantDto[];
  adapters: PermissionAdapterDto[];
  approvalRules: ApprovalRuleDto[];
  dictionaries: DictionaryDto[];
  parameters: PlatformParameterDto[];
  audits: AuditRecordDto[];
  version: number;
  updatedAt: string;
};

export type ActorRoleSummaryDto = {
  id: string;
  code: string;
  name: string;
  dataScope: string;
  scopeValues: string[];
};

export type ActorFieldPermissionDto = {
  permissionCode: string;
  fieldMode: FieldMode;
};

export type ActorPermissionsDto = {
  loginName: string;
  enabled: boolean;
  roleIds: string[];
  roles: ActorRoleSummaryDto[];
  permissionCodes: string[];
  fieldPermissions: ActorFieldPermissionDto[];
  authorizedFactoryOrgIds: string[];
  authorizedFactoryCodes: string[];
  permissionVersion: string;
};

// ===== 安全参数 DTO =====

export type SecurityParametersDto = {
  loginMaxFailures: number;
  sessionHours: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
  passwordExpiryDays: number;
  passwordHistoryCount: number;
  approvalTimeoutHours: number;
  effectiveMode: ParameterEffectiveMode;
  version: number;
  updatedAt: string;
};

// ===== 查询与分页响应 =====

export type AuditQuery = {
  module?: string;
  result?: AuditResult;
  operator?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
};

export type PageResult<T> = {
  items: T[];
  total: number;
};

// ===== 幂等键生成 =====

const operationKey = (scope: string) => `${scope}:${crypto.randomUUID()}`;

// ===== API 客户端对象 =====

export const platformApi = {
  selfProvision: (context: ApiContext) =>
    apiRequest<{ created: boolean; tenantId: string }>("/api/v1/platform/tenants/self-provision", context, { method: "POST" }),
  // ---- 平台快照与权限预览 ----
  getSnapshot: async (context: ApiContext): Promise<PlatformSnapshotDto> => {
    const value = await apiRequest<PlatformSnapshotDto & { auditLogs?: AuditRecordDto[] }>("/api/v1/platform/snapshot", context);
    return { ...value, audits: value.audits || value.auditLogs || [] };
  },

  getActorPermissions: (context: ApiContext, loginName: string) =>
    apiRequest<ActorPermissionsDto>(
      `/api/v1/platform/actor-permissions?loginName=${encodeURIComponent(loginName)}`,
      context,
    ),

  // ---- 租户信息 ----
  getTenant: (context: ApiContext) =>
    apiRequest<TenantDto>("/api/v1/platform/tenant", context),

  updateTenant: (context: ApiContext, data: Partial<TenantDto> & { version: number }) =>
    apiRequest<TenantDto>("/api/v1/platform/tenant", context, {
      method: "PUT",
      body: JSON.stringify(data),
      expectedVersion: data.version,
      idempotencyKey: operationKey(`tenant-update:${context.tenantId}`),
    }),

  // ---- 应用能力 ----
  listCapabilities: (context: ApiContext) =>
    apiRequest<CapabilityDto[]>("/api/v1/platform/capabilities", context),

  updateCapability: (context: ApiContext, code: string, data: Partial<CapabilityDto> & { version: number }) =>
    apiRequest<CapabilityDto>(`/api/v1/platform/capabilities/${encodeURIComponent(code)}`, context, {
      method: "PUT",
      body: JSON.stringify(data),
      expectedVersion: data.version,
      idempotencyKey: operationKey(`capability-update:${context.tenantId}:${code}`),
    }),

  // ---- 组织架构 ----
  listOrgUnits: (context: ApiContext) =>
    apiRequest<OrgUnitDto[]>("/api/v1/platform/org-units", context),

  saveOrgUnit: (context: ApiContext, data: OrgUnitDto) =>
    apiRequest<OrgUnitDto>(`/api/v1/platform/org-units${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`org-unit-save:${context.tenantId}:${data.id || data.code}`),
    }),

  deleteOrgUnit: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/org-units/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`org-unit-delete:${context.tenantId}:${id}`),
    }),

  // ---- 企业资源 ----
  listResources: (context: ApiContext) =>
    apiRequest<EnterpriseResourceDto[]>("/api/v1/platform/resources", context),

  saveResource: (context: ApiContext, data: EnterpriseResourceDto) =>
    apiRequest<EnterpriseResourceDto>(`/api/v1/platform/resources${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`resource-save:${context.tenantId}:${data.id || data.code}`),
    }),

  deleteResource: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/resources/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`resource-delete:${context.tenantId}:${id}`),
    }),

  // ---- 岗位 ----
  listPositions: (context: ApiContext) =>
    apiRequest<PositionDto[]>("/api/v1/platform/positions", context),

  savePosition: (context: ApiContext, data: PositionDto) =>
    apiRequest<PositionDto>(`/api/v1/platform/positions${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`position-save:${context.tenantId}:${data.id || data.code}`),
    }),

  deletePosition: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/positions/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`position-delete:${context.tenantId}:${id}`),
    }),

  // ---- 员工 ----
  listEmployees: (context: ApiContext) =>
    apiRequest<EmployeeDto[]>("/api/v1/platform/employees", context),

  saveEmployee: (context: ApiContext, data: EmployeeDto) =>
    apiRequest<EmployeeDto>(`/api/v1/platform/employees${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`employee-save:${context.tenantId}:${data.id || data.employeeNo}`),
    }),

  deleteEmployee: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/employees/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`employee-delete:${context.tenantId}:${id}`),
    }),

  // ---- 账号 ----
  listAccounts: (context: ApiContext) =>
    apiRequest<AccountDto[]>("/api/v1/platform/accounts", context),

  saveAccount: (context: ApiContext, data: AccountDto) =>
    apiRequest<AccountDto>(`/api/v1/platform/accounts${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`account-save:${context.tenantId}:${data.id || data.loginName}`),
    }),

  deleteAccount: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/accounts/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`account-delete:${context.tenantId}:${id}`),
    }),

  setAccountStatus: (context: ApiContext, id: string, status: AccountStatus, version: number, reason?: string) =>
    apiRequest<AccountDto>(`/api/v1/platform/accounts/${encodeURIComponent(id)}/status`, context, {
      method: "POST",
      body: JSON.stringify(reason ? { status, reason } : { status }),
      expectedVersion: version,
      idempotencyKey: operationKey(`account-status:${context.tenantId}:${id}:${status}`),
    }),

  resetAccountPassword: (context: ApiContext, id: string, version: number, newPassword?: string) =>
    apiRequest<{ reset: boolean; traceId: string }>(`/api/v1/platform/accounts/${encodeURIComponent(id)}/password-reset`, context, {
      method: "POST",
      body: JSON.stringify(newPassword ? { newPassword } : {}),
      expectedVersion: version,
      idempotencyKey: operationKey(`account-password-reset:${context.tenantId}:${id}`),
    }),

  // ---- 角色 ----
  listRoles: (context: ApiContext) =>
    apiRequest<RoleDto[]>("/api/v1/platform/roles", context),

  saveRole: (context: ApiContext, data: RoleDto) =>
    apiRequest<RoleDto>(`/api/v1/platform/roles${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`role-save:${context.tenantId}:${data.id || data.code}`),
    }),

  deleteRole: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/roles/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`role-delete:${context.tenantId}:${id}`),
    }),

  // ---- 权限资源 ----
  listPermissions: (context: ApiContext) =>
    apiRequest<PermissionResourceDto[]>("/api/v1/platform/permissions", context),

  // ---- 角色授权 ----
  listRoleGrants: (context: ApiContext, roleId?: string) =>
    apiRequest<RoleGrantDto[]>(
      `/api/v1/platform/role-grants${roleId ? `?roleId=${encodeURIComponent(roleId)}` : ""}`,
      context,
    ),

  replaceRoleGrants: (context: ApiContext, roleId: string, grants: Array<Omit<RoleGrantDto, "roleId" | "version" | "updatedAt">>, version?: number) =>
    apiRequest<RoleGrantDto[]>(`/api/v1/platform/roles/${encodeURIComponent(roleId)}/grants`, context, {
      method: "PUT",
      body: JSON.stringify({ grants }),
      ...(version ? { expectedVersion: version } : {}),
      idempotencyKey: operationKey(`role-grants-replace:${context.tenantId}:${roleId}`),
    }),

  // ---- 权限适配器 ----
  listAdapters: (context: ApiContext) =>
    apiRequest<PermissionAdapterDto[]>("/api/v1/platform/permission-adapters", context),

  syncAdapter: (context: ApiContext, id: string, version: number) =>
    apiRequest<PermissionAdapterDto>(`/api/v1/platform/permission-adapters/${encodeURIComponent(id)}/sync`, context, {
      method: "POST",
      expectedVersion: version,
      idempotencyKey: operationKey(`adapter-sync:${context.tenantId}:${id}`),
    }),

  // ---- 审批规则 ----
  listApprovalRules: (context: ApiContext) =>
    apiRequest<ApprovalRuleDto[]>("/api/v1/platform/approval-rules", context),

  saveApprovalRule: (context: ApiContext, data: ApprovalRuleDto) =>
    apiRequest<ApprovalRuleDto>(`/api/v1/platform/approval-rules${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`approval-rule-save:${context.tenantId}:${data.id || `${data.module}:${data.documentType}`}`),
    }),

  deleteApprovalRule: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/approval-rules/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`approval-rule-delete:${context.tenantId}:${id}`),
    }),

  // ---- 字典 ----
  listDictionaries: (context: ApiContext) =>
    apiRequest<DictionaryDto[]>("/api/v1/platform/dictionaries", context),

  saveDictionary: (context: ApiContext, data: DictionaryDto) =>
    apiRequest<DictionaryDto>(`/api/v1/platform/dictionaries${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`dictionary-save:${context.tenantId}:${data.id || `${data.category}:${data.code}`}`),
    }),

  deleteDictionary: (context: ApiContext, id: string, version: number) =>
    apiRequest<void>(`/api/v1/platform/dictionaries/${encodeURIComponent(id)}`, context, {
      method: "DELETE",
      expectedVersion: version,
      idempotencyKey: operationKey(`dictionary-delete:${context.tenantId}:${id}`),
    }),

  // ---- 参数 ----
  listParameters: (context: ApiContext) =>
    apiRequest<PlatformParameterDto[]>("/api/v1/platform/parameters", context),

  getSecurityParameters: (context: ApiContext) =>
    apiRequest<SecurityParametersDto>("/api/v1/platform/parameters/security", context),

  updateSecurityParameters: (context: ApiContext, data: Partial<SecurityParametersDto> & { version: number }) =>
    apiRequest<SecurityParametersDto>("/api/v1/platform/parameters/security", context, {
      method: "PUT",
      body: JSON.stringify(data),
      expectedVersion: data.version,
      idempotencyKey: operationKey(`security-parameters-update:${context.tenantId}`),
    }),

  saveParameter: (context: ApiContext, data: PlatformParameterDto) =>
    apiRequest<PlatformParameterDto>(`/api/v1/platform/parameters${data.id ? `/${encodeURIComponent(data.id)}` : ""}`, context, {
      method: data.id ? "PUT" : "POST",
      body: JSON.stringify(data),
      ...(data.id ? { expectedVersion: data.version } : {}),
      idempotencyKey: operationKey(`parameter-save:${context.tenantId}:${data.id || data.code}`),
    }),

  // ---- 审计日志 ----
  listAudits: (context: ApiContext, query?: AuditQuery) => {
    const params = new URLSearchParams();
    if (query?.module) params.set("module", query.module);
    if (query?.result) params.set("result", query.result);
    if (query?.operator) params.set("operator", query.operator);
    if (query?.startDate) params.set("startDate", query.startDate);
    if (query?.endDate) params.set("endDate", query.endDate);
    params.set("page", String(query?.page ?? 1));
    params.set("pageSize", String(query?.pageSize ?? 50));
    const search = params.toString();
    return apiRequest<PageResult<AuditRecordDto>>(`/api/v1/platform/audits?${search}`, context);
  },

  // ---- 会话撤销 ----
  revokeSession: (context: ApiContext, account: string, reason?: string) =>
    apiRequest<void>("/api/v1/platform/session-revocation", context, {
      method: "POST",
      body: JSON.stringify(reason ? { account, reason } : { account }),
      idempotencyKey: operationKey(`session-revoke:${context.tenantId}:${account}`),
    }),
};
