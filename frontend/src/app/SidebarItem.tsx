import React from 'react';
import type { LucideIcon } from 'lucide-react';

type SidebarItemProps = {
  key?: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
};

export const SidebarItem = ({ icon: Icon, label, active, onClick }: SidebarItemProps) => (
  <button
    type="button"
    aria-current={active ? 'page' : undefined}
    onClick={onClick}
    className={`relative my-1 flex w-full items-center overflow-hidden rounded-xl px-5 py-3.5 text-left transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${active ? 'bg-blue-50 font-bold text-blue-600' : 'font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
  >
    {active && <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-r-full bg-blue-600" />}
    <Icon aria-hidden="true" size={18} className={`mr-3 shrink-0 transition-colors ${active ? 'text-blue-600' : 'text-slate-400'}`} />
    <span className="text-[14px]">{label}</span>
  </button>
);
