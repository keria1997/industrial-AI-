export type PlatformStatus = 'enabled' | 'disabled';

export type OrgUnit = {
  id: string;
  code: string;
  name: string;
  type: 'company' | 'department' | 'factory' | 'workshop';
  parentId: string | null;
  managerEmployeeId: string | null;
  status: PlatformStatus;
};

export type EnterpriseResource = {
  id: string;
  code: string;
  name: string;
  type: 'line' | 'warehouse' | 'work_center';
  ownerOrgId: string;
  factoryOrgId: string | null;
  workshopOrgId: string | null;
  managerEmployeeId: string | null;
  specification: string;
  status: PlatformStatus;
};

export type Position = {
  id: string;
  code: string;
  name: string;
  orgId: string;
  defaultRoleIds: string[];
  resourceIds: string[];
  status: PlatformStatus;
};

export type Employee = {
  id: string;
  employeeNo: string;
  name: string;
  primaryOrgId: string;
  primaryPositionId: string;
  mobile: string;
  email: string;
  status: 'active' | 'transferring' | 'leave' | 'resigned';
};

export type Account = {
  id: string;
  loginName: string;
  employeeId: string;
  authType: 'password' | 'sso' | 'legacy_erp';
  status: 'pending_activation' | 'enabled' | 'locked' | 'disabled';
  directRoleIds: string[];
  lastLoginAt: string;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  description: string;
  dataScope: string;
  scopeValues: string[];
  status: PlatformStatus;
};

export type PermissionResource = {
  id: string;
  code: string;
  name: string;
  module: string;
  type: 'menu' | 'page' | 'button' | 'api' | 'field' | 'export' | 'ai';
  risk: 'normal' | 'sensitive' | 'critical';
};

export type RoleGrant = {
  roleId: string;
  permissionId: string;
  effect: 'allow' | 'deny';
  fieldMode?: 'visible' | 'hidden' | 'masked' | 'readonly' | 'export_denied';
};

export type PermissionAdapter = {
  id: string;
  permissionCode: string;
  permissionName: string;
  module: string;
  legacyRoleCode: string;
  legacyScope: string;
  status: 'draft' | 'pending_sync' | 'synced' | 'conflict' | 'failed' | 'disabled' | 'NOT_CONFIGURED';
  lastSyncAt: string | null;
  errorMessage: string;
};

export type Capability = {
  code: string;
  name: string;
  enabled: boolean;
  quota: string;
  used: string;
};

export type ApprovalRule = {
  id: string;
  module: string;
  documentType: string;
  resolver: 'by_role' | 'by_position' | 'by_org_manager';
  resolverValue: string;
  fallback: 'block' | 'tenant_admin' | 'unassigned_pool';
  status: PlatformStatus;
};

export type AuditRecord = {
  id: string;
  time: string;
  operator: string;
  module: string;
  action: string;
  target: string;
  result: 'success' | 'failed' | 'denied';
  traceId: string;
};

export type PlatformState = {
  tenant: {
    version?: number;
    id: string;
    code: string;
    name: string;
    edition: string;
    status: 'init_created' | 'init_org_ready' | 'init_permission_ready' | 'running' | 'disabled' | 'expired' | 'init_blocked';
    bootstrapOwnerAccountId: string;
    formalAdminAccountId: string;
    expireAt: string;
  };
  capabilities: Capability[];
  orgUnits: OrgUnit[];
  resources: EnterpriseResource[];
  positions: Position[];
  employees: Employee[];
  accounts: Account[];
  roles: Role[];
  permissions: PermissionResource[];
  roleGrants: RoleGrant[];
  adapters: PermissionAdapter[];
  approvalRules: ApprovalRule[];
  dictionaries: Array<{ id: string; category: string; code: string; name: string; status: PlatformStatus }>;
  parameters: Array<{ id: string; code: string; name: string; value: string; valueType?: 'integer' | 'boolean' | 'text'; effectiveMode: 'immediate' | 'next_login' }>;
  audits: AuditRecord[];
};

export type PlatformActor = {
  account?: string;
  name?: string;
  role?: string;
};

export const PLATFORM_STATE_CHANGED_EVENT = 'industrial-ai-platform-state-changed';
export const platformStorageKey = (tenantId = 'TENANT-SHWS') => `industrial-ai-platform-v2:${tenantId}`;

const workbenchRoleCodeMap: Record<string, string> = {
  '超级管理员': 'TENANT_ADMIN',
  '系统管理员': 'TENANT_ADMIN',
  '管理员': 'TENANT_ADMIN',
  '老板': 'TENANT_ADMIN',
  '人事': 'HR_SPECIALIST',
  '计划员': 'PRODUCTION_DIRECTOR',
  '车间': 'PRODUCTION_WORKSHOP',
  '仓管': 'WAREHOUSE_ADMIN',
  '采购': 'PURCHASE_STAFF',
  '销售': 'SALE_STAFF',
  '财务': 'FINANCE_STAFF',
};

