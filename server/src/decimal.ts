const SCALE = 1_000_000n;
const DECIMAL_PATTERN = /^(0|[1-9]\d*)(\.\d{1,6})?$/;

export function decimalToScaled(value: string): bigint {
  if (!DECIMAL_PATTERN.test(value)) throw new Error(`Invalid decimal(18,6): ${value}`);
  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 12) throw new Error(`decimal(18,6) overflow: ${value}`);
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(6, "0"));
}

export function scaledToDecimal(value: bigint): string {
  const sign = value < 0 ? "-" : "";
  const absolute = value < 0 ? -value : value;
  const whole = absolute / SCALE;
  const fraction = (absolute % SCALE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${sign}${whole}${fraction ? `.${fraction}` : ""}`;
}

export function addDecimal(...values: string[]): string {
  return scaledToDecimal(values.reduce((total, value) => total + decimalToScaled(value), 0n));
}

export function subtractDecimal(left: string, right: string): string {
  return scaledToDecimal(decimalToScaled(left) - decimalToScaled(right));
}

export function compareDecimal(left: string, right: string): number {
  const a = decimalToScaled(left);
  const b = decimalToScaled(right);
  return a === b ? 0 : a > b ? 1 : -1;
}

export function minDecimal(left: string, right: string): string {
  return compareDecimal(left, right) <= 0 ? left : right;
}

export function isPositive(value: string): boolean {
  return decimalToScaled(value) > 0n;
}

export function sumDecimals(values: string[]): string {
  return addDecimal(...values);
}

