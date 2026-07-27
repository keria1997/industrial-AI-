import React, { type ReactNode } from 'react';

export const AppShell = ({ children }: { children: ReactNode }) => (
  <div className="h-screen min-h-0 bg-[#F8FAFC] text-slate-800 font-sans flex overflow-hidden">
    {children}
  </div>
);

export const AppShellSidebar = ({ children, expanded }: { children: ReactNode; expanded: boolean }) => (
  <aside className={`${expanded ? 'w-[300px]' : 'w-64'} bg-white border-r border-slate-200 shadow-sm hidden lg:flex flex-col z-20 shrink-0 transition-[width] duration-200`}>
    {children}
  </aside>
);

export const AppShellMain = ({ children }: { children: ReactNode }) => (
  <main className="flex-1 flex flex-col h-screen overflow-hidden relative">{children}</main>
);

export const AppShellHeader = ({ children }: { children: ReactNode }) => (
  <header className="h-16 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm flex items-center justify-between px-3 sm:px-5 lg:justify-end lg:px-8 z-10 shrink-0">
    {children}
  </header>
);
