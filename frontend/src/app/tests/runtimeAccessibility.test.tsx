import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { SidebarItem } from '../SidebarItem';
import { resolveSessionRole } from '../AppRuntimeProvider';

describe('runtime session and navigation accessibility', () => {
  it('derives the same role from a new login session and a restored session', () => {
    const session = { name: '系统管理员', role: '超级管理员' };
    expect(resolveSessionRole(session)).toBe('超级管理员');
    expect(resolveSessionRole(JSON.parse(JSON.stringify(session)))).toBe('超级管理员');
    expect(resolveSessionRole({ name: '未知账号', role: '不存在的角色' })).toBe('老板');
  });

  it('renders sidebar navigation as a keyboard-operable semantic button', () => {
    const onClick = vi.fn();
    const element = SidebarItem({ icon: LayoutDashboard, label: '工作台', active: true, onClick });
    expect(element.type).toBe('button');
    expect(element.props.type).toBe('button');
    expect(element.props['aria-current']).toBe('page');
    expect(element.props.className).toContain('focus-visible:ring-2');
    element.props.onClick();
    expect(onClick).toHaveBeenCalledOnce();
  });
});
