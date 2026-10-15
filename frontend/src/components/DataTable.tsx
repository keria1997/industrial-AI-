/**
 * 通用数据表格
 * 支持自定义列渲染、对齐、空状态。
 */

import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

interface Props<T> {
  columns: Column<T>[];
  data: T[];
  emptyText?: string;
}

export function DataTable<T extends { [key: string]: any }>({ columns, data, emptyText = '暂无数据' }: Props<T>) {
  if (!data.length) {
    return <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center text-slate-400 text-[14px]">{emptyText}</div>;
  }
  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <thead><tr className="bg-slate-50 border-b border-slate-200">
            {columns.map(c => <th key={c.key} className={`px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.label}</th>)}
          </tr></thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/50 transition-colors">
                {columns.map(c => <td key={c.key} className={`px-4 py-3 text-slate-700 ${c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}`}>{c.render ? c.render(row) : String(row[c.key] ?? '-')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
