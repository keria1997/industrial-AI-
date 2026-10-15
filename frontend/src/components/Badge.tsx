/**
 * 状态标签组件
 * amber=待处理, blue=进行中, emerald=已完成, slate=已取消, rose=拒绝, purple=AI
 */

import type { ReactNode } from 'react';

type Color = 'amber' | 'blue' | 'emerald' | 'slate' | 'rose' | 'purple';

const colorMap: Record<Color, string> = {
  amber: 'bg-amber-50 text-amber-700',
  blue: 'bg-blue-50 text-blue-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  slate: 'bg-slate-100 text-slate-500',
  rose: 'bg-rose-50 text-rose-700',
  purple: 'bg-purple-50 text-purple-700',
};

export function Badge({ color, children }: { color: Color; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${colorMap[color]}`}>
      {children}
    </span>
  );
}
