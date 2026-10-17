import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { procurementApi, type PurchaseOrderDto } from '../../../api/procurement';
import { useBusinessCommand } from '../../../hooks/useBusinessCommand';
import { subtractQuantity } from '../../../shared/decimal';
import { validatePositiveAmount } from '../../../shared/commandValidation';

type Props = { context: ApiContext; order: PurchaseOrderDto; onClose: () => void; onSaved: (status: string) => void };

export function PurchaseReceiptModal({ context, order, onClose, onSaved }: Props) {
  const [qty, setQty] = useState('');
  const [inspection, setInspection] = useState(true);
  const [reference, setReference] = useState('');
  const [receivedAt] = useState(() => new Date().toISOString());
  const [validation, setValidation] = useState('');
  const command = useBusinessCommand();
  let remaining = '';
  try { remaining = subtractQuantity(order.orderedQty, order.receivedQty); } catch { /* Block inconsistent quantities. */ }
  const close = () => {
    if (!command.pending && (!qty || window.confirm('关闭后将放弃当前收货表单，确认关闭？'))) onClose();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const invalid = !remaining ? '累计收货数量不一致，请重新查询订单' : validatePositiveAmount(qty, remaining);
    if (invalid || !reference.trim()) { setValidation(invalid || '请填写本批送货单号'); return; }
    setValidation('');
    // UI -> procurement client -> business backend; the server controls inspection/posting status.
    const result = await command.execute(async key => {
      const value = await procurementApi.receiveOrder(context, order, {
        receivedQty: qty, requireInspection: inspection, externalTransactionId: reference.trim(), receivedAt,
      }, key);
      if (!value?.receipt?.id || !value.receipt.status) throw new Error('收货结果待核对，请使用原请求重试或查询收货记录');
      return value;
    });
    if (result) onSaved(result.receipt.status);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
    <section role="dialog" aria-modal="true" aria-labelledby="purchase-receipt-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6" onClick={event => event.stopPropagation()}>
      <header className="mb-4 flex justify-between"><h3 id="purchase-receipt-title" className="font-bold">登记分批收货</h3><button title="关闭" aria-label="关闭收货表单" disabled={command.pending} onClick={close}><X size={18} /></button></header>
      <p className="mb-4 break-words text-sm text-slate-600">{order.orderNo} · {order.materialName || order.materialId} · 剩余可收 {remaining || '-'} {order.uom}</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={command.pending || command.uncertain} className="space-y-4">
          <label className="block text-sm">本次收货数量<input aria-label="本次收货数量" required inputMode="decimal" value={qty} onChange={event => setQty(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
          <label className="block text-sm">本批送货单号<input aria-label="本批送货单号" required value={reference} onChange={event => setReference(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inspection} onChange={event => setInspection(event.target.checked)} />需要来料质检</label>
        </fieldset>
        {(validation || command.error) && <p role="alert" className="text-sm text-rose-700">{validation || command.error}</p>}
        {command.uncertain && <p role="status" className="text-sm text-amber-700">结果待核对，重试将使用原批次及幂等键。</p>}
        <footer className="flex justify-end gap-3 border-t pt-4">
          <button type="button" disabled={command.pending} onClick={close} className="rounded-md border px-4 py-2 text-sm">取消</button>
          <button disabled={command.pending || !remaining} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">{command.pending ? '提交中' : command.uncertain ? '按原请求重试' : '登记收货'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
