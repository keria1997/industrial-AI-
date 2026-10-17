import type { Account, Employee, Role } from './platformSeed';

export function normalizeAccountRole(value: { roleId?: unknown; directRoleIds?: unknown }) {
  if (value.directRoleIds !== undefined) return { roleId: '', roleIssue: '历史角色数据待修正' };
  return typeof value.roleId === 'string' && value.roleId.trim()
    ? { roleId: value.roleId.trim() }
    : { roleId: '', roleIssue: '未绑定角色' };
}

export function accountRoleLabel(account: Account, roles: Role[]) {
  return account.roleIssue || roles.find(role => role.id === account.roleId)?.name || '角色信息未提供';
}

export function validateEmployeeAccount(
  employee: Employee | undefined, roleId: string, accounts: Account[], roles: Role[], accountId?: string,
) {
  if (!employee || employee.status !== 'active') return '请选择一名在职员工';
  if (accounts.some(account => account.employeeId === employee.id && account.id !== accountId)) {
    return '一个员工只能拥有一个账号，请维护已有账号';
  }
  if (!roles.some(role => role.id === roleId && role.status === 'enabled')) return '请选择一个启用角色';
  return '';
}
