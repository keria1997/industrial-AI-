import { describe, expect, it } from 'vitest';
import {
  canRoleAccessModule,
  getModulesForRole,
  moduleRegistry,
} from '../moduleRegistry';
import { createModuleUrl, resolveModuleFromLocation } from '../routing';

const location = (search = '', hash = '') => ({ pathname: '/', search, hash });

describe('application module routing', () => {
  it('round-trips every registered module through a stable URL', () => {
    moduleRegistry.forEach((module) => {
      const url = new URL(createModuleUrl(location('?campaign=spring'), module.label), 'https://example.test');
      expect(resolveModuleFromLocation(url)).toBe(module.label);
      expect(url.searchParams.get('campaign')).toBe('spring');
    });
  });

  it('keeps legacy production and platform links working', () => {
    expect(resolveModuleFromLocation(location('?production=orders'))).toBe('生产管理');
    expect(resolveModuleFromLocation(location('?platform=roles'))).toBe('平台管理');
  });

  it('falls back to the workbench for unknown modules', () => {
    expect(resolveModuleFromLocation(location('?module=does-not-exist'))).toBe('工作台');
    expect(createModuleUrl(location('?module=sales&production=orders'), '未知模块')).toBe('/');
  });

  it('clears production-owned state when a route guard redirects to the workbench', () => {
    expect(createModuleUrl(location('?module=production&production=orders'), '工作台')).toBe('/');
  });

  it('preserves module-owned section state only while that module is active', () => {
    const productionUrl = new URL(createModuleUrl(location('?platform=roles&production=orders&tab=quotes&inventory=outbound&sourceOrder=SO-1&focusOrder=SO-2'), '生产管理'), 'https://example.test');
    expect(productionUrl.searchParams.get('production')).toBe('orders');
    expect(productionUrl.searchParams.has('platform')).toBe(false);
    expect(productionUrl.searchParams.has('tab')).toBe(false);
    expect(productionUrl.searchParams.has('inventory')).toBe(false);
    expect(productionUrl.searchParams.has('sourceOrder')).toBe(false);
    expect(productionUrl.searchParams.has('focusOrder')).toBe(false);

    const salesUrl = new URL(createModuleUrl(productionUrl, '销售管理'), 'https://example.test');
    expect(salesUrl.searchParams.has('production')).toBe(false);
    expect(salesUrl.searchParams.get('module')).toBe('sales');

    const inventoryUrl = new URL(createModuleUrl(location('?module=sales&tab=quotes'), '库存管理'), 'https://example.test');
    expect(inventoryUrl.searchParams.has('tab')).toBe(false);
    expect(inventoryUrl.searchParams.get('inventory')).toBe('dashboard');
  });
});

describe('application module registry', () => {
  it('uses unique ids and labels', () => {
    expect(new Set(moduleRegistry.map((item) => item.id)).size).toBe(moduleRegistry.length);
    expect(new Set(moduleRegistry.map((item) => item.label)).size).toBe(moduleRegistry.length);
  });

  it('filters navigation by the centralized role matrix', () => {
    expect(canRoleAccessModule('销售', '销售管理')).toBe(true);
    expect(canRoleAccessModule('销售', '平台管理')).toBe(false);
    expect(getModulesForRole('超级管理员')).toHaveLength(moduleRegistry.length);
    expect(getModulesForRole('未知角色').map((item) => item.label)).toEqual(
      getModulesForRole('老板').map((item) => item.label),
    );
  });
});
