import { describe, expect, it } from 'vitest';
import { resolveSessionRole } from '../AppRuntimeProvider';
import { getAuthorizedModules } from '../permissions';
import { resolveDisplayPosition } from '../userIdentityPresentation';

describe('employee position presentation', () => {
  const session = { name: '岗位验证', role: '老板', displayPosition: '租户管理员', tenantIds: ['tenant-1'] };

  it('displays the signed session position independently of the workbench group', () => {
    expect(resolveDisplayPosition(session, 'tenant-1')).toBe('租户管理员');
    expect(resolveSessionRole(session)).toBe('老板');
  });

  it.each([undefined, null, '', '   ', 123, {}, ['租户管理员']])(
    'shows missing position instead of inferring from role for %j',
    displayPosition => {
      expect(resolveDisplayPosition({ ...session, displayPosition }, 'tenant-1')).toBe('岗位信息未提供');
    },
  );

  it('trims the position and never uses an unknown role fallback as an employee position', () => {
    const user = { ...session, role: '自定义权限角色', displayPosition: '  质检主管  ' };
    expect(resolveSessionRole(user)).toBe('老板');
    expect(resolveDisplayPosition(user, 'tenant-1')).toBe('质检主管');
    expect(resolveDisplayPosition({ ...user, displayPosition: null }, 'tenant-1')).toBe('岗位信息未提供');
    expect(resolveDisplayPosition(null, 'tenant-1')).toBe('岗位信息未提供');
  });

  it('does not carry a position into another tenant or infer its scope in a multi-tenant session', () => {
    expect(resolveDisplayPosition(session, 'tenant-2')).toBe('岗位信息未提供');
    expect(resolveDisplayPosition(session, '')).toBe('岗位信息未提供');
    expect(resolveDisplayPosition({ displayPosition: '租户管理员' }, 'tenant-1')).toBe('岗位信息未提供');
    expect(resolveDisplayPosition({ ...session, tenantIds: ['tenant-1', 'tenant-2'] }, 'tenant-1')).toBe('岗位信息未提供');
  });

  it('never grants menu access based on a displayed admin position', () => {
    const restricted = { ...session, permissions: ['workbench.dashboard.read'] };
    expect(getAuthorizedModules(restricted.permissions).map(module => module.id)).toEqual(['workbench']);
    expect(getAuthorizedModules([])).toEqual([]);
    expect(resolveDisplayPosition(restricted, 'tenant-1')).toBe('租户管理员');
  });
});
