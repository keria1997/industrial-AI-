export const aftercareText = (value: unknown): string =>
  typeof value === 'string' && value.trim() ? value : '-';

export const aftercareQuantity = (value: unknown): string =>
  typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) ? value : '-';

// A return quantity or an order's currency cannot establish a credit-note amount.
export const creditNoteAmount = (amount: unknown, currency: unknown): string =>
  typeof amount === 'string' && /^-?\d+(\.\d+)?$/.test(amount)
    && typeof currency === 'string' && /^[A-Z]{3}$/.test(currency)
    ? `${currency} ${amount}` : '-';

export const customerReceiptStatus = (receiptStatus: unknown, status: unknown): string => {
  const canonical = aftercareText(receiptStatus);
  const alias = aftercareText(status);
  if (canonical !== '-' && alias !== '-' && canonical !== alias) return '状态不一致，待核实';
  return canonical === '-' ? alias : canonical;
};
