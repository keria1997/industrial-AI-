import { describe, expect, it } from 'vitest';
import {
  canRoleAccessModule,
  getModulesForRole,
  moduleRegistry,
} from '../moduleRegistry';
import { createModuleUrl, resolveModuleFromLocation } from '../routing';
import { resolveSalesTab } from '../../features/sales/model/salesRules';
import { resolveInventoryTab } from '../../features/inventory/model/salesOutboundBridge';

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

  it('starts first-level navigation on the module default section', () => {
    const productionUrl = new URL(createModuleUrl(location('?platform=roles&production=orders&tab=quotes&inventory=outbound&sourceOrder=SO-1&focusOrder=SO-2'), '生产管理'), 'https://example.test');
    expect(productionUrl.searchParams.get('production')).toBe('dashboard');
    expect(productionUrl.searchParams.has('platform')).toBe(false);
    expect(productionUrl.searchParams.has('tab')).toBe(false);
    expect(productionUrl.searchParams.has('inventory')).toBe(false);
    expect(productionUrl.searchParams.has('sourceOrder')).toBe(false);
    expect(productionUrl.searchParams.has('focusOrder')).toBe(false);
    expect(productionUrl.searchParams.get('module')).toBe('production');

    const salesUrl = new URL(createModuleUrl(productionUrl, '销售管理'), 'https://example.test');
    expect(salesUrl.searchParams.has('production')).toBe(false);
    expect(salesUrl.searchParams.get('module')).toBe('sales');
    expect(salesUrl.searchParams.has('tab')).toBe(false);

    const inventoryUrl = new URL(createModuleUrl(location('?module=sales&tab=quotes'), '库存管理'), 'https://example.test');
    expect(inventoryUrl.searchParams.has('tab')).toBe(false);
    expect(inventoryUrl.searchParams.get('inventory')).toBe('dashboard');

    const procurementUrl = new URL(createModuleUrl(location('?module=production&procurement=order&focusPr=PR-1'), '采购管理'), 'https://example.test');
    expect(procurementUrl.searchParams.get('procurement')).toBe('dashboard');
    expect(procurementUrl.searchParams.has('focusPr')).toBe(false);

    const workbenchUrl = new URL(createModuleUrl(location('?module=procurement&procurement=pr&focusPr=PR-1&focusMps=MPS-1'), '工作台'), 'https://example.test');
    expect(workbenchUrl.search).toBe('');
  });

  it.each(moduleRegistry)('clears stale section and record state when entering $label', (module) => {
    const url = new URL(createModuleUrl(location(
      '?module=inventory&inventory=outbound&sourceOrder=SO-1&focusOutbound=OUT-1&warehouseId=WH-1'
      + '&tab=orders&focusOrder=SO-1&production=orders&focusMps=MPS-1'
      + '&procurement=pr&focusPr=PR-1&platform=roles&focusId=ID-1&focusNo=NO-1&campaign=spring',
    ), module.label), 'https://example.test');
    for (const key of ['sourceOrder', 'focusOutbound', 'warehouseId', 'focusOrder', 'focusMps', 'focusPr', 'focusId', 'focusNo']) {
      expect(url.searchParams.has(key)).toBe(false);
    }
    expect(resolveSalesTab(url.search)).toBe('dashboard');
    expect(resolveInventoryTab(url.search)).toBe('dashboard');
    expect(url.searchParams.get('production')).toBe(module.id === 'production' ? 'dashboard' : null);
    expect(url.searchParams.get('procurement')).toBe(module.id === 'procurement' ? 'dashboard' : null);
    expect(url.searchParams.get('platform')).toBe(module.id === 'platform' ? 'tenant' : null);
    expect(url.searchParams.get('campaign')).toBe('spring');
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
    expect(getModulesForRole('未知角色')).toEqual([]);
    expect(getModulesForRole(null)).toEqual([]);
  });
});
