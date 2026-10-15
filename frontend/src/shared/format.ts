/**
 * 金额/数量格式化工具
 *
 * PRD 9.x 要求：金额使用十进制精度，展示保留两位，千分位分隔。
 * 数量保留 6 位小数，超长时截断显示。
 */

export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatAmountWithCurrency(value: string | number | null | undefined, currency = '¥'): string {
  const formatted = formatAmount(value);
  if (formatted === '-') return '-';
  return `${currency}${formatted}`;
}

export function formatQuantity(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '-') return '-';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '-';
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 6 });
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  try { return new Date(value).toLocaleDateString('zh-CN'); } catch { return value; }
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  try { return new Date(value).toLocaleString('zh-CN'); } catch { return value; }
}
