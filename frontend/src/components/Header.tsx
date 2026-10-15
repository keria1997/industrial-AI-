/**
 * 顶栏组件
 *
 * 全局搜索 + 消息铃铛 + AI 助手入口 + 用户头像。
 */

import { Bell, Search, Sparkles, LogOut, type LucideIcon } from 'lucide-react';
import type { RoleName } from '../app/moduleRegistry';

interface Props {
  role: RoleName;
  userName: string;
  onOpenAi: () => void;
  onLogout: () => void;
}

export function Header({ role, userName, onOpenAi, onLogout }: Props) {
  return (
    <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="relative w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="搜索订单、客户、物料..."
          className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-[13px] outline-none focus:border-blue-400 focus:bg-white"
        />
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-500 hover:text-slate-700" aria-label="消息通知">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500" />
        </button>
        <button
          onClick={onOpenAi}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-50 text-purple-700 text-[13px] font-medium hover:bg-purple-100"
        >
          <Sparkles size={16} />
          AI 助手
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-[12px] font-bold text-slate-600">
            {userName.charAt(0)}
          </div>
          <div className="text-left">
            <div className="text-[13px] font-medium text-slate-700">{userName}</div>
            <div className="text-[11px] text-slate-400">{role}</div>
          </div>
        </div>
        <button onClick={onLogout} className="p-2 text-slate-400 hover:text-rose-500" aria-label="退出登录">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}
