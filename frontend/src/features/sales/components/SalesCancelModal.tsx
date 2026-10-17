import { useState, type FormEvent } from 'react';
import { useBusinessCommand } from '../../../hooks/useBusinessCommand';

type Props = {
  orderNo: string;
  commandScope: string;
  onClose: () => void;
  onCancel: (reason: string, key: string) => Promise<unknown>;
  onSaved: () => void;
};

// All order-cancellation entry points use the same reason and retry contract.
export function SalesCancelModal({ orderNo, commandScope, onClose, onCancel, onSaved }: Props) {
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const command = useBusinessCommand(commandScope);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) { setValidation('请填写取消原因'); return; }
    setValidation('');
    const result = await command.execute(key => onCancel(reason.trim(), key));
    if (result) onSaved();
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="sales-cancel-title" className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg bg-white p-6">
      <h3 id="sales-cancel-title" className="font-bold">取消订单</h3>
      <p className="break-words text-sm text-slate-600">{orderNo}</p>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">取消原因<textarea aria-label="取消原因" disabled={command.pending || command.uncertain} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
        {(validation || command.error) && <p role="alert" className="text-sm text-rose-700">{validation || command.error}</p>}
        {command.uncertain && <p role="status" className="text-sm text-amber-700">结果待核对，请查询订单状态；重试将使用原原因和幂等键。</p>}
        <footer className="flex justify-end gap-3">
          <button type="button" disabled={command.pending} onClick={() => {
            if ((!reason && !command.uncertain) || window.confirm(command.uncertain ? '取消结果尚未确认，关闭后请先查询订单状态，不要重复取消。确认关闭？' : '确认放弃当前取消原因？')) onClose();
          }} className="rounded-md border px-4 py-2 text-sm">返回</button>
          <button disabled={command.pending} className="rounded-md bg-rose-600 px-4 py-2 text-sm text-white">{command.pending ? '提交中' : command.uncertain ? '按原请求重试' : '确认取消订单'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