export const getPlatformActorRoleIds = (state: PlatformState, actor?: PlatformActor, activeRole?: string) => {
  const mappedRoleCode = workbenchRoleCodeMap[activeRole || actor?.role || ''];
  const mappedRole = mappedRoleCode ? state.roles.find((item) => item.code === mappedRoleCode && item.status === 'enabled') : undefined;
  if (mappedRole) return [mappedRole.id];

  const account = state.accounts.find((item) => item.loginName === actor?.account && item.status === 'enabled');
  const employee = account ? state.employees.find((item) => item.id === account.employeeId && item.status === 'active') : undefined;
  const position = employee ? state.positions.find((item) => item.id === employee.primaryPositionId && item.status === 'enabled') : undefined;
  return Array.from(new Set([...(account?.directRoleIds || []), ...(position?.defaultRoleIds || [])]))
    .filter((roleId) => state.roles.some((item) => item.id === roleId && item.status === 'enabled'));
};

export const isPlatformActorEnabled = (state: PlatformState, actor?: PlatformActor) => {
  if (!actor?.account) return true;
  const account = state.accounts.find((item) => item.loginName === actor.account);
  if (!account || account.status !== 'enabled') return false;
  return state.employees.some((item) => item.id === account.employeeId && item.status === 'active');
};

export const hasPlatformPermission = (state: PlatformState, actor: PlatformActor | undefined, activeRole: string | undefined, permissionCode: string) => {
  const permission = state.permissions.find((item) => item.code === permissionCode);
  if (!permission || !isPlatformActorEnabled(state, actor)) return false;
  const roleIds = getPlatformActorRoleIds(state, actor, activeRole);
  const grants = state.roleGrants.filter((item) => roleIds.includes(item.roleId) && item.permissionId === permission.id);
  if (grants.some((item) => item.effect === 'deny')) return false;
  return grants.some((item) => item.effect === 'allow');
};

export const isPlatformCapabilityEnabled = (state: PlatformState, capabilityCode: string) =>
  state.tenant.status === 'running' && state.capabilities.some((item) => item.code === capabilityCode && item.enabled);

const collectOrgDescendants = (state: PlatformState, rootIds: string[]) => {
  const result = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    state.orgUnits.forEach((item) => {
      if (item.parentId && result.has(item.parentId) && !result.has(item.id)) {
        result.add(item.id);
        changed = true;
      }
    });
  }
  return result;
};

export const getAuthorizedFactoryOrgIds = (state: PlatformState, actor?: PlatformActor, activeRole?: string) => {
  const enabledFactories = state.orgUnits.filter((item) => item.type === 'factory' && item.status === 'enabled');
  const roleIds = getPlatformActorRoleIds(state, actor, activeRole);
  const activeRoles = state.roles.filter((item) => roleIds.includes(item.id) && item.status === 'enabled');
  if (activeRoles.some((item) => item.dataScope === 'tenant_all')) return enabledFactories.map((item) => item.id);

  const allowed = new Set<string>();
  activeRoles.forEach((role) => {
    if (role.dataScope === 'factory_set') role.scopeValues.forEach((value) => allowed.add(value));
    if (role.dataScope === 'warehouse_set') {
      state.resources.filter((item) => role.scopeValues.includes(item.id) && item.status === 'enabled').forEach((item) => {
        if (item.factoryOrgId) allowed.add(item.factoryOrgId);
      });
    }
    if (role.dataScope === 'org_tree') {
      const descendants = collectOrgDescendants(state, role.scopeValues);
      enabledFactories.filter((item) => descendants.has(item.id)).forEach((item) => allowed.add(item.id));
    }
  });
  return enabledFactories.filter((item) => allowed.has(item.id)).map((item) => item.id);
};

export const getAuthorizedFactoryCodes = (state: PlatformState, actor?: PlatformActor, activeRole?: string) => {
  const authorizedIds = new Set(getAuthorizedFactoryOrgIds(state, actor, activeRole));
  return state.orgUnits
    .filter((item) => item.type === 'factory' && item.status === 'enabled' && authorizedIds.has(item.id))
    .map((item) => item.code);
};

export const platformProductionLines = [];

export const loadPlatformProductionLines = (tenantId = 'TENANT-SHWS') => {
  return platformProductionLines;
};

export const platformGrantedPermissionCodes = [
  'production.demandPool.view',
  'production.demandPool.createMps',
  'production.mps.calcMrp',
  'production.workOrder.dispatch',
  'platform.org.manage',
  'platform.resource.manage',
  'platform.permission.preview',
  'platform.adapter.sync',
  'platform.audit.view',
];

export const loadPlatformState = (tenant?: { id?: string; code?: string; name?: string }): PlatformState => {
  // A page starts empty until the platform snapshot API has returned.
  return {
    tenant: {
      id: tenant?.id || '', code: tenant?.code || '', name: tenant?.name || '',
      edition: '', status: 'init_created', bootstrapOwnerAccountId: '',
      formalAdminAccountId: '', expireAt: '',
    },
    capabilities: [], orgUnits: [], resources: [], positions: [], employees: [],
    accounts: [], roles: [], permissions: [], roleGrants: [], adapters: [],
    approvalRules: [], dictionaries: [], parameters: [], audits: [],
  };
};
