import { compareQuantity } from './decimal';

// Keep quantities and amounts as decimal strings through UI -> business API.
export function validatePositiveAmount(value: string, maximum?: string): string | null {
  try {
    if (compareQuantity(value, '0') <= 0) return '金额或数量必须大于 0';
    if (maximum !== undefined && compareQuantity(value, maximum) > 0) return `不能超过当前可用余额 ${maximum}`;
    return null;
  } catch {
    return '请输入非负十进制数，最多保留 6 位小数';
  }
}
