/**
 * 工作台首页
 *
 * 按 PRD 7.2 + UI设计文档 4.2 实现四个区域：
 * 1. 欢迎区 + 数据更新时间 + 刷新按钮
 * 2. 角色x指标矩阵卡片
 * 3. 来源业务预警（风险Badge）+ 待办清单（优先级/截止/去处理）
 * 4. 实时业务动态（全部/关键切换）+ 近6个月趋势柱状图
 */

import { useState } from 'react';
import {
  Activity, AlertTriangle, BarChart3, CheckCircle,
  ChevronRight, Clock, FileText, Package, RefreshCcw,
  ShoppingCart, TrendingUp, Truck, Wallet, Zap,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '../components/Badge';
import type { RoleName } from '../app/moduleRegistry';

interface Metric { title: string; value: string; unit?: string; icon: LucideIcon; theme: string; }
type RiskLevel = 'high' | 'medium' | 'low';
interface WBAlert { id: string; risk: RiskLevel; title: string; sourceDoc: string; sourceModule: string; time: string; }
interface WBTodo { id: string; priority: 'P0' | 'P1' | 'P2'; title: string; assignee: string; deadline: string; overdue: boolean; }
type Scope = 'all' | 'key';
interface WBActivity { id: string; type: 'success' | 'warning' | 'info'; icon: LucideIcon; desc: string; sourceDoc: string; time: string; isKey: boolean; }

const METRICS: Record<string, Metric[]> = {
  full: [
    { title: '本月订单金额', value: '\u00a5425,000', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '\u00a5300,000', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '\u00a5150,000', icon: Wallet, theme: 'amber' },
    { title: '排产交期达成', value: '80/100', icon: BarChart3, theme: 'purple' },
    { title: '未关闭预警', value: '3', unit: '条', icon: AlertTriangle, theme: 'rose' },
  ],
  sales: [
    { title: '本月订单金额', value: '\u00a5425,000', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '\u00a5300,000', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '\u00a5150,000', icon: Wallet, theme: 'amber' },
    { title: '未关闭预警', value: '3', unit: '条', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '5', unit: '条', icon: Clock, theme: 'purple' },
  ],
  planner: [
    { title: '排产交期达成', value: '80/100', icon: BarChart3, theme: 'blue' },
    { title: '物料低水位', value: '1', unit: '种', icon: Package, theme: 'amber' },
    { title: '未关闭预警', value: '3', unit: '条', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '5', unit: '条', icon: Clock, theme: 'purple' },
  ],
  minimal: [
    { title: '未关闭预警', value: '3', unit: '条', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '5', unit: '条', icon: Clock, theme: 'purple' },
  ],
};

function getMetrics(role: RoleName): Metric[] {
  if (role === '销售' || role === '财务') return METRICS.sales;
  if (role === '计划员') return METRICS.planner;
  if (role === '老板' || role === '超级管理员') return METRICS.full;
  return METRICS.minimal;
}

const ALERTS: WBAlert[] = [
  { id: 'AL1', risk: 'high', title: '销售订单交期逾期', sourceDoc: 'SO-2026-001', sourceModule: '销售管理', time: '2小时前' },
  { id: 'AL2', risk: 'high', title: '物料库存低于安全线', sourceDoc: 'MAT-001', sourceModule: '库存管理', time: '4小时前' },
  { id: 'AL3', risk: 'medium', title: '采购订单即将到期', sourceDoc: 'PO-2026-001', sourceModule: '采购管理', time: '6小时前' },
];

const TODOS: WBTodo[] = [
  { id: 'TD1', priority: 'P0', title: '确认销售订单 SO-2026-004', assignee: 'admin', deadline: '今天 18:00', overdue: false },
  { id: 'TD2', priority: 'P0', title: '审批采购申请 PR-2026-001', assignee: 'admin', deadline: '今天 12:00', overdue: true },
  { id: 'TD3', priority: 'P1', title: '接收生产需求 DEM-002', assignee: 'admin', deadline: '明天', overdue: false },
  { id: 'TD4', priority: 'P1', title: '处理出库任务重检', assignee: 'admin', deadline: '3天后', overdue: false },
  { id: 'TD5', priority: 'P2', title: '确认收付款 PAY-001', assignee: 'admin', deadline: '下周一', overdue: false },
];

const ACTIVITIES: WBActivity[] = [
  { id: 'A1', type: 'success', icon: CheckCircle, desc: '销售订单 SO-2026-003 已完成', sourceDoc: 'SO-2026-003', time: '10分钟前', isKey: true },
  { id: 'A2', type: 'info', icon: Truck, desc: '采购收货 RCPT-001 入库 60 件', sourceDoc: 'RCPT-001', time: '1小时前', isKey: true },
  { id: 'A3', type: 'warning', icon: AlertTriangle, desc: '库存 MAT-001 低于安全线', sourceDoc: 'MAT-001', time: '2小时前', isKey: true },
  { id: 'A4', type: 'success', icon: FileText, desc: '生产需求 DEM-003 已审批', sourceDoc: 'DEM-003', time: '3小时前', isKey: false },
  { id: 'A5', type: 'info', icon: ShoppingCart, desc: '采购订单 PO-2026-002 已收齐', sourceDoc: 'PO-2026-002', time: '4小时前', isKey: false },
  { id: 'A6', type: 'success', icon: Package, desc: '工单 WO-2026-002 已结案', sourceDoc: 'WO-2026-002', time: '5小时前', isKey: false },
];

const TREND = [
  { m: '5月', v: 180 }, { m: '6月', v: 220 }, { m: '7月', v: 195 },
  { m: '8月', v: 310 }, { m: '9月', v: 280 }, { m: '10月', v: 425 },
];

const themeCls: Record<string, string> = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

function StatCard({ m }: { m: Metric }) {
  const Icon = m.icon;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="text-slate-500 text-[13px] font-bold">{m.title}</div>
        <div className={`p-2.5 rounded-xl border ${themeCls[m.theme] || themeCls.blue}`}><Icon size={18} /></div>
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-slate-800 tracking-tight tabular-nums">{m.value}</div>
      {m.unit && <span className="text-slate-400 ml-1 text-[13px] font-medium">{m.unit}</span>}
    </div>
  );
}

