import { describe, expect, it } from 'vitest';
import { formatAmount, formatQuantity } from '../../shared/format';
import { financeAmount, financeDocumentStatus, positiveFinanceAmount } from '../../features/finance/financePresentation';

describe('decimal fact formatting', () => {
  it('preserves amounts beyond binary floating-point and safe integer precision', () => {
    expect(formatAmount('9007199254740993.015')).toBe('9,007,199,254,740,993.02');
    expect(formatAmount('-9007199254740993.015')).toBe('-9,007,199,254,740,993.02');
    expect(formatAmount('999.995')).toBe('1,000.00');
    expect(formatAmount('-0.001')).toBe('0.00');
  });
  it('distinguishes missing/malformed data from zero and formats quantity without padding', () => {
    for (const value of [null, undefined, '', '12oops', 'NaN', 'Infinity']) expect(formatAmount(value)).toBe('-');
    expect(formatAmount('0')).toBe('0.00');
    expect(formatQuantity('9007199254740993.000001')).toBe('9,007,199,254,740,993.000001');
    expect(formatQuantity('2.1234567')).toBe('2.123457');
    expect(formatQuantity('2.000000')).toBe('2');
  });
  it('keeps actual currencies, missing currency and unknown document states distinct', () => {
    expect(financeAmount('9007199254740993.01', 'USD')).toBe('9,007,199,254,740,993.01 USD');
    expect(financeAmount('0')).toBe('0.00 （币种未提供）');
    expect(financeAmount(null, 'CNY')).toBe('-');
    expect(financeDocumentStatus('REVERSED', 'AR')).toBe('已冲销');
    expect(financeDocumentStatus('unexpected', 'AP')).toBe('状态待核实（unexpected）');
    expect(positiveFinanceAmount('0.000001')).toBe(true);
    for (const value of ['0', '0.00', '-10', undefined, '12bad']) expect(positiveFinanceAmount(value)).toBe(false);
  });
});
