/**
 * 统计卡片组件
 *
 * 用于工作台和各模块看板页的指标展示。
 * 数值缺失时显示 "-" 和 "数据待接入"，不伪造 0。
 */

import type { LucideIcon } from 'lucide-react';

type Theme = 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';

const themeMap: Record<Theme, string> = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

interface Props {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  theme?: Theme;
}

export function StatCard({ title, value, unit, icon: Icon, theme = 'blue' }: Props) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="text-slate-500 text-[13px] font-bold">{title}</div>
        <div className={`p-2.5 rounded-xl border ${themeMap[theme]}`}><Icon size={18} /></div>
      </div>
      <div className="text-3xl font-bold text-slate-800 tracking-tight tabular-nums">
        {value}
        {unit && value !== '-' && <span className="text-slate-400 ml-1 text-sm font-medium">{unit}</span>}
      </div>
      {value === '-' && <div className="text-[11px] text-slate-400 mt-1">数据待接入</div>}
    </div>
  );
}
