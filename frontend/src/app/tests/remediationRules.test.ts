import { describe, expect, it } from 'vitest';
import { getAuthorizedModules, hasPermission } from '../permissions';
import { sourceDestination } from '../sourceDestination';
import { createModuleUrl } from '../routing';
import { validatePositiveAmount } from '../../shared/commandValidation';
import { workbenchProjection } from '../../api/workbenchProjection';
import { validateNewPassword } from '../../shared/passwordPolicy';

describe('frontend remediation boundaries', () => {
  it('grants no menus or commands for missing/empty effective permissions', () => {
    expect(getAuthorizedModules(undefined)).toEqual([]);
    expect(getAuthorizedModules([])).toEqual([]);
    expect(hasPermission([], 'sales.order.create')).toBe(false);
    expect(getAuthorizedModules(['procurement.order.read']).map(module => module.label)).toEqual(['采购管理']);
    expect(getAuthorizedModules(['finance.payment.read']).map(module => module.label)).toEqual(['财务管理']);
  });

  it('uses source types and stable IDs rather than action text or display numbers', () => {
    expect(sourceDestination({ sourceType: 'SALES_ORDER', sourceId: 'stable-so' })).toEqual({ module: '销售管理', query: { tab: 'orders', focusOrder: 'stable-so' } });
    expect(sourceDestination({ sourceType: 'PURCHASE_ORDER', sourceId: 'stable-po' })).toEqual({ module: '采购管理', query: { procurement: 'order', focusPo: 'stable-po' } });
    expect(sourceDestination({ sourceType: 'AR', sourceId: 'stable-ar' })).toEqual({ module: '财务管理', query: { finance: 'receivable', focusAr: 'stable-ar' } });
    expect(sourceDestination({ sourceType: 'UNKNOWN', sourceId: 'record' })).toBeNull();
    expect(sourceDestination({ sourceType: 'SALES_ORDER' })).toBeNull();
    expect(createModuleUrl({ pathname: '/', search: '?module=finance&finance=receivable&focusAr=AR-1&focusPo=PO-1&quickCreate=order', hash: '' }, '工作台')).toBe('/');
  });

  it('bounds partial amounts exactly without floating point or exponent notation', () => {
    expect(validatePositiveAmount('0.000001', '0.000002')).toBeNull();
    expect(validatePositiveAmount('99999999999999.999999', '99999999999999.999999')).toBeNull();
    for (const value of ['0', '-1', '1e3', 'NaN', '1.0000001', '']) expect(validatePositiveAmount(value, '100')).not.toBeNull();
    expect(validatePositiveAmount('100.000001', '100')).not.toBeNull();
  });

  it('uses the same creation/reset password rule with length and case requirements', () => {
    expect(validateNewPassword('abcde12345')).not.toBeNull();
    expect(validateNewPassword('ABCDE12345')).not.toBeNull();
    expect(validateNewPassword('Abc12345')).not.toBeNull();
    expect(validateNewPassword('Abcdef1234')).toBeNull();
  });

  it('does not combine currencies or fabricate totals/zero completed quantities in schema 1.1', () => {
    const data = workbenchProjection({ schemaVersion: '1.1', data: {
      role: '老板', generatedAt: '2026-10-17T00:00:00Z', scope: { tenantId: 'tenant-a' },
      metrics: {
        revenue: { availability: 'AVAILABLE', periodAmountGroups: [
          { metric: 'ORDER_AMOUNT', currency: 'CNY', taxBasis: 'INCLUDING_TAX', amount: '12.34' },
          { metric: 'ORDER_AMOUNT', currency: 'USD', taxBasis: 'INCLUDING_TAX', amount: '5.60' },
        ] },
        productionDue: { unitGroups: [{ factoryId: 'f1', plannedUnit: 'PCS', dueQty: '2', achievedQty: null, overdueQty: '1' }] },
        lowStockMaterial: { distinctMaterialCount: 0 },
      },
    } }, { sections: 'metrics' });
    expect(data.metrics.map(item => [item.value, item.unit])).toEqual([['12.34', 'CNY'], ['5.60', 'USD'], ['-', 'PCS'], ['0', '种']]);
    expect(data.todoTotal).toBeNull();
    expect(() => workbenchProjection({ schemaVersion: '1.1', data: {} }, { sections: 'todos,alerts,activities' })).toThrow('分区');
  });
});
