export type PlatformStatus = "enabled" | "disabled";

export type TenantStatus =
  | "init_created"
  | "init_org_ready"
  | "init_permission_ready"
  | "running"
  | "disabled"
  | "expired"
  | "init_blocked";

export type OrgUnitType = "company" | "department" | "factory" | "workshop";
export type ResourceType = "line" | "warehouse" | "work_center";
export type EmployeeStatus = "active" | "transferring" | "leave" | "resigned";
export type AccountStatus = "pending_activation" | "enabled" | "locked" | "disabled";
export type AccountAuthType = "password" | "sso" | "legacy_erp";
export type PermissionType = "menu" | "page" | "button" | "api" | "field" | "export" | "ai";
export type PermissionRisk = "normal" | "sensitive" | "critical";
export type GrantEffect = "allow" | "deny";
export type FieldMode = "visible" | "hidden" | "masked" | "readonly" | "export_denied";
export type AdapterStatus = "draft" | "pending_sync" | "synced" | "conflict" | "failed" | "disabled";
export type ApprovalResolver = "by_role" | "by_position" | "by_org_manager";
export type ApprovalFallback = "block" | "tenant_admin" | "unassigned_pool";
export type ParameterValueType = "integer" | "boolean" | "text";
export type ParameterEffectiveMode = "immediate" | "next_login";
export type AuditResult = "success" | "failed" | "denied";

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

export type OrgUnitDto = {
  id: string;
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
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
  tenantId: string;
  loginName: string;
  employeeId: string;
  authType: AccountAuthType;
  status: AccountStatus;
  directRoleIds: string[];
  passwordHash?: string;
  lastLoginAt: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleDto = {
  id: string;
  tenantId: string;
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
  tenantId: string;
  code: string;
  name: string;
  module: string;
  type: PermissionType;
  risk: PermissionRisk;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type RoleGrantDto = {
  roleId: string;
  tenantId: string;
  permissionId: string;
  effect: GrantEffect;
  fieldMode?: FieldMode;
  version: number;
  updatedAt: string;
};

export type PermissionAdapterDto = {
  id: string;
  tenantId: string;
  permissionCode: string;
  permissionName: string;
  module: string;
  legacyRoleCode: string;
  legacyScope: string;
  status: AdapterStatus;
  lastSyncAt: string | null;
  errorMessage: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ApprovalRuleDto = {
  id: string;
  tenantId: string;
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
  tenantId: string;
  category: string;
  code: string;
  name: string;
  status: PlatformStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ParameterDto = {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  value: string;
  valueType: ParameterValueType;
  effectiveMode: ParameterEffectiveMode;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type AuditLogDto = {
  id: string;
  tenantId: string;
  time: string;
  operator: string;
  module: string;
  action: string;
  target: string;
  result: AuditResult;
  traceId: string;
  ipAddress?: string;
  userAgent?: string;
};

export type CapabilityDto = {
  code: string;
  tenantId: string;
  name: string;
  enabled: boolean;
  quota: string;
  used: string;
  version: number;
  updatedAt: string;
};

export type SessionRevocation = {
  tenantId: string;
  account: string;
  jti?: string;
  revokedAt: string;
  revokedBy: string;
  reason: string;
  expiresAt?: string;
};

export type IdempotencyRecord = {
  tenantId: string;
  commandType: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  traceId: string;
  createdAt: string;
};

export type AuditLogFilter = {
  module?: string;
  result?: AuditResult;
  operator?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  pageSize?: number;
};

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
  parameters: ParameterDto[];
  auditLogs: AuditLogDto[];
};

export type ActorPermissionsDto = {
  loginName: string;
  activeRole: string | null;
  enabled: boolean;
  roleIds: string[];
  roleCodes: string[];
  permissionCodes: string[];
  deniedPermissionCodes: string[];
  fieldModes: Record<string, FieldMode>;
  authorizedFactoryOrgIds: string[];
  authorizedFactoryCodes: string[];
  dataScopes: Array<{ roleCode: string; dataScope: string; scopeValues: string[] }>;
};

export type SecurityParametersDto = {
  loginMaxFailures: number;
  sessionHours: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSpecial: boolean;
};
