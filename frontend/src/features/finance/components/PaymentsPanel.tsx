import { useCallback, useState } from 'react';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { confirmPayment, listPayments, type Payment } from '../../../api/finance';
import { hasPermission } from '../../../app/permissions';
import { ApiDataState } from '../../../components/ApiDataState';
import { DataTable, type Column } from '../../../components/DataTable';
import { PageNavigation } from '../../../components/PageNavigation';
import { useApiResource } from '../../../hooks/useApiResource';
import { businessCommandScope, useBusinessCommand } from '../../../hooks/useBusinessCommand';
import { formatAmount } from '../../../shared/format';

type Props = { apiContext: ApiContext | null; permissions?: string[]; actorId?: string; onChanged: () => void };

export function PaymentsPanel({ apiContext, permissions, actorId, onChanged }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [selected, setSelected] = useState<Payment | null>(null);
  const command = useBusinessCommand(businessCommandScope(apiContext, selected?.id || '', 'payment-confirm'));
  const load = useCallback((context: ApiContext) => listPayments(context, { page, pageSize: 20, search }), [page, search]);
  const records = useApiResource<{ items: Payment[]; total: number }>(apiContext, load);
  const confirm = async () => {
    if (!selected || !apiContext) return;
    const result = await command.execute(async key => {
      const value = await confirmPayment(apiContext, selected.id, selected.version, key);
      if (!value?.payment?.id || !['done', 'CONFIRMED'].includes(value.payment.status)) throw new Error('确认结果尚未取得，请按原请求重试或重新查询');
      return value;
    });
    if (result) { setSelected(null); records.reload(); onChanged(); }
  };
  const columns: Column<Payment>[] = [
    { key: 'docNo', label: '收付款单号' },
    { key: 'direction', label: '方向', render: row => row.direction === 'INBOUND' ? '收款' : '付款' },
    { key: 'counterpartyName', label: '往来单位' },
    { key: 'amount', label: '金额', align: 'right', render: row => `${formatAmount(row.amount)} ${row.currency}` },
    { key: 'paymentDate', label: '日期' },
    { key: 'status', label: '状态', render: row => ({ pending: '待确认', PENDING_CONFIRM: '待确认', done: '已确认', CONFIRMED: '已确认', void: '已作废', REVERSED: '已冲销', reversed: '已冲销' }[row.status] || row.status) },
    { key: 'createdBy', label: '登记人' },
    { key: 'actions', label: '操作', render: row => {
      const allowed = hasPermission(permissions, 'finance.payment.confirm');
      const own = Boolean(actorId && row.createdBy === actorId);
      return <button type="button" disabled={!allowed || own || !['pending', 'PENDING_CONFIRM'].includes(row.status)} title={own ? '登记人与确认人须分离' : !allowed ? '无确认权限' : '确认收付款'} onClick={() => setSelected(row)} className="inline-flex items-center gap-1 text-blue-700 disabled:text-slate-400"><CheckCircle2 size={14} />确认</button>;
    } },
  ];
  return <section className="space-y-3">
    <form onSubmit={event => { event.preventDefault(); setSearch(input.trim()); setPage(1); }} className="flex flex-wrap items-center gap-2">
      <input aria-label="搜索收付款" value={input} onChange={event => setInput(event.target.value)} placeholder="收付款单号或往来单位" className="min-w-0 rounded-md border p-2 text-sm" />
      <button className="rounded-md border px-3 py-2 text-sm">查询</button>
      <button type="button" title="刷新" aria-label="刷新收付款" onClick={records.reload} className="rounded-md border p-2"><RefreshCw size={16} /></button>
      <button type="button" disabled title="冲销字段与审批契约待补充" className="ml-auto text-sm text-slate-400">冲销/红字</button>
    </form>
    {records.loading || records.error ? <ApiDataState loading={records.loading} error={records.error} onRetry={records.reload} /> : <DataTable columns={columns} data={records.data?.items ?? []} emptyText="暂无收付款记录" />}
    <PageNavigation page={page} pageSize={20} total={records.data?.total ?? 0} onPage={setPage} />
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="confirm-payment-title" className="w-full max-w-md space-y-4 rounded-lg bg-white p-6">
        <h3 id="confirm-payment-title" className="font-bold">确认收付款</h3>
        <p className="break-words text-sm">{selected.docNo} · {formatAmount(selected.amount)} {selected.currency}</p>
        {command.error && <p role="alert" className="text-sm text-rose-700">{command.error}</p>}
        {command.uncertain && <p role="status" className="text-sm text-amber-700">确认结果待核对，重试将复用原请求。</p>}
        <footer className="flex justify-end gap-3">
          <button disabled={command.pending} onClick={() => setSelected(null)} className="rounded-md border px-3 py-2 text-sm">取消</button>
          <button disabled={command.pending} onClick={confirm} className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white">{command.pending ? '确认中' : '确认收付款'}</button>
        </footer>
      </section>
    </div>}
  </section>;
}
