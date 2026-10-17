import { useState, type FormEvent } from 'react';
import { useBusinessCommand } from '../../../hooks/useBusinessCommand';

type Props = {
  orderNo: string;
  commandScope: string;
  onClose: () => void;
  onDecision: (decision: 'APPROVE' | 'RETURN' | 'REJECT', comment: string, key: string) => Promise<unknown>;
  onSaved: () => void;
};

export function SalesReviewModal({ orderNo, commandScope, onClose, onDecision, onSaved }: Props) {
  const [decision, setDecision] = useState<'APPROVE' | 'RETURN' | 'REJECT'>('APPROVE');
  const [comment, setComment] = useState('');
  const [validation, setValidation] = useState('');
  const command = useBusinessCommand(commandScope);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (decision !== 'APPROVE' && !comment.trim()) { setValidation('退回或拒绝必须填写原因'); return; }
    setValidation('');
    const result = await command.execute(key => onDecision(decision, comment.trim(), key));
    if (result) onSaved();
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="sales-review-title" className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6">
      <h3 id="sales-review-title" className="font-bold">审批 / 复核订单</h3>
      <p className="break-words text-sm text-slate-600">{orderNo}</p>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={command.pending || command.uncertain} className="space-y-4">
          <label className="block text-sm">处理结果<select aria-label="复核处理结果" value={decision} onChange={event => setDecision(event.target.value as typeof decision)} className="mt-1 w-full rounded-md border p-2"><option value="APPROVE">通过</option><option value="RETURN">退回</option><option value="REJECT">拒绝</option></select></label>
          <label className="block text-sm">处理意见<textarea aria-label="复核处理意见" maxLength={500} value={comment} onChange={event => setComment(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
        </fieldset>
        {(validation || command.error) && <p role="alert" className="text-sm text-rose-700">{validation || command.error}</p>}
        {command.uncertain && <p role="status" className="text-sm text-amber-700">提交结果待核对，重试将复用原请求。</p>}
        <footer className="flex justify-end gap-3">
          <button type="button" disabled={command.pending} onClick={onClose} className="rounded-md border px-4 py-2 text-sm">取消</button>
          <button disabled={command.pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">{command.pending ? '提交中' : '提交复核结果'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
