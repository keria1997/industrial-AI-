/**
 * AI 预警/分析卡片
 *
 * 模块首页中的 AI 智能提醒卡片，包含图标、标题、内容和操作按钮。
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type CardTheme = 'blue' | 'amber' | 'rose' | 'purple' | 'emerald';

const themeMap: Record<CardTheme, { icon: string; border: string }> = {
  blue: { icon: 'bg-blue-50 text-blue-600', border: 'border-blue-100' },
  amber: { icon: 'bg-amber-50 text-amber-600', border: 'border-amber-100' },
  rose: { icon: 'bg-rose-50 text-rose-600', border: 'border-rose-100' },
  purple: { icon: 'bg-purple-50 text-purple-600', border: 'border-purple-100' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-100' },
};

interface Props {
  icon: LucideIcon;
  title: string;
  theme?: CardTheme;
  children: ReactNode;
  actions?: ReactNode;
}

export function AiAlertCard({ icon: Icon, title, theme = 'blue', children, actions }: Props) {
  const t = themeMap[theme];
  return (
    <div className={`bg-white border ${t.border} rounded-2xl p-6 shadow-sm flex flex-col`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2.5 rounded-xl ${t.icon}`}><Icon size={20} /></div>
        <h3 className="text-[15px] font-bold text-slate-800">{title}</h3>
      </div>
      <div className="flex-1 text-[13px] text-slate-600 leading-relaxed space-y-2">{children}</div>
      {actions && <div className="flex gap-2 mt-4">{actions}</div>}
    </div>
  );
}
