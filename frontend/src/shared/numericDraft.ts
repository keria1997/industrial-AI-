type NumericRules = {
  integer?: boolean;
  positive?: boolean;
  min?: number;
  max?: number;
  fractionDigits?: number;
};

// Call only for previews/validation/submission. Input events must retain the raw draft.
export function normalizeNumericDraft(value: unknown, rules: NumericRules = {}): string | null {
  const raw = String(value ?? '');
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const [whole, fraction] = raw.split('.');
  if (rules.integer && fraction !== undefined) return null;
  if (rules.fractionDigits !== undefined && (fraction?.length ?? 0) > rules.fractionDigits) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || (rules.integer && !Number.isSafeInteger(number))) return null;
  if (number < (rules.min ?? 0) || number > (rules.max ?? Infinity) || (rules.positive && number <= 0)) return null;
  return whole.replace(/^0+(?=\d)/, '') + (fraction === undefined ? '' : `.${fraction}`);
}

export function parseNumericDraft(value: unknown, rules: NumericRules = {}): number | null {
  const normalized = normalizeNumericDraft(value, rules);
  return normalized === null ? null : Number(normalized);
}
