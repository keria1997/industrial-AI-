import { useCallback, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { listAllocationFacts, listArApLedger, type LedgerFilter, type ArApLedgerRow, type AllocationFact } from '../../../api/finance-closure';
import { hasPermission } from '../../../app/permissions';
import { useApiResource } from '../../../hooks/useApiResource';
import { ApiDataState } from '../../../components/ApiDataState';
import { DataTable, type Column } from '../../../components/DataTable';
import { PageNavigation } from '../../../components/PageNavigation';
import { formatAmount } from '../../../shared/format';
import type { ApiPage } from '../../../shared/apiCollection';

const status = (value: string) => ({ draft: '草稿', pending: '待办理', processing: '办理中', done: '已完成',
  CONFIRMED: '已确认', REVERSED: '已冲销', reversed: '已冲销', void: '已作废' }[value] || value || '状态待核实');

export function FinanceClosurePanel({ context, mode, permissions }: {
  context: ApiContext | null; mode: 'ledger' | 'allocations'; permissions?: string[];
}) {
  // The combined ledger requires both permissions in the currently published server implementation.
  const canRead = mode === 'ledger' ? hasPermission(permissions, 'finance.receivable.read') && hasPermission(permissions, 'finance.payable.read')
    : hasPermission(permissions, 'finance.payment.read');
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState({ partyId: '', currency: '', status: '', dueDate: '', search: '' });
  const [filter, setFilter] = useState<LedgerFilter>({});
  const [search, setSearch] = useState('');
  const loadLedger = useCallback((scope: ApiContext) => listArApLedger(scope, filter), [filter]);
  const loadAllocations = useCallback((scope: ApiContext) => listAllocationFacts(scope, page, search), [page, search]);
  const ledger = useApiResource<ArApLedgerRow[]>(canRead && mode === 'ledger' ? context : null, loadLedger);
  const allocations = useApiResource<ApiPage<AllocationFact>>(canRead && mode === 'allocations' ? context : null, loadAllocations);
  const resource = mode === 'ledger' ? ledger : allocations;
  const ledgerColumns: Column<ArApLedgerRow>[] = [
    { key: 'financeId', label: '财务单据ID' },
    { key: 'documentType', label: '类型', render: row => ({ RECEIVABLE: '应收', PAYABLE: '应付' }[row.documentType] || row.documentType) },
    { key: 'partyName', label: '往来单位' }, { key: 'currency', label: '币种' },
    { key: 'totalAmount', label: '单据金额', align: 'right', render: row => formatAmount(row.totalAmount) },
    { key: 'allocatedAmount', label: '已结金额', align: 'right', render: row => formatAmount(row.allocatedAmount) },
    { key: 'outstandingAmount', label: '未结金额', align: 'right', render: row => formatAmount(row.outstandingAmount) },
    { key: 'status', label: '状态', render: row => status(row.status) },
    { key: 'sourceId', label: '来源ID' },
  ];
  const allocationColumns: Column<AllocationFact>[] = [
    { key: 'allocationNo', label: '核销单号' }, { key: 'paymentId', label: '收付款ID' },
    { key: 'currency', label: '币种' },
    { key: 'lines', label: '逐行核销', render: row => Array.isArray(row.lines) ? <div className="space-y-1">{row.lines.map((line, index) =>
      <div key={index}>{line.documentType} · {line.documentId}：{formatAmount(line.amount)} {row.currency}</div>)}</div> : '-' },
    { key: 'status', label: '状态', render: row => status(row.status) },
    { key: 'createdBy', label: '办理人' }, { key: 'createdAt', label: '创建时间' },
  ];
  if (!canRead) return <ApiDataState error={mode === 'ledger' ? '合并台账需同时具备应收、应付查看权限' : '无核销事实查看权限'} />;
  return <section aria-label={mode === 'ledger' ? 'AR/AP合并台账' : '核销事实'} className="space-y-4">
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault(); setFilter({ partyId: draft.partyId.trim(), currency: draft.currency.trim(), status: draft.status.trim(), dueDate: draft.dueDate });
      setSearch(draft.search.trim()); setPage(1);
    }}>
      {(mode === 'ledger' ? [['partyId', '往来单位ID'], ['currency', '币种'], ['status', '状态'], ['dueDate', '到期日']] : [['search', '核销单号或来源']]).map(([field, label]) =>
        <label key={field} className="text-xs">{label}<input aria-label={label} type={field === 'dueDate' ? 'date' : 'text'}
          value={draft[field]} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))}
          className="mt-1 block rounded-md border p-2 text-sm" /></label>)}
      <button className="rounded-md border px-3 py-2 text-sm">查询</button>
      <button type="button" title="刷新" aria-label="刷新财务闭环事实" onClick={resource.reload} className="rounded-md border p-2"><RefreshCw size={16} /></button>
    </form>
    {mode === 'ledger' && <p role="status" className="text-sm text-amber-700">当前接口每类单据最多返回 1000 条；本页不提供全盘汇总，请按往来单位、币种和日期缩小范围。</p>}
    <p className="text-sm text-slate-500">核销与冲销办理等待余额、审批及并发规则完成验证。</p>
    {resource.loading || resource.error ? <ApiDataState loading={resource.loading} error={resource.error} onRetry={resource.reload} /> :
      mode === 'ledger' ? <DataTable columns={ledgerColumns} data={ledger.data ?? []} emptyText="暂无应收应付记录" /> :
        <DataTable columns={allocationColumns} data={allocations.data?.items ?? []} emptyText="暂无核销事实" />}
    {mode === 'allocations' && allocations.data && <PageNavigation page={page} pageSize={20} total={allocations.data.total} onPage={setPage} />}
  </section>;
}
