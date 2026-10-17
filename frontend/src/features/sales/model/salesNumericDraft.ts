import { normalizeNumericDraft, parseNumericDraft } from '../../../shared/numericDraft';

type LineDraft = { quantity: number | string; unitPrice: number | string; [key: string]: unknown };
const decimalRules = { positive: true, fractionDigits: 6 };

export function salesLineDraftAmount(line: LineDraft): number | null {
  const quantity = parseNumericDraft(line.quantity, decimalRules);
  const price = parseNumericDraft(line.unitPrice, decimalRules);
  if (quantity === null || price === null || !Number.isFinite(quantity * price)) return null;
  return quantity * price;
}

export function salesNumericDraft<T extends LineDraft>(lines: T[], rate: unknown, discount: unknown) {
  const amounts = lines.map(salesLineDraftAmount);
  const rawSubtotal = lines.length && amounts.every(value => value !== null)
    ? amounts.reduce((sum, value) => sum + value, 0) : null;
  const subtotal = rawSubtotal !== null && Number.isFinite(rawSubtotal) ? rawSubtotal : null;
  const discountRate = normalizeNumericDraft(rate, { max: 100, fractionDigits: 6 });
  const discountAmount = normalizeNumericDraft(discount, { fractionDigits: 6 });
  const calculated = subtotal !== null && discountRate !== null && discountAmount !== null
    ? Math.max(0, subtotal * Number(discountRate) / 100 - Number(discountAmount)) : null;
  const total = calculated !== null && Number.isFinite(calculated) ? calculated : null;
  const error = amounts.some(value => value === null)
    ? '产品数量和单价须为大于 0 的数字，最多保留 6 位小数'
    : discountRate === null ? '请输入 0 至 100 的折扣率，最多保留 6 位小数'
    : discountAmount === null ? '请输入非负优惠金额，最多保留 6 位小数'
    : total === null ? '请填写有效产品明细，金额不能超出可计算范围' : '';
  return {
    subtotal, total, error, discountRate, discountAmount,
    lines: lines.map(line => ({
      ...line,
      quantity: normalizeNumericDraft(line.quantity, decimalRules),
      unitPrice: normalizeNumericDraft(line.unitPrice, decimalRules),
    })),
  };
}
