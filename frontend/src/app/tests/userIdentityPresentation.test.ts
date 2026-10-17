import { describe, expect, it } from 'vitest';
import { resolveSessionRole } from '../AppRuntimeProvider';
import { getAuthorizedModules } from '../permissions';
import { resolveAccountRole } from '../userIdentityPresentation';

describe('account role presentation', () => {
  it('displays the actual account role and resolves recognized workbench groups', () => {
    const session = { name: '验证', role: '超级管理员' };
    expect(resolveAccountRole(session)).toBe('超级管理员');
    expect(resolveSessionRole(session)).toBe('超级管理员');
  });

  it.each([undefined, null, '', '   ', 123, {}, ['管理员']])(
    'shows missing role instead of inferring privileges for %j',
    role => {
      expect(resolveAccountRole({ role })).toBe('角色信息未提供');
      expect(resolveSessionRole({ name: '验证', role } as any)).toBeNull();
    },
  );

  it('trims a custom role and never defaults it to owner', () => {
    const user = { name: '验证', role: '  质检主管  ' };
    expect(resolveSessionRole(user)).toBeNull();
    expect(resolveAccountRole(user)).toBe('质检主管');
    expect(resolveAccountRole(null)).toBe('角色信息未提供');
  });

  it('never grants menu access based on an admin role name', () => {
    expect(getAuthorizedModules(['workbench.dashboard.read']).map(module => module.id)).toEqual(['workbench']);
    expect(getAuthorizedModules([])).toEqual([]);
  });
});
