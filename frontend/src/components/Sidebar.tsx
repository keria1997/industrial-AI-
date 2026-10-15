/**
 * 侧栏导航组件
 *
 * 按角色过滤模块列表，无权限的模块不渲染。
 * 调用链路: AppShell -> Sidebar -> moduleRegistry
 */

import { getModulesForRole, type AppModule, type RoleName } from '../app/moduleRegistry';

interface Props {
  role: RoleName;
  activeModule: string;
  onNavigate: (moduleId: string) => void;
}

export function Sidebar({ role, activeModule, onNavigate }: Props) {
  const modules = getModulesForRole(role);

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 h-screen">
      <div className="h-16 flex items-center px-5 border-b border-slate-100">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center mr-3">
          <span className="text-white text-[14px] font-bold">AI</span>
        </div>
        <span className="text-[15px] font-bold text-slate-800">工业AI平台</span>
      </div>
      <nav className="flex-1 overflow-y-auto py-3">
        {modules.map((mod: AppModule) => {
          const Icon = mod.icon;
          const active = mod.id === activeModule;
          return (
            <button
              key={mod.id}
              onClick={() => onNavigate(mod.id)}
              className={`w-full flex items-center gap-3 px-5 py-2.5 text-[13px] font-medium transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-600'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Icon size={18} />
              {mod.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
