/**
 * 工作台首页
 *
 * 角色 x 指标矩阵 + 来源业务预警 + 待办清单 + 实时动态。
 * 调用链路: App -> WorkbenchPage -> 后端 API（当前使用占位数据）
 */

import { Activity, AlertTriangle, ArrowDown, ArrowUp, Clock, TrendingUp, type LucideIcon } from 'lucide-react';
import type { RoleName } from '../app/moduleRegistry';

interface Metric {
  title: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  theme: 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';
  trend?: 'up' | 'down';
  trendValue?: string;
}

const themeMap = {
  blue: 'bg-blue-50 text-blue-600 border-blue-100',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  amber: 'bg-amber-50 text-amber-600 border-amber-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  purple: 'bg-purple-50 text-purple-600 border-purple-100',
};

const roleMetrics: Record<RoleName, Metric[]> = {
  老板: [
    { title: '本月订单金额', value: '-', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '-', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '-', icon: Activity, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  销售: [
    { title: '本月订单金额', value: '-', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '-', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '-', icon: Activity, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  计划员: [
    { title: '排产交期达成量', value: '-', icon: TrendingUp, theme: 'blue' },
    { title: '物料低水位', value: '-', icon: AlertTriangle, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  采购: [
    { title: '物料低水位', value: '-', icon: AlertTriangle, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  仓管: [
    { title: '物料低水位', value: '-', icon: AlertTriangle, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  财务: [
    { title: '本月订单金额', value: '-', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '-', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '-', icon: Activity, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  车间: [
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  人事: [
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
  超级管理员: [
    { title: '本月订单金额', value: '-', icon: TrendingUp, theme: 'blue' },
    { title: '确认收入', value: '-', icon: Activity, theme: 'emerald' },
    { title: '发货确权金额', value: '-', icon: Activity, theme: 'amber' },
    { title: '未关闭预警', value: '-', icon: AlertTriangle, theme: 'rose' },
    { title: '今日待办', value: '-', icon: Clock, theme: 'purple' },
  ],
};

function StatCard({ metric }: { metric: Metric }) {
  const Icon = metric.icon;
  const cls = themeMap[metric.theme];
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-3">
        <div className="text-slate-500 text-[13px] font-bold">{metric.title}</div>
        <div className={`p-2.5 rounded-xl border ${cls}`}><Icon size={18} /></div>
      </div>
      <div className="text-3xl font-bold text-slate-800 tracking-tight">{metric.value}</div>
      {metric.value === '-' && <div className="text-[11px] text-slate-400 mt-1">数据待接入</div>}
    </div>
  );
}

export function WorkbenchPage({ role, userName }: { role: RoleName; userName: string }) {
  const metrics = roleMetrics[role] ?? [];
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">欢迎回来，{userName}</h1>
        <p className="text-[13px] text-slate-500 mt-1">{role} · {new Date().toLocaleDateString('zh-CN')}</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metrics.map(m => <StatCard key={m.title} metric={m} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">来源业务预警</h2>
          <div className="flex items-center justify-center py-10 text-slate-400 text-[13px]">
            暂无预警
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-800 mb-4">待办清单</h2>
          <div className="flex items-center justify-center py-10 text-slate-400 text-[13px]">
            暂无待办
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 mb-4">实时业务动态</h2>
        <div className="flex items-center justify-center py-10 text-slate-400 text-[13px]">
          暂无动态
        </div>
      </div>
    </div>
  );
}
