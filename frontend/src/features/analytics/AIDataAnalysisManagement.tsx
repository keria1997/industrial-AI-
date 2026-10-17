import { useRef, useState } from 'react';
import { Activity, AlertTriangle, BadgeDollarSign, BrainCircuit, CheckCircle2, GitMerge, LayoutDashboard, Layers, MessageCircle, PieChart, Send, Settings, Target } from 'lucide-react';
import { aiApi, type InsightDto, type NL2SQLResponse } from '../../api/ai';
import type { ApiContext } from '../../api/client';
import { ApiDataState } from '../../components/ApiDataState';
import { useApiResource } from '../../hooks/useApiResource';
import { loadApiCollection } from '../../shared/apiCollection';

type Props = { apiContext: ApiContext | null };
type Tab = 'dashboard' | 'copilot' | 'rootcause' | 'sandbox';
const loadInsights = (context: ApiContext) =>
  loadApiCollection((page, pageSize) => aiApi.listInsights(context, { page, pageSize, status: 'active' }));

function InsightList({ items }: { items: InsightDto[] }) {
  return <div className="space-y-3">{items.map(item => (
    <article key={item.id} className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap justify-between gap-2"><h3 className="text-[14px] font-bold text-slate-800">{item.title}</h3><span className="text-[11px] text-slate-500">{item.createdAt || '-'}</span></div>
      <p className="mt-2 whitespace-pre-wrap text-[13px] leading-6 text-slate-600">{item.summary || '尚未返回分析摘要'}</p>
      <div className="mt-2 text-[11px] text-slate-400">来源：{item.sourceType || '-'} {item.sourceId || ''}</div>
    </article>
  ))}</div>;
}

function MissingMetric({ label, unit = '' }: { label: string; unit?: string }) {
  return <article className="rounded-lg border border-slate-200 bg-white p-5">
    <h3 className="text-[13px] font-bold text-slate-500">{label}</h3>
    <div className="my-3 text-[28px] font-bold text-slate-800">- <span className="text-[12px] font-medium text-slate-500">{unit}</span></div>
    <p className="text-[11px] text-slate-400">尚未获取指标数据</p>
  </article>;
}

