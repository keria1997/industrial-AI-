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
  status: 'draft' | 'pending_sync' | 'synced' | 'conflict' | 'failed' | 'disabled';
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
  '老板': 'PRODUCTION_VIEWER',
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

export const platformProductionLines = [
  { name: 'SMT一线', code: 'LINE-SMT-01', ownerOrgId: 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopCode: 'ORG-WS-SMT', capacity: '1200 PCS/日', equipment: 'SMT-M01', manager: '生产计划员', status: '启用' },
  { name: 'SMT二线', code: 'LINE-SMT-02', ownerOrgId: 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopCode: 'ORG-WS-SMT', capacity: '980 PCS/日', equipment: 'SMT-M02', manager: '生产计划员', status: '启用' },
  { name: '总装一线', code: 'LINE-ASSY-01', ownerOrgId: 'ORG-WS-ASSY', factoryOrgId: 'ORG-FAC-01', workshopCode: 'ORG-WS-ASSY', capacity: '360 台/日', equipment: 'ASSY-W02', manager: '王建国', status: '启用' },
];

export const loadPlatformProductionLines = (tenantId = 'TENANT-SHWS') => {
  if (typeof window === 'undefined') return platformProductionLines;
  try {
    const saved = window.localStorage.getItem(`industrial-ai-platform-v2:${tenantId}`);
    if (!saved) return platformProductionLines;
    const state = JSON.parse(saved) as PlatformState;
    const lines = state.resources
      .filter((item) => item.type === 'line' && item.status === 'enabled')
      .map((item) => ({
        name: item.name,
        code: item.code,
        ownerOrgId: item.ownerOrgId,
        factoryOrgId: item.factoryOrgId || '',
        workshopCode: item.workshopOrgId || '',
        capacity: item.specification || '未配置',
        equipment: '',
        manager: state.employees.find((employee) => employee.id === item.managerEmployeeId)?.name || '未设置',
        status: '启用',
      }));
    return lines.length ? lines : platformProductionLines;
  } catch {
    return platformProductionLines;
  }
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

const orgUnits: OrgUnit[] = [
  { id: 'ORG-ROOT', code: 'ORG-ROOT', name: '上海万申工业集团', type: 'company', parentId: null, managerEmployeeId: 'EMP-001', status: 'enabled' },
  { id: 'ORG-SALE', code: 'DEPT-SALE', name: '销售中心', type: 'department', parentId: 'ORG-ROOT', managerEmployeeId: 'EMP-002', status: 'enabled' },
  { id: 'ORG-MFG', code: 'DEPT-MFG', name: '智能制造部', type: 'department', parentId: 'ORG-ROOT', managerEmployeeId: 'EMP-003', status: 'enabled' },
  { id: 'ORG-SCM', code: 'DEPT-SCM', name: '供应链协同部', type: 'department', parentId: 'ORG-ROOT', managerEmployeeId: 'EMP-004', status: 'enabled' },
  { id: 'ORG-FIN', code: 'DEPT-FIN', name: '财务结算部', type: 'department', parentId: 'ORG-ROOT', managerEmployeeId: 'EMP-005', status: 'enabled' },
  { id: 'ORG-FAC-01', code: 'FAC-SH-01', name: '万申智能制造一厂', type: 'factory', parentId: 'ORG-MFG', managerEmployeeId: 'EMP-003', status: 'enabled' },
  { id: 'ORG-WS-SMT', code: 'WS-SMT', name: 'SMT贴片车间', type: 'workshop', parentId: 'ORG-FAC-01', managerEmployeeId: 'EMP-003', status: 'enabled' },
  { id: 'ORG-WS-ASSY', code: 'WS-ASSY', name: '总装车间', type: 'workshop', parentId: 'ORG-FAC-01', managerEmployeeId: 'EMP-006', status: 'enabled' },
];

const roles: Role[] = [
  { id: 'ROLE-ADMIN', code: 'TENANT_ADMIN', name: '租户系统管理员', description: '管理当前租户平台底座与全部权限', dataScope: 'tenant_all', scopeValues: [], status: 'enabled' },
  { id: 'ROLE-MFG', code: 'PRODUCTION_DIRECTOR', name: '生产主管', description: '生产需求、计划、展算与工单管理', dataScope: 'factory_set', scopeValues: ['ORG-FAC-01'], status: 'enabled' },
  { id: 'ROLE-WMS', code: 'WAREHOUSE_ADMIN', name: '仓库管理员', description: '授权仓库的出入库与库存操作', dataScope: 'warehouse_set', scopeValues: ['RES-WH-RM', 'RES-WH-FG'], status: 'enabled' },
  { id: 'ROLE-SALE', code: 'SALE_STAFF', name: '销售专员', description: '本人客户、报价和销售订单', dataScope: 'customer_owner', scopeValues: [], status: 'enabled' },
  { id: 'ROLE-PUR', code: 'PURCHASE_STAFF', name: '采购专员', description: '本人供应商与采购业务', dataScope: 'supplier_buyer', scopeValues: [], status: 'enabled' },
  { id: 'ROLE-FIN', code: 'FINANCE_STAFF', name: '财务专员', description: '应收应付、凭证和授权金额字段', dataScope: 'org_tree', scopeValues: ['ORG-FIN'], status: 'enabled' },
  { id: 'ROLE-SHOP', code: 'PRODUCTION_WORKSHOP', name: '车间执行人员', description: '授权工厂的工单执行、报工、质量与完工', dataScope: 'factory_set', scopeValues: ['ORG-FAC-01'], status: 'enabled' },
  { id: 'ROLE-PROD-VIEW', code: 'PRODUCTION_VIEWER', name: '生产只读人员', description: '只查看授权工厂的生产业务数据', dataScope: 'factory_set', scopeValues: ['ORG-FAC-01'], status: 'enabled' },
];

const permissions: PermissionResource[] = [
  { id: 'PERM-PLATFORM', code: 'platform', name: '平台管理菜单', module: '平台管理', type: 'menu', risk: 'normal' },
  { id: 'PERM-ORG-VIEW', code: 'platform.org.view', name: '组织架构查看', module: '平台管理', type: 'page', risk: 'normal' },
  { id: 'PERM-ORG-MANAGE', code: 'platform.org.manage', name: '组织架构维护', module: '平台管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-RESOURCE-MANAGE', code: 'platform.resource.manage', name: '企业资源维护', module: '平台管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-ACCOUNT-DISABLE', code: 'platform.account.disable', name: '账号停用', module: '平台管理', type: 'api', risk: 'critical' },
  { id: 'PERM-ROLE-GRANT', code: 'platform.role.grant', name: '角色授权', module: '平台管理', type: 'api', risk: 'critical' },
  { id: 'PERM-PREVIEW', code: 'platform.permission.preview', name: '权限预览', module: '平台管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-ADAPTER', code: 'platform.adapter.sync', name: '旧ERP权限同步', module: '平台管理', type: 'api', risk: 'critical' },
  { id: 'PERM-AUDIT', code: 'platform.audit.view', name: '审计日志查看', module: '平台管理', type: 'page', risk: 'sensitive' },
  { id: 'PERM-AUDIT-EXPORT', code: 'platform.audit.export', name: '审计日志导出', module: '平台管理', type: 'export', risk: 'critical' },
  { id: 'PERM-MPS', code: 'production.mps.release', name: '主生产计划下达', module: '生产管理', type: 'api', risk: 'critical' },
  { id: 'PERM-MRP', code: 'production.mps.calcMrp', name: 'MRP展算', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-VIEW', code: 'production.view', name: '生产管理查看', module: '生产管理', type: 'menu', risk: 'normal' },
  { id: 'PERM-PROD-MASTER', code: 'production.master.manage', name: '生产主数据维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-DEMAND', code: 'production.demand.manage', name: '生产需求维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-PLAN', code: 'production.plan.manage', name: '生产计划维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-APS', code: 'production.aps.manage', name: 'APS排产维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-KITTING', code: 'production.kitting.manage', name: '齐套与投料维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-EXECUTION', code: 'production.execution.manage', name: '车间执行维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-QUALITY', code: 'production.quality.manage', name: '生产质量维护', module: '生产管理', type: 'button', risk: 'sensitive' },
  { id: 'PERM-PROD-COMPLETION', code: 'production.completion.manage', name: '完工结案维护', module: '生产管理', type: 'button', risk: 'critical' },
  { id: 'PERM-PROD-TASKS', code: 'production.tasks.view', name: '生产任务中心查看', module: '生产管理', type: 'page', risk: 'sensitive' },
  { id: 'PERM-STOCK-EXPORT', code: 'inventory.stock.export', name: '库存导出', module: '库存管理', type: 'export', risk: 'sensitive' },
  { id: 'PERM-COST', code: 'finance.cost.costAmount', name: '成本金额', module: '财务管理', type: 'field', risk: 'critical' },
  { id: 'PERM-RISK', code: 'sales.customer.riskLevel', name: '客户风险等级', module: '销售管理', type: 'field', risk: 'sensitive' },
  { id: 'PERM-SUP-ATT', code: 'purchase.supplier.attachments', name: '供应商资质附件', module: '采购管理', type: 'field', risk: 'sensitive' },
  { id: 'PERM-AI-RISK', code: 'ai.customerRisk.query', name: 'AI客户风险查询', module: 'AI助手', type: 'ai', risk: 'critical' },
];

export const createPlatformSeed = (tenant?: { id?: string; code?: string; name?: string }): PlatformState => {
  const isEastChina = tenant?.id === 'TENANT-HDJG' || tenant?.code === 'HDJG';
  const tenantOrgUnits = orgUnits.map((item) => {
    if (item.id === 'ORG-ROOT') return { ...item, code: isEastChina ? 'ORG-HDJG' : item.code, name: tenant?.name || item.name };
    if (item.id === 'ORG-FAC-01') return { ...item, code: isEastChina ? 'FAC-SZ-01' : 'FAC-SH-01', name: isEastChina ? '华东精工制造工厂' : item.name };
    return item;
  });
  const finishedWarehouseId = isEastChina ? 'RES-WH-FG-02' : 'RES-WH-FG-01';
  const tenantResources: EnterpriseResource[] = [
    { id: 'RES-LINE-01', code: isEastChina ? 'LINE-SMT-02' : 'LINE-SMT-01', name: isEastChina ? 'SMT二线' : 'SMT一线', type: 'line', ownerOrgId: 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-SMT', managerEmployeeId: 'EMP-003', specification: isEastChina ? '760 PCS/日' : '1200 PCS/日', status: 'enabled' },
    { id: 'RES-LINE-02', code: isEastChina ? 'LINE-ASSY-02' : 'LINE-SMT-02', name: isEastChina ? '总装二线' : 'SMT二线', type: 'line', ownerOrgId: isEastChina ? 'ORG-WS-ASSY' : 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopOrgId: isEastChina ? 'ORG-WS-ASSY' : 'ORG-WS-SMT', managerEmployeeId: 'EMP-003', specification: isEastChina ? '280 台/日' : '980 PCS/日', status: 'enabled' },
    ...(!isEastChina ? [{ id: 'RES-LINE-03', code: 'LINE-ASSY-01', name: '总装一线', type: 'line' as const, ownerOrgId: 'ORG-WS-ASSY', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-ASSY', managerEmployeeId: 'EMP-006', specification: '360 台/日', status: 'enabled' as const }] : []),
    { id: 'RES-WH-RM', code: isEastChina ? 'WH-RM-02' : 'WH-RM-01', name: isEastChina ? '华东原材料仓' : '一号原材料仓', type: 'warehouse', ownerOrgId: 'ORG-SCM', factoryOrgId: 'ORG-FAC-01', workshopOrgId: null, managerEmployeeId: 'EMP-004', specification: '原材料仓', status: 'enabled' },
    { id: 'RES-WH-WIP', code: isEastChina ? 'WH-WIP-02' : 'WH-WIP-01', name: '线边暂存仓', type: 'warehouse', ownerOrgId: 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-SMT', managerEmployeeId: 'EMP-004', specification: '线边仓', status: 'enabled' },
    { id: finishedWarehouseId, code: isEastChina ? 'WH-FG-02' : 'WH-FG-01', name: isEastChina ? '华东成品仓' : '成品主仓', type: 'warehouse', ownerOrgId: 'ORG-SCM', factoryOrgId: 'ORG-FAC-01', workshopOrgId: null, managerEmployeeId: 'EMP-004', specification: '成品仓', status: 'enabled' },
    { id: 'RES-WC-SMT', code: isEastChina ? 'SMT-02' : 'SMT-01', name: 'SMT贴片工作中心', type: 'work_center', ownerOrgId: 'ORG-WS-SMT', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-SMT', managerEmployeeId: 'EMP-003', specification: '贴片、回流焊', status: 'enabled' },
    { id: 'RES-WC-ASSY', code: isEastChina ? 'ASSY-02' : 'ASSY-01', name: '总装工作中心', type: 'work_center', ownerOrgId: 'ORG-WS-ASSY', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-ASSY', managerEmployeeId: 'EMP-006', specification: '装配、测试', status: 'enabled' },
    ...(!isEastChina ? [{ id: 'RES-WC-TEST', code: 'TEST-01', name: '功能测试工作中心', type: 'work_center' as const, ownerOrgId: 'ORG-WS-ASSY', factoryOrgId: 'ORG-FAC-01', workshopOrgId: 'ORG-WS-ASSY', managerEmployeeId: 'EMP-006', specification: '功能测试', status: 'enabled' as const }] : []),
  ];
  return ({
  tenant: {
    id: tenant?.id || 'TENANT-SHWS',
    code: tenant?.code || 'SHWS',
    name: tenant?.name || '上海万申工业集团',
    edition: '工业旗舰版',
    status: 'running',
    bootstrapOwnerAccountId: 'ACC-ADMIN',
    formalAdminAccountId: 'ACC-ADMIN',
    expireAt: '2027-06-22',
  },
  capabilities: [
    { code: 'sales', name: '销售管理', enabled: true, quota: '不限', used: '运行正常' },
    { code: 'production', name: '生产管理', enabled: true, quota: '不限', used: '运行正常' },
    { code: 'inventory', name: '库存管理', enabled: true, quota: '不限', used: '运行正常' },
    { code: 'purchase', name: '采购管理', enabled: true, quota: '不限', used: '运行正常' },
    { code: 'finance', name: '财务管理', enabled: true, quota: '不限', used: '运行正常' },
    { code: 'messageCenter', name: '消息中心', enabled: true, quota: '20万条/月', used: '31%' },
    { code: 'aiAssistant', name: 'AI助手', enabled: true, quota: '5000次/月', used: '820次' },
  ],
  orgUnits: tenantOrgUnits,
  resources: tenantResources,
  positions: [
    { id: 'POS-ADMIN', code: 'POS-ADMIN', name: '租户管理员', orgId: 'ORG-ROOT', defaultRoleIds: ['ROLE-ADMIN'], resourceIds: [], status: 'enabled' },
    { id: 'POS-SALE', code: 'POS-SALE-MGR', name: '销售经理', orgId: 'ORG-SALE', defaultRoleIds: ['ROLE-SALE'], resourceIds: [], status: 'enabled' },
    { id: 'POS-MFG', code: 'POS-MFG-PLAN', name: '生产计划主管', orgId: 'ORG-MFG', defaultRoleIds: ['ROLE-MFG'], resourceIds: ['RES-LINE-01', 'RES-LINE-02', 'RES-LINE-03'], status: 'enabled' },
    { id: 'POS-WMS', code: 'POS-WMS-LEAD', name: '仓库主管', orgId: 'ORG-SCM', defaultRoleIds: ['ROLE-WMS'], resourceIds: ['RES-WH-RM', 'RES-WH-WIP', 'RES-WH-FG'], status: 'enabled' },
    { id: 'POS-FIN', code: 'POS-FIN-ARAP', name: '财务会计', orgId: 'ORG-FIN', defaultRoleIds: ['ROLE-FIN'], resourceIds: [], status: 'enabled' },
  ],
  employees: [
    { id: 'EMP-001', employeeNo: 'OP-001', name: '操作员 01', primaryOrgId: 'ORG-ROOT', primaryPositionId: 'POS-ADMIN', mobile: '138****0001', email: 'admin@nexus.ai', status: 'active' },
    { id: 'EMP-002', employeeNo: 'SA-018', name: '销售主管', primaryOrgId: 'ORG-SALE', primaryPositionId: 'POS-SALE', mobile: '138****0018', email: 'sales@nexus.ai', status: 'active' },
    { id: 'EMP-003', employeeNo: 'MF-026', name: '生产计划员', primaryOrgId: 'ORG-MFG', primaryPositionId: 'POS-MFG', mobile: '138****0026', email: 'plan@nexus.ai', status: 'active' },
    { id: 'EMP-004', employeeNo: 'SC-011', name: '采购专员', primaryOrgId: 'ORG-SCM', primaryPositionId: 'POS-WMS', mobile: '138****0011', email: 'purchase@nexus.ai', status: 'active' },
    { id: 'EMP-005', employeeNo: 'FI-009', name: '财务会计', primaryOrgId: 'ORG-FIN', primaryPositionId: 'POS-FIN', mobile: '138****0009', email: 'finance@nexus.ai', status: 'active' },
    { id: 'EMP-006', employeeNo: 'MF-031', name: '王建国', primaryOrgId: 'ORG-WS-ASSY', primaryPositionId: 'POS-MFG', mobile: '138****0031', email: 'wangjg@nexus.ai', status: 'active' },
    { id: 'EMP-007', employeeNo: 'HR-014', name: '李雯', primaryOrgId: 'ORG-ROOT', primaryPositionId: 'POS-ADMIN', mobile: '138****0014', email: 'liwen@nexus.ai', status: 'active' },
  ],
  accounts: [
    { id: 'ACC-ADMIN', loginName: 'admin', employeeId: 'EMP-001', authType: 'legacy_erp', status: 'enabled', directRoleIds: ['ROLE-ADMIN'], lastLoginAt: '2026-07-21 17:52:10' },
    { id: 'ACC-SALE', loginName: 'sale_lead', employeeId: 'EMP-002', authType: 'password', status: 'enabled', directRoleIds: [], lastLoginAt: '2026-07-21 16:41:28' },
    { id: 'ACC-MFG', loginName: 'mfg_plan', employeeId: 'EMP-003', authType: 'legacy_erp', status: 'enabled', directRoleIds: [], lastLoginAt: '2026-07-21 15:33:05' },
    { id: 'ACC-PUR', loginName: 'purchase_01', employeeId: 'EMP-004', authType: 'password', status: 'enabled', directRoleIds: ['ROLE-PUR'], lastLoginAt: '2026-07-21 14:20:11' },
    { id: 'ACC-FIN', loginName: 'fin_ar', employeeId: 'EMP-005', authType: 'password', status: 'locked', directRoleIds: [], lastLoginAt: '2026-07-20 17:05:42' },
  ],
  roles,
  permissions,
  roleGrants: [
    ...permissions.map(permission => ({ roleId: 'ROLE-ADMIN', permissionId: permission.id, effect: 'allow' as const })),
    { roleId: 'ROLE-MFG', permissionId: 'PERM-MPS', effect: 'allow' },
    { roleId: 'ROLE-MFG', permissionId: 'PERM-MRP', effect: 'allow' },
    { roleId: 'ROLE-MFG', permissionId: 'PERM-COST', effect: 'deny', fieldMode: 'hidden' },
    { roleId: 'ROLE-WMS', permissionId: 'PERM-STOCK-EXPORT', effect: 'allow' },
    { roleId: 'ROLE-SALE', permissionId: 'PERM-RISK', effect: 'allow', fieldMode: 'masked' },
    { roleId: 'ROLE-PUR', permissionId: 'PERM-SUP-ATT', effect: 'allow', fieldMode: 'visible' },
    { roleId: 'ROLE-FIN', permissionId: 'PERM-COST', effect: 'allow', fieldMode: 'visible' },
    ...['PERM-PROD-VIEW', 'PERM-PROD-MASTER', 'PERM-PROD-DEMAND', 'PERM-PROD-PLAN', 'PERM-PROD-APS', 'PERM-PROD-KITTING', 'PERM-PROD-EXECUTION', 'PERM-PROD-QUALITY', 'PERM-PROD-COMPLETION'].map((permissionId) => ({ roleId: 'ROLE-MFG', permissionId, effect: 'allow' as const })),
    ...['PERM-PROD-VIEW', 'PERM-PROD-EXECUTION', 'PERM-PROD-QUALITY', 'PERM-PROD-COMPLETION'].map((permissionId) => ({ roleId: 'ROLE-SHOP', permissionId, effect: 'allow' as const })),
    { roleId: 'ROLE-PROD-VIEW', permissionId: 'PERM-PROD-VIEW', effect: 'allow' },
    { roleId: 'ROLE-WMS', permissionId: 'PERM-PROD-VIEW', effect: 'allow' },
    { roleId: 'ROLE-WMS', permissionId: 'PERM-PROD-KITTING', effect: 'allow' },
  ],
  adapters: [
    { id: 'ADP-001', permissionCode: 'production.demandPool.createMps', permissionName: '生产需求池生成MPS', module: '生产管理', legacyRoleCode: 'PRODUCTION_DIRECTOR', legacyScope: 'production_org', status: 'synced', lastSyncAt: '2026-07-21 14:21:05', errorMessage: '' },
    { id: 'ADP-002', permissionCode: 'production.mps.calcMrp', permissionName: 'MPS推入MRP展算', module: '生产管理', legacyRoleCode: 'PRODUCTION_DIRECTOR', legacyScope: 'production_org', status: 'synced', lastSyncAt: '2026-07-21 14:21:07', errorMessage: '' },
    { id: 'ADP-003', permissionCode: 'platform.org.manage', permissionName: '组织架构维护', module: '平台管理', legacyRoleCode: 'TENANT_ADMIN', legacyScope: 'tenant_all', status: 'synced', lastSyncAt: '2026-07-21 14:21:10', errorMessage: '' },
    { id: 'ADP-004', permissionCode: 'platform.resource.manage', permissionName: '企业资源维护', module: '平台管理', legacyRoleCode: 'TENANT_ADMIN', legacyScope: 'tenant_all', status: 'pending_sync', lastSyncAt: null, errorMessage: '' },
    { id: 'ADP-005', permissionCode: 'platform.account.disable', permissionName: '账号停用', module: '平台管理', legacyRoleCode: 'TENANT_ADMIN', legacyScope: 'tenant_all', status: 'conflict', lastSyncAt: null, errorMessage: '旧 ERP 中存在同编码资源，但资源类型不同' },
    { id: 'ADP-006', permissionCode: 'ai.customerRisk.query', permissionName: 'AI客户风险查询', module: 'AI助手', legacyRoleCode: 'RISK_VIEWER', legacyScope: 'customer_org_tree', status: 'failed', lastSyncAt: null, errorMessage: '旧角色 RISK_VIEWER 不存在' },
  ],
  approvalRules: [
    { id: 'APR-001', module: '销售管理', documentType: '销售订单', resolver: 'by_role', resolverValue: 'ROLE-SALE', fallback: 'block', status: 'enabled' },
    { id: 'APR-002', module: '采购管理', documentType: '采购申请', resolver: 'by_org_manager', resolverValue: 'ORG-SCM', fallback: 'unassigned_pool', status: 'enabled' },
    { id: 'APR-003', module: '平台管理', documentType: '员工离职', resolver: 'by_role', resolverValue: 'ROLE-ADMIN', fallback: 'tenant_admin', status: 'enabled' },
  ],
  dictionaries: [
    { id: 'DICT-001', category: '组织类型', code: 'company', name: '公司', status: 'enabled' },
    { id: 'DICT-002', category: '组织类型', code: 'department', name: '部门', status: 'enabled' },
    { id: 'DICT-003', category: '仓库类型', code: 'raw_material', name: '原材料仓', status: 'enabled' },
    { id: 'DICT-004', category: '仓库类型', code: 'line_side', name: '线边仓', status: 'enabled' },
    { id: 'DICT-005', category: '账号状态', code: 'locked', name: '锁定', status: 'enabled' },
  ],
  parameters: [
    { id: 'PAR-001', code: 'security.login.maxFailures', name: '登录失败锁定次数', value: '5', valueType: 'integer', effectiveMode: 'immediate' },
    { id: 'PAR-002', code: 'security.session.hours', name: '会话有效期（小时）', value: '8', valueType: 'integer', effectiveMode: 'next_login' },
    { id: 'PAR-003', code: 'approval.timeout.hours', name: '审批超时提醒（小时）', value: '2', valueType: 'integer', effectiveMode: 'immediate' },
    { id: 'PAR-004', code: 'supplier.attachment.required', name: '供应商资质默认必填', value: 'false', valueType: 'boolean', effectiveMode: 'immediate' },
  ],
  audits: [
    { id: 'AUD-001', time: '2026-07-21 17:18:21', operator: '操作员 01', module: '平台管理', action: '修改角色授权', target: '生产主管 / MRP展算', result: 'success', traceId: 'TRACE-20260721-0018' },
    { id: 'AUD-002', time: '2026-07-21 16:08:04', operator: '财务会计', module: '财务管理', action: '导出应收账款', target: 'AR-2607-001', result: 'success', traceId: 'TRACE-20260721-0017' },
    { id: 'AUD-003', time: '2026-07-21 15:40:18', operator: 'AI助手', module: 'AI助手', action: '客户风险查询', target: '无风险字段权限', result: 'denied', traceId: 'TRACE-20260721-0016' },
    { id: 'AUD-004', time: '2026-07-21 14:21:10', operator: '操作员 01', module: '平台管理', action: '同步权限适配', target: 'platform.org.manage', result: 'success', traceId: 'TRACE-20260721-0015' },
    { id: 'AUD-005', time: '2026-07-20 17:05:42', operator: 'fin_ar', module: '账号安全', action: '连续密码错误', target: 'fin_ar', result: 'failed', traceId: 'TRACE-20260720-0099' },
  ],
  });
};

const mergeById = <T extends { id: string }>(saved: T[] | undefined, defaults: T[]) => {
  const result = [...(saved || [])];
  const ids = new Set(result.map((item) => item.id));
  defaults.forEach((item) => { if (!ids.has(item.id)) result.push(item); });
  return result;
};

export const mergePlatformState = (value: Partial<PlatformState> | null | undefined, tenant?: { id?: string; code?: string; name?: string }): PlatformState => {
  const defaults = createPlatformSeed(tenant);
  if (!value?.tenant) return defaults;
  const savedGrants = value.roleGrants || [];
  const grantKeys = new Set(savedGrants.map((item) => `${item.roleId}:${item.permissionId}`));
  const savedCapabilities = new Map((value.capabilities || []).map((item) => [item.code, item]));
  const isEastChina = defaults.tenant.id === 'TENANT-HDJG';
  const defaultOrgUnits = new Map(defaults.orgUnits.map((item) => [item.id, item]));
  const mergedOrgUnits = mergeById(value.orgUnits, defaults.orgUnits).map((item) => {
    const canonical = defaultOrgUnits.get(item.id);
    return canonical && ['ORG-ROOT', 'ORG-FAC-01'].includes(item.id) ? { ...item, code: canonical.code, name: canonical.name } : item;
  });
  const defaultResources = new Map(defaults.resources.map((item) => [item.id, item]));
  const legacyShanghaiResourceIds = new Set(['RES-LINE-03', 'RES-WC-TEST', 'RES-WH-FG', 'RES-WH-FG-01']);
  const mergedResources = mergeById(value.resources, defaults.resources)
    .filter((item) => !isEastChina || defaultResources.has(item.id) || !legacyShanghaiResourceIds.has(item.id))
    .map((item) => {
      const canonical = defaultResources.get(item.id);
      return isEastChina && canonical ? { ...item, code: canonical.code, name: canonical.name, type: canonical.type, ownerOrgId: canonical.ownerOrgId, factoryOrgId: canonical.factoryOrgId, workshopOrgId: canonical.workshopOrgId, specification: canonical.specification } : item;
    });
  return {
    ...defaults,
    ...value,
    tenant: { ...defaults.tenant, ...value.tenant },
    capabilities: defaults.capabilities.map((item) => savedCapabilities.get(item.code) || item),
    orgUnits: mergedOrgUnits,
    resources: mergedResources,
    positions: mergeById(value.positions, defaults.positions),
    employees: mergeById(value.employees, defaults.employees),
    accounts: mergeById(value.accounts, defaults.accounts),
    roles: mergeById(value.roles, defaults.roles),
    permissions: mergeById(value.permissions, defaults.permissions),
    roleGrants: [...savedGrants, ...defaults.roleGrants.filter((item) => !grantKeys.has(`${item.roleId}:${item.permissionId}`))],
    adapters: mergeById(value.adapters, defaults.adapters),
    approvalRules: mergeById(value.approvalRules, defaults.approvalRules),
    dictionaries: mergeById(value.dictionaries, defaults.dictionaries),
    parameters: mergeById(value.parameters, defaults.parameters),
    audits: value.audits || defaults.audits,
  };
};

export const loadPlatformState = (tenant?: { id?: string; code?: string; name?: string }): PlatformState => {
  if (typeof window === 'undefined') return createPlatformSeed(tenant);
  try {
    const saved = window.localStorage.getItem(platformStorageKey(tenant?.id));
    return saved ? mergePlatformState(JSON.parse(saved), tenant) : createPlatformSeed(tenant);
  } catch {
    return createPlatformSeed(tenant);
  }
};

export const savePlatformState = (state: PlatformState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(platformStorageKey(state.tenant.id), JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(PLATFORM_STATE_CHANGED_EVENT, { detail: { tenantId: state.tenant.id, state } }));
};
