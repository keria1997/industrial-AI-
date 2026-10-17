/**
 * 金额/数量格式化工具
 *
 * PRD 9.x 要求：金额使用十进制精度，展示保留两位，千分位分隔。
 * 数量最多展示 6 位小数，超出时四舍五入；不改变原始事实。
 */

function formatDecimal(value: string | number | null | undefined, scale: number, trim: boolean): string {
  if (value === null || value === undefined) return '-';
  const text = typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 }) : String(value);
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(text.trim());
  if (!match) return '-';
  const fraction = match[3] || '';
  const factor = 10n ** BigInt(scale);
  let rounded = BigInt(match[2]) * factor + BigInt(fraction.slice(0, scale).padEnd(scale, '0') || '0');
  if (Number(fraction[scale] || '0') >= 5) rounded += 1n;
  const integer = (rounded / factor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = (rounded % factor).toString().padStart(scale, '0');
  const suffix = trim ? decimals.replace(/0+$/, '') : decimals;
  return `${match[1] === '-' && rounded !== 0n ? '-' : ''}${integer}${suffix ? `.${suffix}` : ''}`;
}

export function formatAmount(value: string | number | null | undefined): string {
  return formatDecimal(value, 2, false);
}

export function formatAmountWithCurrency(value: string | number | null | undefined, currency = '¥'): string {
  const formatted = formatAmount(value);
  if (formatted === '-') return '-';
  return `${currency}${formatted}`;
}

export function formatQuantity(value: string | number | null | undefined): string {
  return formatDecimal(value, 6, true);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  try { return new Date(value).toLocaleDateString('zh-CN'); } catch { return value; }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  try { return new Date(value).toLocaleString('zh-CN'); } catch { return value; }
}
