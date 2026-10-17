import { describe, expect, it } from 'vitest';
import { normalizeNumericDraft, parseNumericDraft } from './numericDraft';
import { salesNumericDraft } from '../features/sales/model/salesNumericDraft';

describe('numeric draft validation boundaries', () => {
  it('distinguishes empty and incomplete edits from an actual zero', () => {
    for (const value of ['', ' ', '0.', '1.', '-', 'NaN', 'Infinity', '1e2', '0x10', null]) {
      expect(parseNumericDraft(value)).toBeNull();
    }
    expect(parseNumericDraft('0')).toBe(0);
    expect(normalizeNumericDraft('007.20')).toBe('7.20');
  });

  it('uses field-specific precision, positivity and integer constraints', () => {
    expect(parseNumericDraft('0', { positive: true })).toBeNull();
    expect(parseNumericDraft('100.1', { max: 100 })).toBeNull();
    expect(parseNumericDraft('1.0000001', { fractionDigits: 6 })).toBeNull();
    expect(parseNumericDraft('1.5', { integer: true })).toBeNull();
    expect(parseNumericDraft('9007199254740992', { integer: true })).toBeNull();
    expect(parseNumericDraft('0', { integer: true, min: 1 })).toBeNull();
    expect(parseNumericDraft('10', { integer: true, min: 1 })).toBe(10);
    expect(normalizeNumericDraft('000.000001', { positive: true, fractionDigits: 6 })).toBe('0.000001');
  });

  it('withholds sales totals for missing quantities, discounts and invalid ranges', () => {
    const lines = [{ quantity: '2', unitPrice: '10.5' }];
    expect(salesNumericDraft(lines, '100', '0').total).toBe(21);
    for (const [quantity, rate, discount] of [['', '100', '0'], ['2', '', '0'], ['2', '101', '0'], ['2', '100', '']]) {
      const result = salesNumericDraft([{ ...lines[0], quantity }], rate, discount);
      expect(result.total).toBeNull();
      expect(result.error).not.toBe('');
    }
    expect(salesNumericDraft([{ quantity: '1e300', unitPrice: '10' }], '100', '0').total).toBeNull();
    expect(salesNumericDraft([], '100', '0').total).toBeNull();
  });

  it('normalizes only submitted values and retains valid zero discounts', () => {
    const lines = [{ quantity: '002.5', unitPrice: '010', productId: 'P1' }];
    const result = salesNumericDraft(lines, '100', '00');
    expect(result.lines[0]).toEqual({ quantity: '2.5', unitPrice: '10', productId: 'P1' });
    expect(result.discountAmount).toBe('0');
    expect(result.total).toBe(25);
    expect(lines[0].quantity).toBe('002.5');
    expect(salesNumericDraft(lines, '0', '0').total).toBe(0);
  });
});
