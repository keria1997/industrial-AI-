import { formatAmount } from '../../shared/format';

// Presentation only: no conversion, aggregation or rounding through binary floating-point.
export function financeAmount(value: string | number | null | undefined, currency?: string): string {
  const amount = formatAmount(value);
  return amount === '-' ? '-' : `${amount} ${currency?.trim() || '（币种未提供）'}`;
}

export function positiveFinanceAmount(value: unknown): boolean {
  return typeof value === 'string' && /^\+?\d+(?:\.\d+)?$/.test(value) && /[1-9]/.test(value);
}

export function financeDocumentStatus(status: string, direction: 'AR' | 'AP' | 'COST'): string {
  const normalized = status?.toLowerCase();
  if (normalized === 'reversed') return '已冲销';
  if (normalized === 'void') return '已作废';
  if (normalized === 'done') return direction === 'COST' ? '已核算' : '已结清';
  if (direction === 'COST' && ['draft', 'pending', 'processing'].includes(normalized)) return '核算中';
  if (direction !== 'COST' && normalized === 'processing') return direction === 'AR' ? '部分收款' : '部分付款';
  if (direction !== 'COST' && ['draft', 'pending'].includes(normalized)) return direction === 'AR' ? '待收款' : '待付款';
  if (normalized === 'rejected') return '已驳回';
  return status ? `状态待核实（${status}）` : '状态未提供';
}
