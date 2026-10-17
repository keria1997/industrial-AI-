import { useState } from 'react';
import { X } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { platformApi } from '../../../api/platform/client';
import { useApiResource } from '../../../hooks/useApiResource';
import { businessCommandScope, useBusinessCommand } from '../../../hooks/useBusinessCommand';
import { ApiDataState } from '../../../components/ApiDataState';
import type { WorkOrderDto } from '../../../api/production/operations';

const loadResources = async (context: ApiContext) => {
  const [orgUnits, resources] = await Promise.all([platformApi.listOrgUnits(context), platformApi.listResources(context)]);
  return { orgUnits, resources };
};

/** MPS -> authorized factory/work center -> business API. Resource codes are never guessed. */
export function ProductionWorkCenterModal({ context, demandId, factoryResourceId, onSubmit, onCreated, onClose }: {
  context: ApiContext | null;
  demandId: string;
  factoryResourceId: string;
  onSubmit: (workCenterResourceId: string, key: string) => Promise<WorkOrderDto>;
  onCreated: (order: WorkOrderDto) => void;
  onClose: () => void;
}) {
  const data = useApiResource(context, loadResources);
  const [workCenter, setWorkCenter] = useState('');
  const command = useBusinessCommand(businessCommandScope(context, demandId, 'work-order-create'));
  const factories = data.data?.orgUnits.filter(item =>
    item.type === 'factory' && item.status === 'enabled' && [item.id, item.code].includes(factoryResourceId)) ?? [];
  const choices = factories.length === 1 ? data.data?.resources.filter(item =>
    item.type === 'work_center' && item.status === 'enabled' && item.factoryOrgId === factories[0].id) ?? [] : [];
  const submit = async () => {
    if (!command.uncertain && !choices.some(item => item.code === workCenter)) return;
    const order = await command.execute(key => onSubmit(workCenter, key));
    if (order) onCreated(order);
  };
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="work-center-title" className="w-full max-w-lg space-y-4 rounded-lg bg-white p-6">
      <header className="flex items-center justify-between">
        <h3 id="work-center-title" className="font-bold">选择工单工作中心</h3>
        <button aria-label="关闭工作中心选择" disabled={command.pending} onClick={onClose}><X size={18} /></button>
      </header>
      {data.loading || data.error ? <ApiDataState loading={data.loading} error={data.error} onRetry={data.reload} /> :
        <label className="block text-sm">工作中心
          <select aria-label="工单工作中心" value={workCenter} disabled={command.pending || command.uncertain}
            onChange={event => setWorkCenter(event.target.value)} className="mt-2 w-full rounded-md border p-2">
            <option value="">请选择工作中心</option>
            {choices.map(item => <option key={item.id} value={item.code}>{item.name}（{item.code}）</option>)}
          </select>
        </label>}
      {!data.loading && !data.error && choices.length === 0 && <p role="status" className="text-sm text-amber-700">当前需求工厂没有可用的授权工作中心，请核对资源归属与权限。</p>}
      {command.error && <p role="alert" className="text-sm text-rose-700">{command.error}</p>}
      {command.uncertain && <p role="status" className="text-sm text-amber-700">提交结果待核实，重试会复用原工作中心、请求体和幂等键。</p>}
      <footer className="flex justify-end gap-3">
        <button disabled={command.pending} onClick={onClose} className="rounded-md border px-4 py-2 text-sm">取消</button>
        <button disabled={command.pending || (!command.uncertain && !choices.some(item => item.code === workCenter))}
          onClick={() => void submit()} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-40">
          {command.pending ? '提交中' : command.uncertain ? '按原请求重试' : '创建工单'}
        </button>
      </footer>
    </section>
  </div>;
}
