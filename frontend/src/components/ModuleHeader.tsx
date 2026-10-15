/**
 * 模块标题栏
 *
 * 左侧彩色圆角图标 + 模块名称 + 副标题，右侧操作按钮。
 * 所有业务模块页面的统一标题栏。
 */

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type IconTheme = 'blue' | 'emerald' | 'amber' | 'rose' | 'purple' | 'cyan';

const themeMap: Record<IconTheme, string> = {
  blue: 'bg-blue-100 text-blue-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  rose: 'bg-rose-100 text-rose-600',
  purple: 'bg-purple-100 text-purple-600',
  cyan: 'bg-cyan-100 text-cyan-600',
};

interface Props {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  theme?: IconTheme;
  action?: ReactNode;
}

export function ModuleHeader({ icon: Icon, title, subtitle, theme = 'blue', action }: Props) {
  return (
    <div className="flex items-center justify-between mb-5">
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${themeMap[theme]}`}>
          <Icon size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