export function AIDataAnalysisManagement({ apiContext }: Props) {
  const [tab, setTab] = useState<Tab>('dashboard');
  const insights = useApiResource(apiContext, loadInsights);
  const [question, setQuestion] = useState('');
  const [askedQuestion, setAskedQuestion] = useState('');
  const [queryResult, setQueryResult] = useState<NL2SQLResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const pending = useRef(false);
  const scope = `${apiContext?.tenantId || ''}:${apiContext?.accessToken || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const [materialCost, setMaterialCost] = useState(0);
  const [demandGrowth, setDemandGrowth] = useState(0);
  const query = async () => {
    if (!question.trim() || pending.current) return;
    const requestScope = scope;
    pending.current = true;
    setQueryLoading(true);
    setAskedQuestion(question.trim());
    setQueryResult(null);
    setQueryError(null);
    try {
      if (!apiContext) throw new Error('请登录后查询');
      // Frontend -> business backend only; no SQL execution, prompt or local report generation.
      const response = await aiApi.nl2sql(apiContext, question.trim());
      if (scopeRef.current !== requestScope) return;
      if (!response || typeof response.sql !== 'string') throw new Error('数据问答返回格式不正确');
      if (response.error) throw new Error(response.error);
      if (response.result != null && !Array.isArray(response.result)) throw new Error('查询结果格式不正确');
      setQueryResult(response);
    } catch (error) {
      if (scopeRef.current === requestScope) setQueryError(error instanceof Error ? error.message : '查询失败');
    } finally {
      if (scopeRef.current === requestScope) { pending.current = false; setQueryLoading(false); }
    }
  };
  const tabs = [
    { id: 'dashboard' as const, name: '经营决策舱', icon: LayoutDashboard },
    { id: 'copilot' as const, name: 'AI 数据问答 (NL2SQL)', icon: MessageCircle },
    { id: 'rootcause' as const, name: '智能归因树', icon: GitMerge },
    { id: 'sandbox' as const, name: '推演沙盘', icon: Layers },
  ];
  const resultRows = queryResult?.result ?? [];
  const columns = [...new Set<string>(resultRows.flatMap(row => Object.keys(row)))];

  return <div className="flex h-full w-full flex-col bg-[#F5F7FA]">
    <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden px-4 py-8 md:px-8">
      <header className="mb-6 flex shrink-0 items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-600 text-white"><BrainCircuit size={24} /></div>
        <div><h1 className="text-[20px] font-bold text-slate-800">AI 数据分析</h1><p className="mt-1 text-[13px] text-slate-500">看过去 · 问原因 · 测未来</p></div>
      </header>
      <nav className="mb-6 flex w-max max-w-full shrink-0 gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1.5">
        {tabs.map(({ id, name, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-md px-4 py-2.5 text-[13px] font-bold ${tab === id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-blue-50'}`}><Icon size={15} />{name}</button>)}
      </nav>
      <div className="flex-1 space-y-6 overflow-y-auto pb-6">
        {tab === 'dashboard' && <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <MissingMetric label="本月总营收 (预估)" unit="万元" /><MissingMetric label="综合毛利率" unit="%" />
            <MissingMetric label="整体订单准交率" unit="%" /><MissingMetric label="全厂设备综合效率 (OEE)" unit="%" />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <section className="rounded-lg border border-slate-200 bg-white p-6">
              <h2 className="flex items-center gap-2 text-[15px] font-bold text-slate-800"><Target size={17} />部门绩效达成雷达</h2>
              <div data-testid="performance-radar" className="relative mx-auto mt-6 aspect-square w-full max-w-72">
                <svg viewBox="0 0 240 240" className="h-full w-full" aria-label="暂无绩效雷达数据">
                  {[90, 65, 40].map(radius => <polygon key={radius} points={Array.from({ length: 6 }, (_, index) => {
                    const angle = index * Math.PI / 3 - Math.PI / 2;
                    return `${120 + radius * Math.cos(angle)},${120 + radius * Math.sin(angle)}`;
                  }).join(' ')} fill="none" stroke="#e2e8f0" />)}
                  {['销售转化', '生产达成', '采购准交', '质量合格', '库存周转', '回款率'].map((label, index) => {
                    const angle = index * Math.PI / 3 - Math.PI / 2;
                    return <g key={label}><line x1="120" y1="120" x2={120 + 90 * Math.cos(angle)} y2={120 + 90 * Math.sin(angle)} stroke="#e2e8f0" /><text x={120 + 111 * Math.cos(angle)} y={120 + 105 * Math.sin(angle)} textAnchor="middle" dominantBaseline="middle" fill="#64748b" fontSize="10">{label}</text></g>;
                  })}
                </svg>
                <div className="absolute inset-0 flex items-center justify-center"><span className="rounded-md bg-white/95 p-2 text-[12px] text-slate-500">暂无数据</span></div>
              </div>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-6 lg:col-span-2">
              <h2 className="mb-5 flex items-center gap-2 text-[15px] font-bold text-slate-800"><AlertTriangle size={17} />全平台高风险聚合监测</h2>
              <InsightList items={(insights.data ?? []).filter(item => ['critical', 'warning'].includes(item.severity))} />
              {(insights.loading || insights.error || !insights.data?.some(item => ['critical', 'warning'].includes(item.severity))) && <ApiDataState loading={insights.loading} error={insights.error} onRetry={insights.reload} empty="暂无 AI 预警" />}
            </section>
          </div>
        </>}
        {tab === 'copilot' && <section className="flex min-h-[550px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-6 py-5 text-[15px] font-bold text-slate-800">AI 数据问答</h2>
          <div className="flex-1 space-y-4 p-6">
            {askedQuestion && <p className="whitespace-pre-wrap text-[14px] text-slate-700">{askedQuestion}</p>}
            {(queryLoading || queryError) && <ApiDataState loading={queryLoading} error={queryError} onRetry={query} />}
            {!queryResult && !queryLoading && !queryError && <ApiDataState empty="暂无查询结果" />}
            {queryResult && <>
              <p className="whitespace-pre-wrap text-[13px] text-slate-600">{queryResult.explanation}</p>
              {queryResult.sql && <details className="text-[12px] text-slate-500"><summary>查询语句</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap">{queryResult.sql}</pre></details>}
              {resultRows.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-[12px]"><thead><tr>{columns.map(column => <th key={column} className="border-b px-3 py-2">{column}</th>)}</tr></thead><tbody>{resultRows.map((row, index) => <tr key={index}>{columns.map(column => <td key={column} className="border-b px-3 py-2">{row[column] == null ? '-' : typeof row[column] === 'object' ? JSON.stringify(row[column]) : String(row[column])}</td>)}</tr>)}</tbody></table></div>
                : <ApiDataState empty={queryResult.result === undefined ? '已返回查询语句，尚未返回执行结果' : '暂无查询结果'} />}
            </>}
          </div>
          <form onSubmit={event => { event.preventDefault(); query(); }} className="flex gap-3 border-t border-slate-100 p-4">
            <input aria-label="数据分析问题" value={question} onChange={event => setQuestion(event.target.value)} placeholder="输入数据查询问题" className="min-w-0 flex-1 rounded-md border border-slate-200 px-4 text-[13px]" />
            <button aria-label="发送数据查询" disabled={queryLoading || !question.trim()} className="flex h-10 w-10 items-center justify-center rounded-md bg-blue-600 text-white disabled:opacity-50"><Send size={17} /></button>
          </form>
        </section>}
        {tab === 'rootcause' && <section className="min-h-[360px] rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-5 flex items-center gap-2 text-[15px] font-bold text-slate-800"><GitMerge size={17} />决策树追溯视图</h2>
          <ApiDataState empty="尚未获取归因链路" />
        </section>}
        {tab === 'sandbox' && <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-6 flex items-center gap-2 text-[15px] font-bold text-slate-800"><Settings size={17} />宏观环境变量模拟设定 (What-If)</h2>
            <div className="space-y-8">
              <label className="block text-[13px] text-slate-700">原材料采购成本变化：{materialCost}%<input aria-label="原材料采购成本变化" type="range" min="0" max="30" value={materialCost} onChange={event => setMaterialCost(Number(event.target.value))} className="mt-4 w-full" /></label>
              <label className="block text-[13px] text-slate-700">市场需求变化：{demandGrowth}%<input aria-label="市场需求变化" type="range" min="0" max="50" step="5" value={demandGrowth} onChange={event => setDemandGrowth(Number(event.target.value))} className="mt-4 w-full" /></label>
            </div>
          </section>
          <section className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-5 text-[15px] font-bold text-slate-800">AI 动态推演结果 (影响预估)</h2>
            <ApiDataState empty="尚未获取推演结果与业务基线" />
            <div className="grid gap-4 md:grid-cols-2"><MissingMetric label="预估月度净利润" unit="万元" /><MissingMetric label="预估平均订单交付周期" unit="天" /><MissingMetric label="预估库存资金占用总额" unit="万元" /></div>
          </section>
        </div>}
      </div>
    </main>
  </div>;
}
