import { useState } from 'react';
import { Activity, Bot, Cpu, Database, MessageCircle, Settings, ShieldCheck, Sparkles, UserCheck, BarChart3 } from 'lucide-react';
import { aiApi } from '../../api/ai';
import type { ApiContext } from '../../api/client';
import { ApiDataState } from '../../components/ApiDataState';
import { useApiResource } from '../../hooks/useApiResource';
import { requireApiPage } from '../../shared/apiCollection';

type Props = { onOpenAssistant: () => void; apiContext: ApiContext | null };
type TabId = 'copilot' | 'employee' | 'audit';

const loadModels = async (context: ApiContext) => {
  const models = await aiApi.listModels(context);
  if (!Array.isArray(models)) throw new Error('模型配置返回格式不正确');
  return models;
};
const loadDashboard = (context: ApiContext) => aiApi.getDashboard(context);
const loadPlans = async (context: ApiContext) =>
  requireApiPage(await aiApi.listActionPlans(context, { page: 1, pageSize: 20 }));
const displayValue = (value: unknown) =>
  value === null || value === undefined || value === '' ? '未配置' : String(value);
const countValue = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? String(value) : '-';

function ConfigRows({ rows }: { rows: Array<[string, string]> }) {
  return <div className="space-y-2">{rows.map(([label, value]) => (
    <div key={label} className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-white px-3 py-3">
      <span className="text-[12px] font-bold text-slate-500">{label}</span>
      <span className="break-all text-right text-[12px] font-bold text-slate-800">{value}</span>
    </div>
  ))}</div>;
}

