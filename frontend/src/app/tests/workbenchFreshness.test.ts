import { describe, expect, it } from 'vitest';
import { workbenchProjection } from '../../api/workbenchProjection';

const project = (data: Record<string, unknown>) => workbenchProjection({ schemaVersion: '1.1', data }, {});

describe('workbench refresh and source states (ISSUE-029)', () => {
  it('uses the response generation time even when business facts have not changed', () => {
    const generatedAt = '2026-10-17T10:00:00Z';
    expect(project({ generatedAt, dataAsOf: '2026-10-01T00:00:00Z' }).generatedAt).toBe(generatedAt);
  });

  it('retains legacy dataAsOf compatibility without inventing a current time', () => {
    const dataAsOf = '2026-10-01T00:00:00Z';
    expect(project({ dataAsOf }).generatedAt).toBe(dataAsOf);
    expect(project({}).generatedAt).toBeUndefined();
    expect(project({ generatedAt: 'invalid', dataAsOf }).generatedAt).toBe('invalid');
  });

  it('hides pending integration while preserving partial, stale and failed source warnings', () => {
    const data = project({ sources: [
      { source: 'SALES', status: 'AVAILABLE' },
      { source: 'RevenueRecognition', status: 'SOURCE_PENDING', errorCode: 'SOURCE_MISSING' },
      { source: 'ShipmentRecognition', availability: 'SOURCE_PENDING' },
      { source: 'INVENTORY', status: 'PARTIAL', errorCode: 'PARTIAL_READ' },
      { source: 'PRODUCTION', status: 'STALE' },
      { source: 'MESSAGE', availability: 'UNAVAILABLE', unavailableReason: 'TIMEOUT' },
    ] });
    expect(data.sourceWarnings).toEqual([
      '库存管理：PARTIAL (PARTIAL_READ)', '生产管理：STALE', '消息管理：UNAVAILABLE (TIMEOUT)',
    ]);
  });

  it('prefers canonical status to aliases and does not turn unknown states into availability', () => {
    expect(project({ sources: [
      { source: 'SALES', status: 'SOURCE_PENDING', availability: 'UNAVAILABLE' },
      { source: 'FINANCE', status: 'UNAVAILABLE', availability: 'AVAILABLE' },
      { source: 'PLATFORM', status: 'NEW_STATE' },
    ] }).sourceWarnings).toEqual(['财务管理：UNAVAILABLE', '平台管理：NEW_STATE']);
  });

  it('keeps missing source names and statuses readable, including null records', () => {
    const warnings = project({ sources: [{ source: 'SalesOrder' }, {}, null, { source: ' ', status: '' }] }).sourceWarnings;
    expect(warnings).toEqual([
      'SalesOrder：来源状态未提供', '未知来源：来源状态未提供',
      '未知来源：来源状态未提供', '未知来源：来源状态未提供',
    ]);
    expect(warnings.join('；')).not.toContain('undefined');
    expect(project({}).sourceWarnings).toEqual([]);
    expect(() => project({ sources: {} })).toThrow('来源状态响应与契约不一致');
  });

  it('preserves empty metrics and only renders money with explicit currency and tax basis', () => {
    expect(project({ metrics: {} }).metrics).toEqual([]);
    expect(project({ metrics: { confirmedRevenueAmount: { availability: 'UNAVAILABLE' } } }).metrics[0].value).toBe('-');
    expect(project({ metrics: { orderAmount: {
      availability: 'AVAILABLE', value: '123.45', currency: 'USD', taxBasis: 'INCLUDING_TAX',
    } } }).metrics[0]).toMatchObject({ value: '123.45', unit: 'USD' });
  });
});