function AlertRow({ a }: { a: WBAlert }) {
  const c = a.risk === 'high' ? 'rose' : a.risk === 'medium' ? 'amber' : 'slate';
  const label = a.risk === 'high' ? '高' : a.risk === 'medium' ? '中' : '低';
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-rose-50/50 transition-colors">
      <Badge color={c as 'rose'}>{label}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-slate-800 truncate">{a.title}</div>
        <div className="text-[12px] text-slate-400 mt-0.5">
          <button className="text-blue-600 hover:underline">{a.sourceDoc}</button>
          <span className="mx-1.5">·</span>{a.sourceModule}
        </div>
      </div>
      <span className="text-[11px] text-slate-400 shrink-0">{a.time}</span>
    </div>
  );
}

function TodoRow({ t }: { t: WBTodo }) {
  const c = t.priority === 'P0' ? 'rose' : t.priority === 'P1' ? 'amber' : 'slate';
  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 last:border-0 hover:bg-blue-50/50 transition-colors">
      <Badge color={c as 'rose'}>{t.priority}</Badge>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-slate-800 truncate">{t.title}</div>
        <div className="text-[12px] text-slate-400 mt-0.5">
          {t.assignee}<span className="mx-1.5">·</span>
          <span className={t.overdue ? 'text-rose-500 font-medium' : ''}>{t.overdue ? '已逾期 · ' : ''}{t.deadline}</span>
        </div>
      </div>
      <button className="shrink-0 text-[12px] font-medium text-blue-600 hover:text-blue-700 flex items-center gap-0.5">
        去处理<ChevronRight size={14} />
      </button>
    </div>
  );
}

function Timeline({ scope }: { scope: Scope }) {
  const items = scope === 'all' ? ACTIVITIES : ACTIVITIES.filter(a => a.isKey);
  if (!items.length) return <div className="py-10 text-center text-slate-400 text-[13px]">暂无动态</div>;
  return items.map(act => {
    const Icon = act.icon;
    const ic = act.type === 'success' ? 'bg-emerald-50 text-emerald-600' : act.type === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600';
    return (
      <div key={act.id} className="flex items-start gap-3 px-5 py-3 border-b border-slate-100 last:border-0">
        <div className={`p-1.5 rounded-lg shrink-0 ${ic}`}><Icon size={14} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-slate-800">{act.desc}</div>
          <div className="text-[12px] text-slate-400 mt-0.5">
            <button className="text-blue-600 hover:underline">{act.sourceDoc}</button>
            <span className="mx-1.5">·</span>{act.time}
          </div>
        </div>
      </div>
    );
  });
}

function TrendChart() {
  const max = Math.max(...TREND.map(d => d.v));
  return (
    <div className="flex items-end gap-3 h-36 px-4">
      {TREND.map(d => (
        <div key={d.m} className="flex-1 flex flex-col items-center gap-1">
          <span className="text-[11px] text-slate-500 font-medium tabular-nums">{d.v}K</span>
          <div
            className="w-full max-w-[42px] rounded-t-lg bg-blue-500 hover:bg-blue-600 transition-colors cursor-pointer"
            style={{ height: `${(d.v / max) * 100}%`, minHeight: '8px' }}
          />
          <span className="text-[11px] text-slate-400">{d.m}</span>
        </div>
      ))}
    </div>
  );
}

export function WorkbenchPage({ role, userName }: { role: RoleName; userName: string }) {
  const [scope, setScope] = useState<Scope>('key');
  const [refreshing, setRefreshing] = useState(false);
  const metrics = getMetrics(role);
  const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">欢迎回来，{userName}</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            {role} · {new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-slate-400">数据更新 {now}</span>
          <button
            onClick={() => { setRefreshing(true); setTimeout(() => setRefreshing(false), 500); }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <RefreshCcw size={14} className={refreshing ? 'animate-spin' : ''} />刷新
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map(m => <StatCard key={m.title} m={m} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <AlertTriangle size={16} className="text-rose-500" />
            <h2 className="text-[15px] font-bold text-slate-800">来源业务预警</h2>
            <Badge color="rose">{ALERTS.length}</Badge>
          </div>
          {ALERTS.map(a => <AlertRow key={a.id} a={a} />)}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
            <Zap size={16} className="text-amber-500" />
            <h2 className="text-[15px] font-bold text-slate-800">待办清单</h2>
            <Badge color="amber">{TODOS.length}</Badge>
          </div>
          {TODOS.map(t => <TodoRow key={t.id} t={t} />)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-800">实时业务动态</h2>
            <div className="flex gap-0.5 bg-slate-100 rounded-lg p-0.5">
              {(['all', 'key'] as Scope[]).map(s => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${scope === s ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                >{s === 'all' ? '全部' : '关键事件'}</button>
              ))}
            </div>
          </div>
          <Timeline scope={scope} />
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-[15px] font-bold text-slate-800">近 6 个月订单趋势</h2>
            <p className="text-[12px] text-slate-400 mt-0.5">单位：千元</p>
          </div>
          <div className="pt-4 pb-2"><TrendChart /></div>
        </div>
      </div>
    </div>
  );
}
