import { ChevronLeft, ChevronRight } from 'lucide-react';

type Props = { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize?: (size: number) => void };

export function PageNavigation({ page, pageSize, total, onPage, onPageSize }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <nav aria-label="列表分页" className="flex flex-wrap items-center justify-end gap-3 py-3 text-sm text-slate-600">
    <span>共 {total} 条 · 第 {page} / {pages} 页</span>
    {onPageSize && <select aria-label="每页条数" value={pageSize} onChange={event => onPageSize(Number(event.target.value))} className="rounded-md border bg-white px-2 py-1"><option value={10}>10 条</option><option value={20}>20 条</option><option value={50}>50 条</option><option value={100}>100 条</option></select>}
    <button type="button" aria-label="上一页" title="上一页" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
    <button type="button" aria-label="下一页" title="下一页" disabled={page >= pages} onClick={() => onPage(page + 1)} className="rounded-md border p-2 disabled:opacity-40"><ChevronRight size={16} /></button>
  </nav>;
}
