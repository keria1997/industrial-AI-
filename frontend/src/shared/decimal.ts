const scale = 1_000_000n;

const units = (value: string): bigint => {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) throw new Error('数量必须是非负十进制数，最多 6 位小数');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * scale + BigInt(fraction.padEnd(6, '0'));
};

const format = (value: bigint): string => {
  const fraction = (value % scale).toString().padStart(6, '0').replace(/0+$/, '');
  return `${value / scale}${fraction ? `.${fraction}` : ''}`;
};

export const compareQuantity = (left: string, right: string): number => {
  const difference = units(left) - units(right);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
};

export const subtractQuantity = (left: string, right: string): string => {
  const difference = units(left) - units(right);
  if (difference < 0n) throw new Error('累计数量不一致，请刷新单据');
  return format(difference);
};

export const addQuantity = (left: string, right: string): string => format(units(left) + units(right));
