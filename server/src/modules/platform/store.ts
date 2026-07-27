import type {
  AccountDto,
  ApprovalRuleDto,
  AuditLogDto,
  AuditLogFilter,
  CapabilityDto,
  DictionaryDto,
  EmployeeDto,
  EnterpriseResourceDto,
  IdempotencyRecord,
  OrgUnitDto,
  ParameterDto,
  PermissionAdapterDto,
  PermissionResourceDto,
  PositionDto,
  RoleDto,
  RoleGrantDto,
  SessionRevocation,
  TenantDto,
} from "./types.js";

export interface PlatformStore {
  transaction<T>(work: (store: PlatformStore) => Promise<T>): Promise<T>;

  getTenant(tenantId: string): Promise<TenantDto | undefined>;
  saveTenant(tenant: TenantDto): Promise<void>;

  listOrgUnits(tenantId: string): Promise<OrgUnitDto[]>;
  getOrgUnit(tenantId: string, id: string): Promise<OrgUnitDto | undefined>;
  saveOrgUnit(orgUnit: OrgUnitDto): Promise<void>;
  deleteOrgUnit(tenantId: string, id: string): Promise<void>;

  listResources(tenantId: string): Promise<EnterpriseResourceDto[]>;
  saveResource(resource: EnterpriseResourceDto): Promise<void>;
  deleteResource(tenantId: string, id: string): Promise<void>;

  listPositions(tenantId: string): Promise<PositionDto[]>;
  savePosition(position: PositionDto): Promise<void>;
  deletePosition(tenantId: string, id: string): Promise<void>;

  listEmployees(tenantId: string): Promise<EmployeeDto[]>;
  saveEmployee(employee: EmployeeDto): Promise<void>;
  deleteEmployee(tenantId: string, id: string): Promise<void>;

  listAccounts(tenantId: string): Promise<AccountDto[]>;
  getAccountByLoginName(tenantId: string, loginName: string): Promise<AccountDto | undefined>;
  saveAccount(account: AccountDto): Promise<void>;
  deleteAccount(tenantId: string, id: string): Promise<void>;

  listRoles(tenantId: string): Promise<RoleDto[]>;
  saveRole(role: RoleDto): Promise<void>;
  deleteRole(tenantId: string, id: string): Promise<void>;

  listPermissions(tenantId: string): Promise<PermissionResourceDto[]>;
  savePermission(permission: PermissionResourceDto): Promise<void>;

  listRoleGrants(tenantId: string, roleId: string): Promise<RoleGrantDto[]>;
  saveRoleGrants(tenantId: string, roleId: string, grants: RoleGrantDto[]): Promise<void>;
  deleteRoleGrant(tenantId: string, roleId: string, permissionId: string): Promise<void>;

  listAdapters(tenantId: string): Promise<PermissionAdapterDto[]>;
  saveAdapter(adapter: PermissionAdapterDto): Promise<void>;
  deleteAdapter(tenantId: string, id: string): Promise<void>;

  listApprovalRules(tenantId: string): Promise<ApprovalRuleDto[]>;
  saveApprovalRule(rule: ApprovalRuleDto): Promise<void>;
  deleteApprovalRule(tenantId: string, id: string): Promise<void>;

  listDictionaries(tenantId: string): Promise<DictionaryDto[]>;
  saveDictionary(dict: DictionaryDto): Promise<void>;
  deleteDictionary(tenantId: string, id: string): Promise<void>;

  listParameters(tenantId: string): Promise<ParameterDto[]>;
  getParameter(tenantId: string, code: string): Promise<ParameterDto | undefined>;
  saveParameter(param: ParameterDto): Promise<void>;
  deleteParameter(tenantId: string, id: string): Promise<void>;

  listAuditLogs(tenantId: string, filter?: AuditLogFilter): Promise<AuditLogDto[]>;
  addAuditLog(log: AuditLogDto): Promise<void>;

  listCapabilities(tenantId: string): Promise<CapabilityDto[]>;
  saveCapability(capability: CapabilityDto): Promise<void>;

  addSessionRevocation(tenantId: string, revocation: SessionRevocation): Promise<void>;
  isSessionRevoked(tenantId: string, account: string, jti?: string): Promise<boolean>;

  getIdempotencyRecord(tenantId: string, commandType: string, key: string): Promise<IdempotencyRecord | undefined>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
}
