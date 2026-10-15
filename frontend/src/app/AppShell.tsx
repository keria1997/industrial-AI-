/**
 * 全局布局壳
 *
 * 左侧固定侧栏 + 顶栏 + 主内容区。
 * 调用链路: App -> AppShell -> Sidebar + Header + {children}
 */

import type { ReactNode } from 'react';
import { Sidebar } from '../components/Sidebar';
import { Header } from '../components/Header';
import type { RoleName } from './moduleRegistry';

interface Props {
  role: RoleName;
  userName: string;
  activeModule: string;
  onNavigate: (moduleId: string) => void;
  onOpenAi: () => void;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ role, userName, activeModule, onNavigate, onOpenAi, onLogout, children }: Props) {
  return (
    <div className="h-screen bg-[#F8FAFC] text-slate-800 font-sans flex overflow-hidden">
      <Sidebar role={role} activeModule={activeModule} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <Header role={role} userName={userName} onOpenAi={onOpenAi} onLogout={onLogout} />
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
