import { useCallback, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { procurementApi, type PurchaseReceiptDto, type PurchaseReturnDto } from '../../../api/procurement';
import { hasPermission } from '../../../app/permissions';
import { ApiDataState } from '../../../components/ApiDataState';
import { DataTable, type Column } from '../../../components/DataTable';
import { PageNavigation } from '../../../components/PageNavigation';
import { useApiResource } from '../../../hooks/useApiResource';
import { useBusinessCommand } from '../../../hooks/useBusinessCommand';
import { requireApiPage } from '../../../shared/apiCollection';
import { validatePositiveAmount } from '../../../shared/commandValidation';

type Props = { context: ApiContext | null; mode: 'receipts' | 'returns'; permissions?: string[]; onChanged: () => void };
type Action = { kind: 'inspect'; receipt: PurchaseReceiptDto } | { kind: 'return'; receipt: PurchaseReceiptDto } | { kind: 'process'; ret: PurchaseReturnDto };

export function ProcurementExecutionPanel({ context, mode, permissions, onChanged }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const load = useCallback(async (ctx: ApiContext) => {
    const result = mode === 'receipts' ? await procurementApi.listReceipts(ctx) : await procurementApi.listReturns(ctx);
    const parsed = requireApiPage<PurchaseReceiptDto | PurchaseReturnDto>(result);
    if (parsed.items.length !== parsed.total) throw new Error('未取得完整列表，需要后端补充分页查询契约');
    return parsed.items;
  }, [mode]);
  const records = useApiResource<Array<PurchaseReceiptDto | PurchaseReturnDto>>(context, load);
  const rows = (records.data ?? []).filter(row => JSON.stringify(row).toLowerCase().includes(search.trim().toLowerCase()));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(rows.length / 20)));
  const receiptColumns: Column<PurchaseReceiptDto>[] = [
    { key: 'receiptNo', label: '收货单号' }, { key: 'purchaseOrderId', label: '采购订单ID' },
    { key: 'materialId', label: '物料ID' }, { key: 'receivedQty', label: '本批实收', align: 'right' },
    { key: 'uom', label: '单位' }, { key: 'status', label: '来源状态' },
    { key: 'inspectionResult', label: '检验结果' },
    { key: 'actions', label: '操作', render: row => <div className="flex gap-3 whitespace-nowrap">
      <button disabled={row.status !== 'PENDING_INSPECTION' || !hasPermission(permissions, 'procurement.receipt.inspect', 'quality.iqc.inspect')} onClick={() => setAction({ kind: 'inspect', receipt: row })} className="text-blue-700 disabled:text-slate-400">质检</button>
      <button disabled={row.status !== 'POSTED' || !hasPermission(permissions, 'procurement.return.create')} onClick={() => setAction({ kind: 'return', receipt: row })} className="text-blue-700 disabled:text-slate-400">申请退货</button>
    </div> },
  ];
  const returnColumns: Column<PurchaseReturnDto>[] = [
    { key: 'returnNo', label: '退货单号' }, { key: 'purchaseReceiptId', label: '原收货ID' },
    { key: 'supplierName', label: '供应商' }, { key: 'returnQty', label: '退货数量', align: 'right' },
    { key: 'reason', label: '原因' }, { key: 'status', label: '来源状态' },
    { key: 'actions', label: '操作', render: row => <button disabled={row.status !== 'APPROVED' || !hasPermission(permissions, 'procurement.return.process')} title={row.status !== 'APPROVED' ? '仅已审批退货可办理；审批契约待补充' : '办理退货'} onClick={() => setAction({ kind: 'process', ret: row })} className="text-blue-700 disabled:text-slate-400">办理退货</button> },
  ];
  return <section className="space-y-3">
    <div className="flex gap-2"><input aria-label="搜索采购执行记录" placeholder="搜索单号、物料或状态" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} className="min-w-0 rounded-md border p-2 text-sm" /><button aria-label="刷新采购执行记录" title="刷新" onClick={records.reload} className="rounded-md border p-2"><RefreshCw size={16} /></button></div>
    {records.loading || records.error ? <ApiDataState loading={records.loading} error={records.error} onRetry={records.reload} /> : mode === 'receipts'
      ? <DataTable columns={receiptColumns} data={rows.slice((currentPage - 1) * 20, currentPage * 20) as PurchaseReceiptDto[]} emptyText="暂无收货记录" />
      : <DataTable columns={returnColumns} data={rows.slice((currentPage - 1) * 20, currentPage * 20) as PurchaseReturnDto[]} emptyText="暂无采购退货" />}
    <PageNavigation page={currentPage} pageSize={20} total={rows.length} onPage={setPage} />
    {action && context && <ExecutionAction action={action} context={context} onClose={() => setAction(null)} onSaved={() => { setAction(null); records.reload(); onChanged(); }} />}
  </section>;
}