export const AIHubManagement = ({ onOpenAssistant, apiContext }: Props) => {
  const [activeTab, setActiveTab] = useState<TabId>('copilot');
  // UI -> business backend; provider credentials and model execution never live in this component.
  const models = useApiResource(apiContext, loadModels);
  const dashboard = useApiResource(apiContext, loadDashboard);
  const plans = useApiResource(apiContext, loadPlans);
  const primaryModels = (models.data ?? []).filter(model => model.isActive === true && model.isPrimary === true);
  const primary = primaryModels.length === 1 ? primaryModels[0] : null;
  const fallback = primary?.fallbackModelId
    ? models.data?.find(model => model.id === primary.fallbackModelId && model.isActive === true)
    : null;
  const modelState = models.loading ? '加载中' : models.error ? '加载失败' : primaryModels.length > 1 ? '主模型配置冲突' : '未配置';
  const gatewayRows: Array<[string, string]> = [
    ['主模型', primary ? primary.name : modelState],
    ['备用模型', fallback ? fallback.name : primary?.fallbackModelId ? '关联模型不可用' : '未配置'],
    ['Temperature', primary ? displayValue(primary.temperature) : modelState],
    ['Max Tokens', primary ? displayValue(primary.maxTokens) : modelState],
    ['超时阈值', primary?.timeoutSeconds != null ? `${primary.timeoutSeconds} 秒` : modelState],
    ['降级策略', '尚未获取配置'],
  ];
  const tabs = [
    { id: 'copilot' as const, label: '工业 Copilot 助手', icon: MessageCircle },
    { id: 'employee' as const, label: 'AI 数字员工专员', icon: UserCheck },
    { id: 'audit' as const, label: '审计与监控', icon: BarChart3 },
  ];

  return (
    <div className="flex h-full w-full flex-col font-sans">
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-4 py-8 md:px-8">
        <header className="mb-6 flex shrink-0 items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-600 text-white"><Sparkles size={24} /></div>
          <div><h1 className="text-[20px] font-bold text-slate-800">AI 智能中枢</h1><p className="mt-1 text-[13px] text-slate-500">工业 Copilot 助手与 AI 数字员工管理</p></div>
        </header>
        <nav className="mb-6 flex w-max max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5">
          {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-bold ${activeTab === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'}`}><Icon size={15} />{label}</button>)}
        </nav>
        <div className="flex-1 space-y-6 overflow-y-auto pb-6">
          {activeTab === 'copilot' && <>
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {[['助手身份', Bot], ['知识范围', Database], ['执行权限', ShieldCheck], ['响应模式', Activity]].map(([title, Icon]: any) => (
                <article key={title} className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="mb-4 flex justify-between"><Icon size={20} className="text-blue-600" /><span className="text-[11px] text-slate-400">尚未获取配置</span></div>
                  <h2 className="text-[13px] font-bold text-slate-500">{title}</h2><div className="mt-2 text-[20px] font-bold text-slate-800">-</div>
                </article>
              ))}
            </div>
            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-800"><Settings size={17} />工业助手配置</h2>
                  <button onClick={onOpenAssistant} className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-[13px] font-bold text-white"><MessageCircle size={15} />打开助手</button>
                </div>
                <div className="grid gap-5 p-6 lg:grid-cols-2">
                  <div><h3 className="mb-3 text-[13px] font-bold text-slate-700">助手基础设定</h3><ConfigRows rows={['默认称呼', '业务风格', '回答深度', '安全策略'].map(label => [label, '尚未获取配置'])} /></div>
                  <div><h3 className="text-[13px] font-bold text-slate-700">可调用能力</h3><ApiDataState empty="尚未获取能力配置" /></div>
                </div>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white p-6">
                <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-800"><Database size={17} />知识库与数据源</h2>
                <ApiDataState empty="尚未获取知识源与同步状态" />
              </section>
            </div>
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <h2 className="flex items-center gap-2 border-b border-slate-100 px-6 py-5 text-[15px] font-bold text-slate-800"><Cpu size={17} />模型网关配置</h2>
              {(models.loading || models.error) && <ApiDataState loading={models.loading} error={models.error} onRetry={models.reload} />}
              <div className="grid gap-6 p-6 lg:grid-cols-2">
                <div><h3 className="mb-3 text-[13px] font-bold text-slate-700">LLM 提供商</h3>
                  {models.data?.length === 0 && <ApiDataState empty="暂无模型配置" />}
                  <div className="space-y-3">{(models.data ?? []).map(model => (
                    <div key={model.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                      <div className="min-w-0"><div className="break-all text-[13px] font-bold text-slate-800">{model.name || '-'}</div><div className="break-all text-[11px] text-slate-500">{model.modelName || '-'}</div></div>
                      <div className="text-right text-[11px] text-slate-500">
                        <span className="block font-mono">{model.apiKeyMasked && /[*•]/.test(model.apiKeyMasked) ? model.apiKeyMasked : '未提供密钥掩码'}</span>
                        <span>{model.isActive === true ? model.isPrimary === true ? '主模型' : '已启用' : model.isActive === false ? '已停用' : '状态未获取'}</span>
                      </div>
                    </div>
                  ))}</div>
                </div>
                <div><h3 className="mb-3 text-[13px] font-bold text-slate-700">网关参数</h3><ConfigRows rows={gatewayRows} /></div>
              </div>
            </section>
          </>}
          {activeTab === 'employee' && <>
            <section className="rounded-lg border border-slate-200 bg-white p-6"><h2 className="text-[15px] font-bold text-slate-800">AI 数字员工专员</h2><ApiDataState empty="尚未获取数字员工配置" /></section>
            <section className="rounded-lg border border-slate-200 bg-white p-6"><h2 className="text-[15px] font-bold text-slate-800">数字员工配置详情</h2><ConfigRows rows={['数字员工名称', '绑定角色', '操作权限', '回复风格', '技能范围', '知识范围'].map(label => [label, '尚未获取配置'])} /></section>
          </>}
          {activeTab === 'audit' && <>
            {(dashboard.loading || dashboard.error) && <ApiDataState loading={dashboard.loading} error={dashboard.error} onRetry={dashboard.reload} />}
            <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
              {[
                ['今日对话', '-', `累计对话：${countValue(dashboard.data?.totalConversations)}`],
                ['待审批方案', countValue(dashboard.data?.pendingActionPlans), '服务端待审批状态'],
                ['平均响应', '-', '尚未获取响应耗时'],
                ['降级触发', '-', '尚未获取降级统计'],
              ].map(([label, value, note]) => <article key={label} className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="text-[12px] font-bold text-slate-500">{label}</h2><div className="mt-2 text-[24px] font-bold text-slate-800">{value}</div><p className="mt-1 text-[11px] text-slate-500">{note}</p></article>)}
            </div>
            <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
              <h2 className="border-b border-slate-100 px-6 py-5 text-[15px] font-bold text-slate-800">最近操作方案</h2>
              <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead><tr className="border-b border-slate-100 text-slate-500">{['时间', '提交人', '方案', '审批路径', '状态'].map(label => <th key={label} className="px-6 py-3">{label}</th>)}</tr></thead><tbody>{(plans.data?.items ?? []).map(plan => (
                <tr key={plan.id} className="border-b border-slate-100"><td className="px-6 py-3">{plan.submittedAt || plan.createdAt || '-'}</td><td className="px-6 py-3">{plan.submittedBy || '-'}</td><td className="px-6 py-3">{plan.title}</td><td className="px-6 py-3">{plan.approvalPath || '-'}</td><td className="px-6 py-3">{({ draft: '草稿', submitted: '已提交', approved: '已审批', rejected: '已驳回', executed: '已执行', cancelled: '已取消' })[plan.status] || '-'}</td></tr>
              ))}</tbody></table></div>
              {(plans.loading || plans.error || !plans.data?.items.length) && <ApiDataState loading={plans.loading} error={plans.error} onRetry={plans.reload} empty="暂无操作方案" />}
            </section>
          </>}
        </div>
      </main>
    </div>
  );
};
