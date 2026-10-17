import { useRef, useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { ApiError, type ApiContext } from '../../../api/client';
import { registerPayment, type Payable, type PaymentMethod, type Receivable } from '../../../api/finance';
import { formatAmount } from '../../../shared/format';
import { validatePositiveAmount } from '../../../shared/commandValidation';

interface Props {
  apiContext: ApiContext;
  document: Receivable | Payable;
  direction: 'INBOUND' | 'OUTBOUND';
  onClose: () => void;
  onSaved: () => void;
}

// UI -> finance client -> business backend. Registration never locally settles AR/AP.
export function PaymentAllocationModal({ apiContext, document, direction, onClose, onSaved }: Props) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [paymentDate, setPaymentDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  });
  const [referenceNo, setReferenceNo] = useState('');
  const [remark, setRemark] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const command = useRef<{ key: string; input: Parameters<typeof registerPayment>[1] } | null>(null);
  const busy = useRef(false);
  const inbound = direction === 'INBOUND';
  const title = inbound ? '登记收款' : '登记付款';
  const balance = document.outstandingAmount;
  const close = () => {
    if (!busy.current && (!amount || window.confirm('关闭后将放弃当前表单内容，确认关闭？'))) onClose();
  };
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const invalid = validatePositiveAmount(amount, balance);
    if (invalid) { setError(invalid); return; }
    const counterpartyId = inbound ? (document as Receivable).customerId : (document as Payable).supplierId;
    if (!document.id || !document.currency || !counterpartyId) { setError('来源单据缺少ID、币种或往来单位，请刷新后核对'); return; }
    if (!paymentDate) { setError('请选择收付款日期'); return; }
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      command.current ??= {
        key: `payment:${crypto.randomUUID()}`,
        input: {
          direction, ...(inbound ? { receivableId: document.id } : { payableId: document.id }),
          counterpartyId: inbound ? (document as Receivable).customerId : (document as Payable).supplierId,
          counterpartyName: inbound ? (document as Receivable).customerName : (document as Payable).supplierName,
          amount, currency: document.currency, paymentMethod: method, paymentDate, referenceNo, remark,
        },
      };
      const result = await registerPayment(apiContext, command.current.input, command.current.key);
      if (!result?.payment?.id || !result.payment.status) throw new Error('尚未取得登记结果，请使用原请求重试或查询收付款记录');
      onSaved();
    } catch (cause) {
      const unknown = !(cause instanceof ApiError) || cause.status >= 500 || [408, 429].includes(cause.status);
      setUncertain(unknown);
      if (!unknown) command.current = null;
      setError(cause instanceof Error ? cause.message : '登记失败，请重试');
    } finally { busy.current = false; setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={close}>
      <section role="dialog" aria-modal="true" aria-labelledby="payment-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b p-5">
          <h3 id="payment-title" className="font-bold text-slate-800">{title}</h3>
          <button type="button" aria-label="关闭收付款表单" title="关闭" disabled={saving} onClick={close}><X size={18} /></button>
        </header>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <p className="text-sm text-slate-600">{document.docNo} · 未结余额 {formatAmount(balance)} {document.currency}</p>
          <fieldset disabled={saving || uncertain} className="space-y-4">
            <label className="block text-sm">收付款金额<input aria-label="收付款金额" required inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="text-sm">付款方式<select aria-label="付款方式" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)} className="mt-1 w-full rounded-md border p-2">
                <option value="bank_transfer">银行转账</option><option value="cash">现金</option><option value="check">支票</option><option value="offset">抵扣</option><option value="other">其他</option>
              </select></label>
              <label className="text-sm">收付款日期<input aria-label="收付款日期" type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
            </div>
            <label className="block text-sm">银行参考号<input value={referenceNo} onChange={e => setReferenceNo(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
            <label className="block text-sm">备注<textarea aria-label="备注" value={remark} onChange={e => setRemark(e.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          {uncertain && <p role="status" className="text-sm text-amber-700">提交结果待核对。重试使用原金额和幂等键，请勿重复登记。</p>}
          <footer className="flex justify-end gap-3 border-t pt-4">
            <button type="button" disabled={saving} onClick={close} className="rounded-md border px-4 py-2 text-sm">取消</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-50">{saving && <Loader2 size={14} className="animate-spin" />}{saving ? '提交中' : uncertain ? '按原请求重试' : '登记待确认'}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}
