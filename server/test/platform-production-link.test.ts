/// <reference lib="dom" />
import { describe, expect, it } from 'vitest';
import {
  createPlatformSeed,
  getAuthorizedFactoryCodes,
  hasPlatformPermission,
  isPlatformCapabilityEnabled,
} from '../../src/platform/platformSeed.js';
import { createTenantProductionState } from '../../src/production/productionPrototype.js';

describe('平台与生产管理联动', () => {
  it('为不同租户提供不同工厂和企业资源', () => {
    const shanghai = createPlatformSeed({ id: 'TENANT-SHWS', code: 'SHWS', name: '上海万申工业集团' });
    const eastChina = createPlatformSeed({ id: 'TENANT-HDJG', code: 'HDJG', name: '华东精工制造' });

    expect(shanghai.orgUnits.find((item) => item.type === 'factory')?.code).toBe('FAC-SH-01');
    expect(eastChina.orgUnits.find((item) => item.type === 'factory')?.code).toBe('FAC-SZ-01');
    expect(shanghai.resources.some((item) => item.code === 'ASSY-01')).toBe(true);
    expect(eastChina.resources.some((item) => item.code === 'ASSY-02')).toBe(true);
  });

  it('应用开关关闭后生产能力不可用', () => {
    const state = createPlatformSeed();
    const production = state.capabilities.find((item) => item.code === 'production');
    if (production) production.enabled = false;
    expect(isPlatformCapabilityEnabled(state, 'production')).toBe(false);
  });

  it('权限判定遵循 deny 优先', () => {
    const state = createPlatformSeed();
    const permission = state.permissions.find((item) => item.code === 'production.view');
    expect(permission).toBeDefined();
    state.roleGrants.push({ roleId: 'ROLE-ADMIN', permissionId: permission!.id, effect: 'deny' });
    expect(hasPlatformPermission(state, { account: 'admin', role: '超级管理员' }, '超级管理员', 'production.view')).toBe(false);
  });

  it('工厂数据范围和工厂启停会限制生产数据', () => {
    const state = createPlatformSeed();
    expect(getAuthorizedFactoryCodes(state, { account: 'admin' }, '计划员')).toEqual(['FAC-SH-01']);
    expect(getAuthorizedFactoryCodes(state, { account: 'admin' }, '采购')).toEqual([]);
    const factory = state.orgUnits.find((item) => item.type === 'factory');
    if (factory) factory.status = 'disabled';
    expect(getAuthorizedFactoryCodes(state, { account: 'admin' }, '计划员')).toEqual([]);
  });

  it('每个租户的生产种子只包含自身工厂数据', () => {
    const shanghai = createTenantProductionState('FAC-SH-01');
    const eastChina = createTenantProductionState('FAC-SZ-01');
    const shanghaiFactories = new Set([...shanghai.demands, ...shanghai.orders, ...shanghai.quality, ...shanghai.completions, ...shanghai.tasks].map((item) => item.factory));
    const eastChinaFactories = new Set([...eastChina.demands, ...eastChina.orders, ...eastChina.quality, ...eastChina.completions, ...eastChina.tasks].map((item) => item.factory));
    expect([...shanghaiFactories]).toEqual(['FAC-SH-01']);
    expect([...eastChinaFactories]).toEqual(['FAC-SZ-01']);
  });
});
