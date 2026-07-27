import { randomBytes, scryptSync } from "node:crypto";
import { ProductionError } from "../../errors.js";
import type { PlatformStore } from "./store.js";
import type {
  AccountDto, ApprovalRuleDto, AuditLogDto, AuditLogFilter, CapabilityDto, DictionaryDto,
  EmployeeDto, EnterpriseResourceDto, IdempotencyRecord, OrgUnitDto, ParameterDto,
  PermissionAdapterDto, PermissionResourceDto, PositionDto, RoleDto, RoleGrantDto,
  SessionRevocation, TenantDto,
} from "./types.js";

const entityKey = (tenantId: string, id: string) => `${tenantId}:${id}`;
const grantKey = (tenantId: string, roleId: string) => `${tenantId}:${roleId}`;
const clone = <T>(value: T): T => structuredClone(value);

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const verify = scryptSync(password, salt, 64).toString("hex");
  return verify === hash;
}

const SEED_PASSWORD_HASH = (() => {
  const salt = "seed-salt-v1";
  const hash = scryptSync("123456", salt, 64).toString("hex");
  return `${salt}:${hash}`;
})();

const SEED_TS = "2026-07-21T17:00:00.000Z";

type SeedBundle = {
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

function buildPermissions(tenantId: string): PermissionResourceDto[] {
  const defs: Array<Omit<PermissionResourceDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "PERM-PLATFORM", code: "platform", name: "平台管理菜单", module: "平台管理", type: "menu", risk: "normal" },
    { id: "PERM-ORG-VIEW", code: "platform.org.view", name: "组织架构查看", module: "平台管理", type: "page", risk: "normal" },
    { id: "PERM-ORG-MANAGE", code: "platform.org.manage", name: "组织架构维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-RESOURCE-MANAGE", code: "platform.resource.manage", name: "企业资源维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-POSITION-MANAGE", code: "platform.position.manage", name: "岗位维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-EMPLOYEE-MANAGE", code: "platform.employee.manage", name: "员工维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-ACCOUNT-MANAGE", code: "platform.account.manage", name: "账号维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-ACCOUNT-DISABLE", code: "platform.account.disable", name: "账号停用", module: "平台管理", type: "api", risk: "critical" },
    { id: "PERM-ROLE-MANAGE", code: "platform.role.manage", name: "角色维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-ROLE-GRANT", code: "platform.role.grant", name: "角色授权", module: "平台管理", type: "api", risk: "critical" },
    { id: "PERM-PREVIEW", code: "platform.permission.preview", name: "权限预览", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-ACTOR-VIEW", code: "platform.actor.view", name: "当前用户权限查看", module: "平台管理", type: "page", risk: "normal" },
    { id: "PERM-ADAPTER-MANAGE", code: "platform.adapter.manage", name: "权限适配器维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-ADAPTER", code: "platform.adapter.sync", name: "旧ERP权限同步", module: "平台管理", type: "api", risk: "critical" },
    { id: "PERM-APPROVAL-MANAGE", code: "platform.approval.manage", name: "审批规则维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-DICTIONARY-MANAGE", code: "platform.dictionary.manage", name: "字典维护", module: "平台管理", type: "button", risk: "normal" },
    { id: "PERM-PARAMETER-MANAGE", code: "platform.parameter.manage", name: "系统参数维护", module: "平台管理", type: "button", risk: "sensitive" },
    { id: "PERM-SECURITY-VIEW", code: "platform.security.view", name: "安全参数查看", module: "平台管理", type: "page", risk: "sensitive" },
    { id: "PERM-CAPABILITY-MANAGE", code: "platform.capability.manage", name: "能力开关维护", module: "平台管理", type: "button", risk: "critical" },
    { id: "PERM-SESSION-REVOKE", code: "platform.session.revoke", name: "会话撤销", module: "平台管理", type: "api", risk: "critical" },
    { id: "PERM-AUDIT", code: "platform.audit.view", name: "审计日志查看", module: "平台管理", type: "page", risk: "sensitive" },
    { id: "PERM-AUDIT-EXPORT", code: "platform.audit.export", name: "审计日志导出", module: "平台管理", type: "export", risk: "critical" },
    { id: "PERM-MPS", code: "production.mps.release", name: "主生产计划下达", module: "生产管理", type: "api", risk: "critical" },
    { id: "PERM-MRP", code: "production.mps.calcMrp", name: "MRP展算", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-VIEW", code: "production.view", name: "生产管理查看", module: "生产管理", type: "menu", risk: "normal" },
    { id: "PERM-PROD-MASTER", code: "production.master.manage", name: "生产主数据维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-DEMAND", code: "production.demand.manage", name: "生产需求维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-PLAN", code: "production.plan.manage", name: "生产计划维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-APS", code: "production.aps.manage", name: "APS排产维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-KITTING", code: "production.kitting.manage", name: "齐套与投料维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-EXECUTION", code: "production.execution.manage", name: "车间执行维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-QUALITY", code: "production.quality.manage", name: "生产质量维护", module: "生产管理", type: "button", risk: "sensitive" },
    { id: "PERM-PROD-COMPLETION", code: "production.completion.manage", name: "完工结案维护", module: "生产管理", type: "button", risk: "critical" },
    { id: "PERM-PROD-TASKS", code: "production.tasks.view", name: "生产任务中心查看", module: "生产管理", type: "page", risk: "sensitive" },
    { id: "PERM-STOCK-EXPORT", code: "inventory.stock.export", name: "库存导出", module: "库存管理", type: "export", risk: "sensitive" },
    { id: "PERM-COST", code: "finance.cost.costAmount", name: "成本金额", module: "财务管理", type: "field", risk: "critical" },
    { id: "PERM-RISK", code: "sales.customer.riskLevel", name: "客户风险等级", module: "销售管理", type: "field", risk: "sensitive" },
    { id: "PERM-SUP-ATT", code: "purchase.supplier.attachments", name: "供应商资质附件", module: "采购管理", type: "field", risk: "sensitive" },
    { id: "PERM-AI-RISK", code: "ai.customerRisk.query", name: "AI客户风险查询", module: "AI助手", type: "ai", risk: "critical" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildRoles(tenantId: string, isEastChina: boolean): RoleDto[] {
  const finishedWhId = isEastChina ? "RES-WH-FG-02" : "RES-WH-FG";
  const defs: Array<Omit<RoleDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "ROLE-ADMIN", code: "TENANT_ADMIN", name: "租户系统管理员", description: "管理当前租户平台底座与全部权限", dataScope: "tenant_all", scopeValues: [], status: "enabled" },
    { id: "ROLE-MFG", code: "PRODUCTION_DIRECTOR", name: "生产主管", description: "生产需求、计划、展算与工单管理", dataScope: "factory_set", scopeValues: ["ORG-FAC-01"], status: "enabled" },
    { id: "ROLE-WMS", code: "WAREHOUSE_ADMIN", name: "仓库管理员", description: "授权仓库的出入库与库存操作", dataScope: "warehouse_set", scopeValues: ["RES-WH-RM", finishedWhId], status: "enabled" },
    { id: "ROLE-SALE", code: "SALE_STAFF", name: "销售专员", description: "本人客户、报价和销售订单", dataScope: "customer_owner", scopeValues: [], status: "enabled" },
    { id: "ROLE-PUR", code: "PURCHASE_STAFF", name: "采购专员", description: "本人供应商与采购业务", dataScope: "supplier_buyer", scopeValues: [], status: "enabled" },
    { id: "ROLE-FIN", code: "FINANCE_STAFF", name: "财务专员", description: "应收应付、凭证和授权金额字段", dataScope: "org_tree", scopeValues: ["ORG-FIN"], status: "enabled" },
    { id: "ROLE-SHOP", code: "PRODUCTION_WORKSHOP", name: "车间执行人员", description: "授权工厂的工单执行、报工、质量与完工", dataScope: "factory_set", scopeValues: ["ORG-FAC-01"], status: "enabled" },
    { id: "ROLE-PROD-VIEW", code: "PRODUCTION_VIEWER", name: "生产只读人员", description: "只查看授权工厂的生产业务数据", dataScope: "factory_set", scopeValues: ["ORG-FAC-01"], status: "enabled" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildOrgUnits(tenantId: string, tenantName: string, isEastChina: boolean): OrgUnitDto[] {
  const defs: Array<Omit<OrgUnitDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "ORG-ROOT", code: isEastChina ? "ORG-HDJG" : "ORG-ROOT", name: tenantName, type: "company", parentId: null, managerEmployeeId: "EMP-001", status: "enabled" },
    { id: "ORG-SALE", code: "DEPT-SALE", name: "销售中心", type: "department", parentId: "ORG-ROOT", managerEmployeeId: "EMP-002", status: "enabled" },
    { id: "ORG-MFG", code: "DEPT-MFG", name: "智能制造部", type: "department", parentId: "ORG-ROOT", managerEmployeeId: "EMP-003", status: "enabled" },
    { id: "ORG-SCM", code: "DEPT-SCM", name: "供应链协同部", type: "department", parentId: "ORG-ROOT", managerEmployeeId: "EMP-004", status: "enabled" },
    { id: "ORG-FIN", code: "DEPT-FIN", name: "财务结算部", type: "department", parentId: "ORG-ROOT", managerEmployeeId: "EMP-005", status: "enabled" },
    { id: "ORG-FAC-01", code: isEastChina ? "FAC-SZ-01" : "FAC-SH-01", name: isEastChina ? "华东精工制造工厂" : "万申智能制造一厂", type: "factory", parentId: "ORG-MFG", managerEmployeeId: "EMP-003", status: "enabled" },
    { id: "ORG-WS-SMT", code: "WS-SMT", name: "SMT贴片车间", type: "workshop", parentId: "ORG-FAC-01", managerEmployeeId: "EMP-003", status: "enabled" },
    { id: "ORG-WS-ASSY", code: "WS-ASSY", name: "总装车间", type: "workshop", parentId: "ORG-FAC-01", managerEmployeeId: "EMP-006", status: "enabled" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildResources(tenantId: string, isEastChina: boolean): EnterpriseResourceDto[] {
  const defs: Array<Omit<EnterpriseResourceDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "RES-LINE-01", code: isEastChina ? "LINE-SMT-02" : "LINE-SMT-01", name: isEastChina ? "SMT二线" : "SMT一线", type: "line", ownerOrgId: "ORG-WS-SMT", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-SMT", managerEmployeeId: "EMP-003", specification: isEastChina ? "760 PCS/日" : "1200 PCS/日", status: "enabled" },
    { id: "RES-LINE-02", code: isEastChina ? "LINE-ASSY-02" : "LINE-SMT-02", name: isEastChina ? "总装二线" : "SMT二线", type: "line", ownerOrgId: isEastChina ? "ORG-WS-ASSY" : "ORG-WS-SMT", factoryOrgId: "ORG-FAC-01", workshopOrgId: isEastChina ? "ORG-WS-ASSY" : "ORG-WS-SMT", managerEmployeeId: "EMP-003", specification: isEastChina ? "280 台/日" : "980 PCS/日", status: "enabled" },
    ...(!isEastChina ? [{ id: "RES-LINE-03", code: "LINE-ASSY-01", name: "总装一线", type: "line" as const, ownerOrgId: "ORG-WS-ASSY", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-ASSY", managerEmployeeId: "EMP-006", specification: "360 台/日", status: "enabled" as const }] : []),
    { id: "RES-WH-RM", code: isEastChina ? "WH-RM-02" : "WH-RM-01", name: isEastChina ? "华东原材料仓" : "一号原材料仓", type: "warehouse", ownerOrgId: "ORG-SCM", factoryOrgId: "ORG-FAC-01", workshopOrgId: null, managerEmployeeId: "EMP-004", specification: "原材料仓", status: "enabled" },
    { id: "RES-WH-WIP", code: isEastChina ? "WH-WIP-02" : "WH-WIP-01", name: "线边暂存仓", type: "warehouse", ownerOrgId: "ORG-WS-SMT", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-SMT", managerEmployeeId: "EMP-004", specification: "线边仓", status: "enabled" },
    { id: isEastChina ? "RES-WH-FG-02" : "RES-WH-FG", code: isEastChina ? "WH-FG-02" : "WH-FG-01", name: isEastChina ? "华东成品仓" : "成品主仓", type: "warehouse", ownerOrgId: "ORG-SCM", factoryOrgId: "ORG-FAC-01", workshopOrgId: null, managerEmployeeId: "EMP-004", specification: "成品仓", status: "enabled" },
    { id: "RES-WC-SMT", code: isEastChina ? "SMT-02" : "SMT-01", name: "SMT贴片工作中心", type: "work_center", ownerOrgId: "ORG-WS-SMT", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-SMT", managerEmployeeId: "EMP-003", specification: "贴片、回流焊", status: "enabled" },
    { id: "RES-WC-ASSY", code: isEastChina ? "ASSY-02" : "ASSY-01", name: "总装工作中心", type: "work_center", ownerOrgId: "ORG-WS-ASSY", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-ASSY", managerEmployeeId: "EMP-006", specification: "装配、测试", status: "enabled" },
    ...(!isEastChina ? [{ id: "RES-WC-TEST", code: "TEST-01", name: "功能测试工作中心", type: "work_center" as const, ownerOrgId: "ORG-WS-ASSY", factoryOrgId: "ORG-FAC-01", workshopOrgId: "ORG-WS-ASSY", managerEmployeeId: "EMP-006", specification: "功能测试", status: "enabled" as const }] : []),
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildPositions(tenantId: string, isEastChina: boolean): PositionDto[] {
  const mfgResourceIds = isEastChina ? ["RES-LINE-01", "RES-LINE-02"] : ["RES-LINE-01", "RES-LINE-02", "RES-LINE-03"];
  const wmsResourceIds = isEastChina ? ["RES-WH-RM", "RES-WH-WIP", "RES-WH-FG-02"] : ["RES-WH-RM", "RES-WH-WIP", "RES-WH-FG"];
  const defs: Array<Omit<PositionDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "POS-ADMIN", code: "POS-ADMIN", name: "租户管理员", orgId: "ORG-ROOT", defaultRoleIds: ["ROLE-ADMIN"], resourceIds: [], status: "enabled" },
    { id: "POS-SALE", code: "POS-SALE-MGR", name: "销售经理", orgId: "ORG-SALE", defaultRoleIds: ["ROLE-SALE"], resourceIds: [], status: "enabled" },
    { id: "POS-MFG", code: "POS-MFG-PLAN", name: "生产计划主管", orgId: "ORG-MFG", defaultRoleIds: ["ROLE-MFG"], resourceIds: mfgResourceIds, status: "enabled" },
    { id: "POS-WMS", code: "POS-WMS-LEAD", name: "仓库主管", orgId: "ORG-SCM", defaultRoleIds: ["ROLE-WMS"], resourceIds: wmsResourceIds, status: "enabled" },
    { id: "POS-FIN", code: "POS-FIN-ARAP", name: "财务会计", orgId: "ORG-FIN", defaultRoleIds: ["ROLE-FIN"], resourceIds: [], status: "enabled" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildEmployees(tenantId: string): EmployeeDto[] {
  const defs: Array<Omit<EmployeeDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "EMP-001", employeeNo: "OP-001", name: "操作员 01", primaryOrgId: "ORG-ROOT", primaryPositionId: "POS-ADMIN", mobile: "138****0001", email: "admin@nexus.ai", status: "active" },
    { id: "EMP-002", employeeNo: "SA-018", name: "销售主管", primaryOrgId: "ORG-SALE", primaryPositionId: "POS-SALE", mobile: "138****0018", email: "sales@nexus.ai", status: "active" },
    { id: "EMP-003", employeeNo: "MF-026", name: "生产计划员", primaryOrgId: "ORG-MFG", primaryPositionId: "POS-MFG", mobile: "138****0026", email: "plan@nexus.ai", status: "active" },
    { id: "EMP-004", employeeNo: "SC-011", name: "采购专员", primaryOrgId: "ORG-SCM", primaryPositionId: "POS-WMS", mobile: "138****0011", email: "purchase@nexus.ai", status: "active" },
    { id: "EMP-005", employeeNo: "FI-009", name: "财务会计", primaryOrgId: "ORG-FIN", primaryPositionId: "POS-FIN", mobile: "138****0009", email: "finance@nexus.ai", status: "active" },
    { id: "EMP-006", employeeNo: "MF-031", name: "王建国", primaryOrgId: "ORG-WS-ASSY", primaryPositionId: "POS-MFG", mobile: "138****0031", email: "wangjg@nexus.ai", status: "active" },
    { id: "EMP-007", employeeNo: "HR-014", name: "李雯", primaryOrgId: "ORG-ROOT", primaryPositionId: "POS-ADMIN", mobile: "138****0014", email: "liwen@nexus.ai", status: "active" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildAccounts(tenantId: string): AccountDto[] {
  const defs: Array<Omit<AccountDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "ACC-ADMIN", loginName: "admin", employeeId: "EMP-001", authType: "legacy_erp", status: "enabled", directRoleIds: ["ROLE-ADMIN"], passwordHash: SEED_PASSWORD_HASH, lastLoginAt: "2026-07-21 17:52:10" },
    { id: "ACC-SALE", loginName: "sale_lead", employeeId: "EMP-002", authType: "password", status: "enabled", directRoleIds: [], passwordHash: SEED_PASSWORD_HASH, lastLoginAt: "2026-07-21 16:41:28" },
    { id: "ACC-MFG", loginName: "mfg_plan", employeeId: "EMP-003", authType: "legacy_erp", status: "enabled", directRoleIds: [], passwordHash: SEED_PASSWORD_HASH, lastLoginAt: "2026-07-21 15:33:05" },
    { id: "ACC-PUR", loginName: "purchase_01", employeeId: "EMP-004", authType: "password", status: "enabled", directRoleIds: ["ROLE-PUR"], passwordHash: SEED_PASSWORD_HASH, lastLoginAt: "2026-07-21 14:20:11" },
    { id: "ACC-FIN", loginName: "fin_ar", employeeId: "EMP-005", authType: "password", status: "locked", directRoleIds: [], passwordHash: SEED_PASSWORD_HASH, lastLoginAt: "2026-07-20 17:05:42" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildRoleGrants(tenantId: string, permissions: PermissionResourceDto[]): RoleGrantDto[] {
  const grants: Array<Omit<RoleGrantDto, "tenantId" | "version" | "updatedAt">> = [];
  for (const perm of permissions) {
    grants.push({ roleId: "ROLE-ADMIN", permissionId: perm.id, effect: "allow" });
  }
  grants.push({ roleId: "ROLE-MFG", permissionId: "PERM-MPS", effect: "allow" });
  grants.push({ roleId: "ROLE-MFG", permissionId: "PERM-MRP", effect: "allow" });
  grants.push({ roleId: "ROLE-MFG", permissionId: "PERM-COST", effect: "deny", fieldMode: "hidden" });
  for (const pid of ["PERM-PROD-VIEW", "PERM-PROD-MASTER", "PERM-PROD-DEMAND", "PERM-PROD-PLAN", "PERM-PROD-APS", "PERM-PROD-KITTING", "PERM-PROD-EXECUTION", "PERM-PROD-QUALITY", "PERM-PROD-COMPLETION"]) {
    grants.push({ roleId: "ROLE-MFG", permissionId: pid, effect: "allow" });
  }
  for (const pid of ["PERM-PROD-VIEW", "PERM-PROD-EXECUTION", "PERM-PROD-QUALITY", "PERM-PROD-COMPLETION"]) {
    grants.push({ roleId: "ROLE-SHOP", permissionId: pid, effect: "allow" });
  }
  grants.push({ roleId: "ROLE-PROD-VIEW", permissionId: "PERM-PROD-VIEW", effect: "allow" });
  grants.push({ roleId: "ROLE-WMS", permissionId: "PERM-STOCK-EXPORT", effect: "allow" });
  grants.push({ roleId: "ROLE-WMS", permissionId: "PERM-PROD-VIEW", effect: "allow" });
  grants.push({ roleId: "ROLE-WMS", permissionId: "PERM-PROD-KITTING", effect: "allow" });
  grants.push({ roleId: "ROLE-SALE", permissionId: "PERM-RISK", effect: "allow", fieldMode: "masked" });
  grants.push({ roleId: "ROLE-PUR", permissionId: "PERM-SUP-ATT", effect: "allow", fieldMode: "visible" });
  grants.push({ roleId: "ROLE-FIN", permissionId: "PERM-COST", effect: "allow", fieldMode: "visible" });
  return grants.map((g) => ({ ...g, tenantId, version: 1, updatedAt: SEED_TS }));
}

function buildAdapters(tenantId: string): PermissionAdapterDto[] {
  const defs: Array<Omit<PermissionAdapterDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "ADP-001", permissionCode: "production.demandPool.createMps", permissionName: "生产需求池生成MPS", module: "生产管理", legacyRoleCode: "PRODUCTION_DIRECTOR", legacyScope: "production_org", status: "synced", lastSyncAt: "2026-07-21 14:21:05", errorMessage: "" },
    { id: "ADP-002", permissionCode: "production.mps.calcMrp", permissionName: "MPS推入MRP展算", module: "生产管理", legacyRoleCode: "PRODUCTION_DIRECTOR", legacyScope: "production_org", status: "synced", lastSyncAt: "2026-07-21 14:21:07", errorMessage: "" },
    { id: "ADP-003", permissionCode: "platform.org.manage", permissionName: "组织架构维护", module: "平台管理", legacyRoleCode: "TENANT_ADMIN", legacyScope: "tenant_all", status: "synced", lastSyncAt: "2026-07-21 14:21:10", errorMessage: "" },
    { id: "ADP-004", permissionCode: "platform.resource.manage", permissionName: "企业资源维护", module: "平台管理", legacyRoleCode: "TENANT_ADMIN", legacyScope: "tenant_all", status: "pending_sync", lastSyncAt: null, errorMessage: "" },
    { id: "ADP-005", permissionCode: "platform.account.disable", permissionName: "账号停用", module: "平台管理", legacyRoleCode: "TENANT_ADMIN", legacyScope: "tenant_all", status: "conflict", lastSyncAt: null, errorMessage: "旧 ERP 中存在同编码资源，但资源类型不同" },
    { id: "ADP-006", permissionCode: "ai.customerRisk.query", permissionName: "AI客户风险查询", module: "AI助手", legacyRoleCode: "RISK_VIEWER", legacyScope: "customer_org_tree", status: "failed", lastSyncAt: null, errorMessage: "旧角色 RISK_VIEWER 不存在" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildApprovalRules(tenantId: string): ApprovalRuleDto[] {
  const defs: Array<Omit<ApprovalRuleDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "APR-001", module: "销售管理", documentType: "销售订单", resolver: "by_role", resolverValue: "ROLE-SALE", fallback: "block", status: "enabled" },
    { id: "APR-002", module: "采购管理", documentType: "采购申请", resolver: "by_org_manager", resolverValue: "ORG-SCM", fallback: "unassigned_pool", status: "enabled" },
    { id: "APR-003", module: "平台管理", documentType: "员工离职", resolver: "by_role", resolverValue: "ROLE-ADMIN", fallback: "tenant_admin", status: "enabled" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildDictionaries(tenantId: string): DictionaryDto[] {
  const defs: Array<Omit<DictionaryDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "DICT-001", category: "组织类型", code: "company", name: "公司", status: "enabled" },
    { id: "DICT-002", category: "组织类型", code: "department", name: "部门", status: "enabled" },
    { id: "DICT-003", category: "仓库类型", code: "raw_material", name: "原材料仓", status: "enabled" },
    { id: "DICT-004", category: "仓库类型", code: "line_side", name: "线边仓", status: "enabled" },
    { id: "DICT-005", category: "账号状态", code: "locked", name: "锁定", status: "enabled" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildParameters(tenantId: string): ParameterDto[] {
  const defs: Array<Omit<ParameterDto, "tenantId" | "version" | "createdAt" | "updatedAt">> = [
    { id: "PAR-001", code: "security.login.maxFailures", name: "登录失败锁定次数", value: "5", valueType: "integer", effectiveMode: "immediate" },
    { id: "PAR-002", code: "security.session.hours", name: "会话有效期（小时）", value: "8", valueType: "integer", effectiveMode: "next_login" },
    { id: "PAR-003", code: "security.password.minLength", name: "密码最小长度", value: "8", valueType: "integer", effectiveMode: "immediate" },
    { id: "PAR-004", code: "approval.timeout.hours", name: "审批超时提醒（小时）", value: "2", valueType: "integer", effectiveMode: "immediate" },
    { id: "PAR-005", code: "supplier.attachment.required", name: "供应商资质默认必填", value: "false", valueType: "boolean", effectiveMode: "immediate" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, createdAt: SEED_TS, updatedAt: SEED_TS }));
}

function buildAuditLogs(tenantId: string): AuditLogDto[] {
  const defs: Array<Omit<AuditLogDto, "tenantId">> = [
    { id: "AUD-001", time: "2026-07-21 17:18:21", operator: "操作员 01", module: "平台管理", action: "修改角色授权", target: "生产主管 / MRP展算", result: "success", traceId: "TRACE-20260721-0018" },
    { id: "AUD-002", time: "2026-07-21 16:08:04", operator: "财务会计", module: "财务管理", action: "导出应收账款", target: "AR-2607-001", result: "success", traceId: "TRACE-20260721-0017" },
    { id: "AUD-003", time: "2026-07-21 15:40:18", operator: "AI助手", module: "AI助手", action: "客户风险查询", target: "无风险字段权限", result: "denied", traceId: "TRACE-20260721-0016" },
    { id: "AUD-004", time: "2026-07-21 14:21:10", operator: "操作员 01", module: "平台管理", action: "同步权限适配", target: "platform.org.manage", result: "success", traceId: "TRACE-20260721-0015" },
    { id: "AUD-005", time: "2026-07-20 17:05:42", operator: "fin_ar", module: "账号安全", action: "连续密码错误", target: "fin_ar", result: "failed", traceId: "TRACE-20260720-0099" },
  ];
  return defs.map((d) => ({ ...d, tenantId }));
}

function buildCapabilities(tenantId: string): CapabilityDto[] {
  const defs: Array<Omit<CapabilityDto, "tenantId" | "version" | "updatedAt">> = [
    { code: "sales", name: "销售管理", enabled: true, quota: "不限", used: "运行正常" },
    { code: "production", name: "生产管理", enabled: true, quota: "不限", used: "运行正常" },
    { code: "inventory", name: "库存管理", enabled: true, quota: "不限", used: "运行正常" },
    { code: "purchase", name: "采购管理", enabled: true, quota: "不限", used: "运行正常" },
    { code: "finance", name: "财务管理", enabled: true, quota: "不限", used: "运行正常" },
    { code: "messageCenter", name: "消息中心", enabled: true, quota: "20万条/月", used: "31%" },
    { code: "aiAssistant", name: "AI助手", enabled: true, quota: "5000次/月", used: "820次" },
  ];
  return defs.map((d) => ({ ...d, tenantId, version: 1, updatedAt: SEED_TS }));
}

function buildSeed(tenant: { id: string; code: string; name: string }): SeedBundle {
  const isEastChina = tenant.id === "TENANT-HDJG";
  const tenantId = tenant.id;
  const permissions = buildPermissions(tenantId);
  const roles = buildRoles(tenantId, isEastChina);
  const orgUnits = buildOrgUnits(tenantId, tenant.name, isEastChina);
  const resources = buildResources(tenantId, isEastChina);
  const positions = buildPositions(tenantId, isEastChina);
  const employees = buildEmployees(tenantId);
  const accounts = buildAccounts(tenantId);
  const roleGrants = buildRoleGrants(tenantId, permissions);
  const adapters = buildAdapters(tenantId);
  const approvalRules = buildApprovalRules(tenantId);
  const dictionaries = buildDictionaries(tenantId);
  const parameters = buildParameters(tenantId);
  const auditLogs = buildAuditLogs(tenantId);
  const capabilities = buildCapabilities(tenantId);
  const tenantDto: TenantDto = {
    id: tenantId, code: tenant.code, name: tenant.name, edition: "工业旗舰版", status: "running",
    bootstrapOwnerAccountId: "ACC-ADMIN", formalAdminAccountId: "ACC-ADMIN", expireAt: "2027-06-22",
    version: 1, updatedAt: SEED_TS,
  };
  return { tenant: tenantDto, capabilities, orgUnits, resources, positions, employees, accounts, roles, permissions, roleGrants, adapters, approvalRules, dictionaries, parameters, auditLogs };
}

type State = {
  tenants: Map<string, TenantDto>;
  orgUnits: Map<string, OrgUnitDto>;
  resources: Map<string, EnterpriseResourceDto>;
  positions: Map<string, PositionDto>;
  employees: Map<string, EmployeeDto>;
  accounts: Map<string, AccountDto>;
  roles: Map<string, RoleDto>;
  permissions: Map<string, PermissionResourceDto>;
  roleGrants: Map<string, RoleGrantDto[]>;
  adapters: Map<string, PermissionAdapterDto>;
  approvalRules: Map<string, ApprovalRuleDto>;
  dictionaries: Map<string, DictionaryDto>;
  parameters: Map<string, ParameterDto>;
  auditLogs: AuditLogDto[];
  capabilities: Map<string, CapabilityDto>;
  sessionRevocations: SessionRevocation[];
  idempotency: Map<string, IdempotencyRecord>;
};

const cloneState = (state: State): State => ({
  tenants: clone(state.tenants),
  orgUnits: clone(state.orgUnits),
  resources: clone(state.resources),
  positions: clone(state.positions),
  employees: clone(state.employees),
  accounts: clone(state.accounts),
  roles: clone(state.roles),
  permissions: clone(state.permissions),
  roleGrants: clone(state.roleGrants),
  adapters: clone(state.adapters),
  approvalRules: clone(state.approvalRules),
  dictionaries: clone(state.dictionaries),
  parameters: clone(state.parameters),
  auditLogs: clone(state.auditLogs),
  capabilities: clone(state.capabilities),
  sessionRevocations: clone(state.sessionRevocations),
  idempotency: clone(state.idempotency),
});

export class InMemoryPlatformStore implements PlatformStore {
  private state: State = {
    tenants: new Map(), orgUnits: new Map(), resources: new Map(), positions: new Map(),
    employees: new Map(), accounts: new Map(), roles: new Map(), permissions: new Map(),
    roleGrants: new Map(), adapters: new Map(), approvalRules: new Map(), dictionaries: new Map(),
    parameters: new Map(), auditLogs: [], capabilities: new Map(), sessionRevocations: [], idempotency: new Map(),
  };
  private queue: Promise<void> = Promise.resolve();

  constructor() {
    this.loadSeed(buildSeed({ id: "TENANT-SHWS", code: "SHWS", name: "上海万申工业集团" }));
    this.loadSeed(buildSeed({ id: "TENANT-HDJG", code: "HDJG", name: "华东精工有限公司" }));
  }

  private loadSeed(bundle: SeedBundle) {
    this.state.tenants.set(bundle.tenant.id, clone(bundle.tenant));
    for (const item of bundle.capabilities) this.state.capabilities.set(entityKey(item.tenantId, item.code), clone(item));
    for (const item of bundle.orgUnits) this.state.orgUnits.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.resources) this.state.resources.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.positions) this.state.positions.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.employees) this.state.employees.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.accounts) this.state.accounts.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.roles) this.state.roles.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.permissions) this.state.permissions.set(entityKey(item.tenantId, item.id), clone(item));
    const grantsByRole = new Map<string, RoleGrantDto[]>();
    for (const item of bundle.roleGrants) {
      const key = grantKey(item.tenantId, item.roleId);
      const list = grantsByRole.get(key) ?? [];
      list.push(clone(item));
      grantsByRole.set(key, list);
    }
    for (const [key, list] of grantsByRole) this.state.roleGrants.set(key, clone(list));
    for (const item of bundle.adapters) this.state.adapters.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.approvalRules) this.state.approvalRules.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.dictionaries) this.state.dictionaries.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.parameters) this.state.parameters.set(entityKey(item.tenantId, item.id), clone(item));
    for (const item of bundle.auditLogs) this.state.auditLogs.push(clone(item));
  }

  async transaction<T>(work: (store: PlatformStore) => Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    const before = cloneState(this.state);
    try { return await work(this); }
    catch (error) { this.state = before; throw error; }
    finally { release(); }
  }

  async getTenant(tenantId: string) { return clone(this.state.tenants.get(tenantId)); }
  async saveTenant(tenant: TenantDto) { this.state.tenants.set(tenant.id, clone(tenant)); }

  async listOrgUnits(tenantId: string) { return clone([...this.state.orgUnits.values()].filter((i) => i.tenantId === tenantId)); }
  async getOrgUnit(tenantId: string, id: string) { return clone(this.state.orgUnits.get(entityKey(tenantId, id))); }
  async saveOrgUnit(orgUnit: OrgUnitDto) { this.state.orgUnits.set(entityKey(orgUnit.tenantId, orgUnit.id), clone(orgUnit)); }
  async deleteOrgUnit(tenantId: string, id: string) { this.state.orgUnits.delete(entityKey(tenantId, id)); }

  async listResources(tenantId: string) { return clone([...this.state.resources.values()].filter((i) => i.tenantId === tenantId)); }
  async saveResource(resource: EnterpriseResourceDto) { this.state.resources.set(entityKey(resource.tenantId, resource.id), clone(resource)); }
  async deleteResource(tenantId: string, id: string) { this.state.resources.delete(entityKey(tenantId, id)); }

  async listPositions(tenantId: string) { return clone([...this.state.positions.values()].filter((i) => i.tenantId === tenantId)); }
  async savePosition(position: PositionDto) { this.state.positions.set(entityKey(position.tenantId, position.id), clone(position)); }
  async deletePosition(tenantId: string, id: string) { this.state.positions.delete(entityKey(tenantId, id)); }

  async listEmployees(tenantId: string) { return clone([...this.state.employees.values()].filter((i) => i.tenantId === tenantId)); }
  async saveEmployee(employee: EmployeeDto) { this.state.employees.set(entityKey(employee.tenantId, employee.id), clone(employee)); }
  async deleteEmployee(tenantId: string, id: string) { this.state.employees.delete(entityKey(tenantId, id)); }

  async listAccounts(tenantId: string) { return clone([...this.state.accounts.values()].filter((i) => i.tenantId === tenantId)); }
  async getAccountByLoginName(tenantId: string, loginName: string) { return clone([...this.state.accounts.values()].find((i) => i.tenantId === tenantId && i.loginName === loginName)); }
  async saveAccount(account: AccountDto) { this.state.accounts.set(entityKey(account.tenantId, account.id), clone(account)); }
  async deleteAccount(tenantId: string, id: string) { this.state.accounts.delete(entityKey(tenantId, id)); }

  async listRoles(tenantId: string) { return clone([...this.state.roles.values()].filter((i) => i.tenantId === tenantId)); }
  async saveRole(role: RoleDto) { this.state.roles.set(entityKey(role.tenantId, role.id), clone(role)); }
  async deleteRole(tenantId: string, id: string) { this.state.roles.delete(entityKey(tenantId, id)); }

  async listPermissions(tenantId: string) { return clone([...this.state.permissions.values()].filter((i) => i.tenantId === tenantId)); }
  async savePermission(permission: PermissionResourceDto) { this.state.permissions.set(entityKey(permission.tenantId, permission.id), clone(permission)); }

  async listRoleGrants(tenantId: string, roleId: string) { return clone(this.state.roleGrants.get(grantKey(tenantId, roleId)) ?? []); }
  async saveRoleGrants(tenantId: string, roleId: string, grants: RoleGrantDto[]) { this.state.roleGrants.set(grantKey(tenantId, roleId), clone(grants)); }
  async deleteRoleGrant(tenantId: string, roleId: string, permissionId: string) {
    const key = grantKey(tenantId, roleId);
    const list = this.state.roleGrants.get(key) ?? [];
    this.state.roleGrants.set(key, list.filter((g) => g.permissionId !== permissionId));
  }

  async listAdapters(tenantId: string) { return clone([...this.state.adapters.values()].filter((i) => i.tenantId === tenantId)); }
  async saveAdapter(adapter: PermissionAdapterDto) { this.state.adapters.set(entityKey(adapter.tenantId, adapter.id), clone(adapter)); }
  async deleteAdapter(tenantId: string, id: string) { this.state.adapters.delete(entityKey(tenantId, id)); }

  async listApprovalRules(tenantId: string) { return clone([...this.state.approvalRules.values()].filter((i) => i.tenantId === tenantId)); }
  async saveApprovalRule(rule: ApprovalRuleDto) { this.state.approvalRules.set(entityKey(rule.tenantId, rule.id), clone(rule)); }
  async deleteApprovalRule(tenantId: string, id: string) { this.state.approvalRules.delete(entityKey(tenantId, id)); }

  async listDictionaries(tenantId: string) { return clone([...this.state.dictionaries.values()].filter((i) => i.tenantId === tenantId)); }
  async saveDictionary(dict: DictionaryDto) { this.state.dictionaries.set(entityKey(dict.tenantId, dict.id), clone(dict)); }
  async deleteDictionary(tenantId: string, id: string) { this.state.dictionaries.delete(entityKey(tenantId, id)); }

  async listParameters(tenantId: string) { return clone([...this.state.parameters.values()].filter((i) => i.tenantId === tenantId)); }
  async getParameter(tenantId: string, code: string) { return clone([...this.state.parameters.values()].find((i) => i.tenantId === tenantId && i.code === code)); }
  async saveParameter(param: ParameterDto) { this.state.parameters.set(entityKey(param.tenantId, param.id), clone(param)); }
  async deleteParameter(tenantId: string, id: string) { this.state.parameters.delete(entityKey(tenantId, id)); }

  async listAuditLogs(tenantId: string, filter?: AuditLogFilter) {
    let items = this.state.auditLogs.filter((i) => i.tenantId === tenantId);
    if (filter?.module) items = items.filter((i) => i.module === filter.module);
    if (filter?.result) items = items.filter((i) => i.result === filter.result);
    if (filter?.operator) items = items.filter((i) => i.operator.includes(filter.operator!));
    if (filter?.startTime) items = items.filter((i) => i.time >= filter.startTime!);
    if (filter?.endTime) items = items.filter((i) => i.time <= filter.endTime!);
    const sorted = [...items].sort((a, b) => b.time.localeCompare(a.time));
    const page = filter?.page ?? 1;
    const pageSize = filter?.pageSize ?? 50;
    const start = (page - 1) * pageSize;
    return clone(sorted.slice(start, start + pageSize));
  }
  async addAuditLog(log: AuditLogDto) { this.state.auditLogs.push(clone(log)); }

  async listCapabilities(tenantId: string) { return clone([...this.state.capabilities.values()].filter((i) => i.tenantId === tenantId)); }
  async saveCapability(capability: CapabilityDto) { this.state.capabilities.set(entityKey(capability.tenantId, capability.code), clone(capability)); }

  async addSessionRevocation(_tenantId: string, revocation: SessionRevocation) { this.state.sessionRevocations.push(clone(revocation)); }
  async isSessionRevoked(tenantId: string, account: string, jti: string) {
    return this.state.sessionRevocations.some((r) => r.tenantId === tenantId && r.account === account && r.jti === jti);
  }

  async getIdempotencyRecord(tenantId: string, commandType: string, key: string) { return clone(this.state.idempotency.get(`${tenantId}:${commandType}:${key}`)); }
  async saveIdempotencyRecord(record: IdempotencyRecord) { this.state.idempotency.set(`${record.tenantId}:${record.commandType}:${record.key}`, clone(record)); }

  snapshot() { return cloneState(this.state); }
}
