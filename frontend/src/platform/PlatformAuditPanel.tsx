import { useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw, Search } from 'lucide-react';
import type { ApiContext } from '../api/client';
import { platformApi, type AuditQuery, type AuditRecordDto } from '../api/platform/client';
import { useApiResource } from '../hooks/useApiResource';
import { ApiDataState } from '../components/ApiDataState';
import { DataTable, type Column } from '../components/DataTable';
import type { ApiPage } from '../shared/apiCollection';

/** Authorized audit filters are applied by the server, never by filtering the snapshot page. */
export function PlatformAuditPanel({ context, onSelect }: { context: ApiContext | null; onSelect: (row: AuditRecordDto) => void }) {
  const [draft, setDraft] = useState({ operator: '', module: '', result: '', startTime: '', endTime: '' });
  const [filter, setFilter] = useState<AuditQuery>({});
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const load = useCallback((scope: ApiContext) => platformApi.listAudits(scope, { ...filter, page, pageSize: 20 }), [filter, page]);
  const data = useApiResource<ApiPage<AuditRecordDto>>(context, load);
  const columns: Column<AuditRecordDto>[] = [
    { key: 'time', label: '时间' }, { key: 'operator', label: '操作人' },
    { key: 'module', label: '模块' }, { key: 'action', label: '动作' },
    { key: 'target', label: '对象' },
    { key: 'result', label: '结果', render: row => ({ success: '成功', failed: '失败', denied: '已拒绝' }[row.result] || row.result || '状态待核实') },
    { key: 'detail', label: '详情', render: row => <button onClick={() => onSelect(row)} className="text-blue-700">查看</button> },
  ];
  return <section data-testid="platform-view-audit" className="space-y-4">
    <h2 className="text-lg font-bold">审计日志</h2>
    <form className="flex flex-wrap items-end gap-3" onSubmit={event => {
      event.preventDefault();
      if (draft.startTime && draft.endTime && draft.startTime > draft.endTime) { setError('结束时间不能早于开始时间'); return; }
      setError('');
      const time = (value: string) => value ? `${value.replace('T', ' ')}:00` : undefined;
      setFilter({ operator: draft.operator.trim() || undefined, module: draft.module.trim() || undefined,
        result: draft.result as AuditQuery['result'] || undefined, startTime: time(draft.startTime), endTime: time(draft.endTime) });
      setPage(1);
    }}>
      {([['operator', '操作人'], ['module', '模块'], ['startTime', '开始时间'], ['endTime', '结束时间']] as const).map(([field, label]) =>
        <label key={field} className="text-xs">{label}<input aria-label={`审计${label}`} type={field.endsWith('Time') ? 'datetime-local' : 'text'}
          value={draft[field]} onChange={event => setDraft(previous => ({ ...previous, [field]: event.target.value }))}
          className="mt-1 block rounded-md border p-2 text-sm" /></label>)}
      <label className="text-xs">操作结果<select aria-label="筛选操作结果" value={draft.result} onChange={event => setDraft(previous => ({ ...previous, result: event.target.value }))} className="mt-1 block rounded-md border bg-white p-2 text-sm">
        <option value="">全部结果</option><option value="success">成功</option><option value="failed">失败</option><option value="denied">已拒绝</option>
      </select></label>
      <button type="submit" className="flex items-center gap-2 rounded-md border p-2 text-sm"><Search size={16} />查询</button>
      <button type="button" aria-label="刷新审计日志" title="刷新审计日志" onClick={data.reload} className="rounded-md border p-2"><RefreshCw size={16} /></button>
    </form>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {data.loading || data.error ? <ApiDataState loading={data.loading} error={data.error} onRetry={data.reload} /> :
      <DataTable columns={columns} data={data.data?.items ?? []} emptyText="没有匹配的审计日志" />}
    <footer className="flex items-center justify-between gap-3 text-sm">
      <span>第 {page} 页 · 当前 {data.data?.items.length ?? 0} 条 · 总数待服务端确认</span>
      <div className="flex gap-2">
        <button aria-label="上一页审计日志" title="上一页" disabled={page <= 1 || data.loading} onClick={() => setPage(value => value - 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
        <button aria-label="下一页审计日志" title="下一页" disabled={data.loading || Boolean(data.error) || (data.data?.items.length ?? 0) < 20} onClick={() => setPage(value => value + 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronRight size={16} /></button>
      </div>
    </footer>
  </section>;
}