function ExecutionAction({ action, context, onClose, onSaved }: { action: Action; context: ApiContext; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [reference, setReference] = useState('');
  const [result, setResult] = useState<'ACCEPTED' | 'REJECTED'>('ACCEPTED');
  const [validation, setValidation] = useState('');
  const command = useBusinessCommand();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (action.kind === 'return') {
      const invalid = validatePositiveAmount(qty, action.receipt.receivedQty);
      if (invalid) { setValidation(invalid); return; }
    }
    if ((action.kind !== 'inspect' || result === 'REJECTED') && !reason.trim()) { setValidation('请填写原因'); return; }
    if (action.kind === 'process' && !reference.trim()) { setValidation('请填写退货外部流水号'); return; }
    setValidation('');
    const saved = await command.execute(async key => {
      if (action.kind === 'inspect') {
        const value = await procurementApi.inspectReceipt(context, action.receipt.id, result, reason, key);
        if (!value?.receipt?.id) throw new Error('未取得质检结果，请查询后核对');
        return value;
      }
      if (action.kind === 'return') {
        const value = await procurementApi.createReturn(context, { purchaseReceiptId: action.receipt.id, returnQty: qty, reason }, key);
        if (!value?.id) throw new Error('未取得退货单，请查询后核对');
        return value;
      }
      const value = await procurementApi.processReturn(context, action.ret, reference.trim(), key);
      if (!value?.ret?.id) throw new Error('未取得退货处理结果，请查询后核对');
      return value;
    });
    if (saved) onSaved();
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="procurement-action-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6">
      <h3 id="procurement-action-title" className="mb-4 font-bold">{action.kind === 'inspect' ? '来料整批质检' : action.kind === 'return' ? '申请采购退货' : '办理采购退货'}</h3>
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={command.pending || command.uncertain} className="space-y-4">
          {action.kind === 'inspect' && <label className="block text-sm">检验结论<select aria-label="检验结论" value={result} onChange={event => setResult(event.target.value as typeof result)} className="mt-1 w-full rounded-md border p-2"><option value="ACCEPTED">整批合格</option><option value="REJECTED">整批不合格</option></select></label>}
          {action.kind === 'return' && <label className="block text-sm">退货数量<input aria-label="退货数量" required value={qty} onChange={event => setQty(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>}
          {action.kind === 'process' && <label className="block text-sm">退货外部流水号<input required value={reference} onChange={event => setReference(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>}
          <label className="block text-sm">原因/检验备注<textarea aria-label="原因或检验备注" value={reason} onChange={event => setReason(event.target.value)} className="mt-1 w-full rounded-md border p-2" /></label>
        </fieldset>
        {(validation || command.error) && <p role="alert" className="text-sm text-rose-700">{validation || command.error}</p>}
        {command.uncertain && <p role="status" className="text-sm text-amber-700">结果待核对，重试使用原请求。</p>}
        <footer className="flex justify-end gap-3">
          <button type="button" disabled={command.pending} onClick={() => { if (window.confirm('确认关闭当前表单？')) onClose(); }} className="rounded-md border px-4 py-2 text-sm">取消</button>
          <button disabled={command.pending} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white">{command.pending ? '提交中' : command.uncertain ? '按原请求重试' : '提交'}</button>
        </footer>
      </form>
    </section>
  </div>;
}
