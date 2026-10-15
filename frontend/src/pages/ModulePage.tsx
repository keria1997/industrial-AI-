/**
 * 通用模块页面
 *
 * 根据 moduleId 渲染对应的模块内容（当前使用占位内容）。
 * 调用链路: App -> ModulePage
 */

import { moduleRegistry } from '../app/moduleRegistry';

export function ModulePage({ moduleId }: { moduleId: string }) {
  const mod = moduleRegistry.find(m => m.id === moduleId);
  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900 mb-2">{mod?.label ?? moduleId}</h1>
      <p className="text-[13px] text-slate-500 mb-6">模块开发中，敬请期待</p>
      <div className="bg-white border border-slate-200 rounded-2xl p-12 flex items-center justify-center shadow-sm">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
            {mod && <mod.icon size={24} className="text-slate-400" />}
          </div>
          <div className="text-slate-500 text-[14px]">此模块页面正在按 PRD 第 7 章需求开发中</div>
        </div>
      </div>
    </div>
  );
}
