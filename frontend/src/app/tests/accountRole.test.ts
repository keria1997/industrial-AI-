import { afterEach, describe, expect, it, vi } from 'vitest';
import { accountRoleLabel, normalizeAccountRole, validateEmployeeAccount } from '../../platform/accountRole';
import { getPlatformActorRoleIds, loadPlatformState } from '../../platform/platformSeed';
import { persistPlatformChange } from '../../platform/persistPlatformChange';
import type { Account, Employee, Role } from '../../platform/platformSeed';

const employee: Employee = { id: 'employee', name: '员工', employeeNo: 'EMP-1', primaryOrgId: 'org', mobile: '', email: '', status: 'active' };
const role: Role = { id: 'role', name: '销售', code: 'SALES', status: 'enabled', description: '', dataScope: 'org_tree', scopeValues: ['org'] };
const account: Account = { id: 'account', employeeId: employee.id, loginName: 'employee', roleId: role.id, authType: 'password', status: 'enabled', lastLoginAt: '-' };
afterEach(() => vi.restoreAllMocks());

describe('one employee, one account, one direct role', () => {
  it('requires an explicit scalar role and rejects ambiguous legacy arrays', () => {
    expect(normalizeAccountRole({ roleId: ' role ' })).toEqual({ roleId: 'role' });
    for (const value of [{}, { roleId: [] }, { roleId: '' }]) {
      expect(normalizeAccountRole(value).roleIssue).toBe('未绑定角色');
    }
    for (const directRoleIds of [[], ['role'], ['role', 'another']]) {
      expect(normalizeAccountRole({ directRoleIds, roleId: 'role' })).toEqual({ roleId: '', roleIssue: '历史角色数据待修正' });
    }
  });

  it('blocks a second account even if the existing account is disabled', () => {
    expect(validateEmployeeAccount(employee, role.id, [{ ...account, status: 'disabled' }], [role])).toContain('只能拥有一个账号');
    expect(validateEmployeeAccount(employee, role.id, [account], [role], account.id)).toBe('');
    expect(validateEmployeeAccount({ ...employee, status: 'resigned' }, role.id, [], [role])).toContain('在职员工');
    expect(validateEmployeeAccount(employee, role.id, [], [{ ...role, status: 'disabled' }])).toContain('启用角色');
  });

  it('uses the direct account role and never grants another role from the display group', () => {
    const snapshot = { ...loadPlatformState(), employees: [employee], roles: [role], accounts: [account] };
    expect(getPlatformActorRoleIds(snapshot, { account: 'employee' }, '老板')).toEqual(['role']);
    expect(getPlatformActorRoleIds({ ...snapshot, accounts: [{ ...account, roleId: '' }] }, { account: 'employee' }, '老板')).toEqual([]);
    expect(getPlatformActorRoleIds({ ...snapshot, accounts: [account, { ...account, id: 'duplicate', status: 'disabled' }] }, { account: 'employee' })).toEqual([]);
    expect(accountRoleLabel({ ...account, roleIssue: '历史角色数据待修正' }, [role])).toBe('历史角色数据待修正');
    expect(accountRoleLabel({ ...account, roleId: 'unknown' }, [role])).toBe('角色信息未提供');
  });

  it('writes one scalar role with the server version and strips legacy/UI fields', async () => {
    const before = { ...loadPlatformState(), employees: [employee], roles: [role], accounts: [{ ...account, version: 3, roleIssue: '历史角色数据待修正' }] };
    const after = { ...before, accounts: [{ ...before.accounts[0], roleIssue: undefined, primaryPositionId: 'old', directRoleIds: ['old'] }] };
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
    await persistPlatformChange({ tenantId: 'tenant', accessToken: 'test' }, before, after);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/platform/accounts/account');
    expect(options).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"3"' } });
    const payload = JSON.parse(String(options?.body));
    expect(payload.roleId).toBe('role');
    expect(payload).not.toHaveProperty('roleIssue');
    expect(payload).not.toHaveProperty('directRoleIds');
    expect(payload).not.toHaveProperty('primaryPositionId');
  });

  it('rejects duplicate bindings without making an API request', async () => {
    const before = { ...loadPlatformState(), employees: [employee], roles: [role], accounts: [account] };
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(persistPlatformChange({ tenantId: 'tenant', accessToken: 'test' }, before, {
      ...before, accounts: [...before.accounts, { ...account, id: 'second' }],
    })).rejects.toThrow('只能拥有一个账号');
    expect(fetch).not.toHaveBeenCalled();
  });
});
