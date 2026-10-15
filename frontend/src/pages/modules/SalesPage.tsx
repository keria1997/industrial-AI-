/**
 * 销售管理页面
 *
 * 按 PRD 7.3 + UI设计文档 4.3 + 参考截图布局实现。
 * 监控舱: 统计卡片 + AI 预警卡片 + 趋势图
 * 订单: 筛选栏 + 状态统计条 + 订单表格（含状态Badge和操作按钮）
 */

import { useState } from 'react';
import {
  AlertTriangle, BarChart3, CheckCircle, ChevronRight, Truck,
  DollarSign, FileText, MessageSquare, Plus, ShoppingCart,
  Target, TrendingUp, Users, Zap,
} from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { AiAlertCard } from '../../components/AiAlertCard';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { id: 'dashboard', label: '销售监控舱' },
  { id: 'quotes', label: '产品报价' },
  { id: 'orders', label: '销售订单' },
  { id: 'customers', label: '客户管理' },
  { id: 'settings', label: '基础数据' },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING_CONFIRMATION: { label: '待发货', color: 'amber' },
  CONFIRMED: { label: '已确认', color: 'blue' },
  REPLENISHING: { label: '生产补货中', color: 'purple' },
  PARTIALLY_SHIPPED: { label: '部分发货', color: 'blue' },
  SHIPPED: { label: '已发货', color: 'emerald' },
  COMPLETED: { label: '已完成', color: 'emerald' },
  CANCELED: { label: '已取消', color: 'slate' },
};

interface Order { orderNo: string; customer: string; status: string; totalAmount: string; deliveryDate: string; progress: string; overdue: boolean; }
interface Quote { quoteNo: string; customer: string; totalAmount: string; status: string; validUntil: string; }
interface Customer { code: string; name: string; creditLevel: string; phone: string; status: string; }

const ORDERS: Order[] = [
  { orderNo: 'SO-2026-001', customer: '华为技术', status: 'CONFIRMED', totalAmount: '¥125,000.00', deliveryDate: '2026-10-20', progress: '0/10', overdue: false },
  { orderNo: 'SO-2026-002', customer: '中兴通讯', status: 'PARTIALLY_SHIPPED', totalAmount: '¥80,000.00', deliveryDate: '2026-10-15', progress: '4/10', overdue: true },
  { orderNo: 'SO-2026-003', customer: '比亚迪', status: 'COMPLETED', totalAmount: '¥220,000.00', deliveryDate: '2026-10-10', progress: '15/15', overdue: false },
  { orderNo: 'SO-2026-004', customer: '宁德时代', status: 'PENDING_CONFIRMATION', totalAmount: '¥95,000.00', deliveryDate: '2026-11-01', progress: '0/8', overdue: false },
  { orderNo: 'SO-2026-005', customer: '华为技术', status: 'SHIPPED', totalAmount: '¥180,000.00', deliveryDate: '2026-10-12', progress: '12/12', overdue: false },
];

const QUOTES: Quote[] = [
  { quoteNo: 'QT-2026-001', customer: '华为技术', totalAmount: '¥120,000.00', status: '生效中', validUntil: '2026-11-15' },
  { quoteNo: 'QT-2026-002', customer: '中兴通讯', totalAmount: '¥85,000.00', status: '草稿', validUntil: '2026-11-30' },
];

const CUSTOMERS: Customer[] = [
  { code: 'CUST-001', name: '华为技术有限公司', creditLevel: 'A', phone: '0755-28780808', status: '正常' },
  { code: 'CUST-002', name: '中兴通讯股份有限公司', creditLevel: 'B', phone: '0755-26770000', status: '正常' },
  { code: 'CUST-003', name: '比亚迪股份有限公司', creditLevel: 'A', phone: '0755-89888888', status: '正常' },
  { code: 'CUST-004', name: '宁德时代新能源', creditLevel: 'A', phone: '0593-8901111', status: '正常' },
];

const TREND = [
  { m: '5月', v: 180 }, { m: '6月', v: 220 }, { m: '7月', v: 195 },
  { m: '8月', v: 310 }, { m: '9月', v: 280 }, { m: '10月', v: 425 },
];

const actionBtn = 'h-8 px-3 rounded-lg text-[12px] font-medium transition-colors';

export function SalesPage() {
  const [tab, setTab] = useState('dashboard');

  const orderCols: Column<Order>[] = [
    { key: 'orderNo', label: '订单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.orderNo}</button> },
    { key: 'customer', label: '客户' },
    { key: 'status', label: '状态', render: r => { const s = STATUS_MAP[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : r.status; } },
    { key: 'totalAmount', label: '总金额', align: 'right' },
    { key: 'deliveryDate', label: '交期', render: r => <span className={r.overdue ? 'text-rose-500 font-medium' : ''}>{r.deliveryDate}</span> },
    { key: 'progress', label: '已发/订购', align: 'center' },
    { key: 'actions', label: '操作', align: 'center', render: r => (
      <div className="flex gap-1">
        {r.status === 'PENDING_CONFIRMATION' && <button className={`${actionBtn} bg-blue-50 text-blue-600 hover:bg-blue-100`}>确认</button>}
        {r.status === 'CONFIRMED' && <button className={`${actionBtn} bg-blue-50 text-blue-600 hover:bg-blue-100`}>去发货</button>}
        {r.status === 'PENDING_CONFIRMATION' && <button className={`${actionBtn} bg-rose-50 text-rose-600 hover:bg-rose-100`}>取消</button>}
        <button className={`${actionBtn} text-slate-500 hover:bg-slate-100`}>查看</button>
      </div>
    )},
  ];

  const quoteCols: Column<Quote>[] = [
    { key: 'quoteNo', label: '报价单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.quoteNo}</button> },
    { key: 'customer', label: '客户' },
    { key: 'totalAmount', label: '报价总额', align: 'right' },
    { key: 'status', label: '状态', render: r => <Badge color={r.status === '生效中' ? 'emerald' : 'slate'}>{r.status}</Badge> },
    { key: 'validUntil', label: '有效期至' },
    { key: 'actions', label: '操作', align: 'center', render: () => <button className={`${actionBtn} text-slate-500 hover:bg-slate-100`}>查看</button> },
  ];

  const custCols: Column<Customer>[] = [
    { key: 'code', label: '编码' },
    { key: 'name', label: '客户名称' },
    { key: 'creditLevel', label: '信用等级', align: 'center', render: r => <Badge color={r.creditLevel === 'A' ? 'emerald' : 'amber'}>{r.creditLevel}</Badge> },
    { key: 'phone', label: '联系电话' },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">正常</Badge> },
  ];

  const maxV = Math.max(...TREND.map(d => d.v));

  return (
    <div>
      <ModuleHeader
        icon={DollarSign}
        title="销售监控舱"
        subtitle="实时监控 · 数据驱动 · 预警提示"
        theme="blue"
        action={
          <button className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700">
            <ShoppingCart size={15} />快速开单
          </button>
        }
      />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: '生效报价数', value: '0', unit: '份', icon: Target, theme: 'bg-emerald-50 text-emerald-600' },
              { title: '报价 → 订单', value: '5', unit: '单', icon: ShoppingCart, theme: 'bg-blue-50 text-blue-600' },
              { title: '异常停潢单', value: '1', unit: '单', icon: AlertTriangle, theme: 'bg-rose-50 text-rose-600' },
              { title: '订单销售额', value: '2910.1', unit: '万元', icon: DollarSign, theme: 'bg-amber-50 text-amber-600' },
            ].map(c => (
              <div key={c.title} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-start mb-3">
                  <div className="text-slate-500 text-[13px] font-bold">{c.title}</div>
                  <div className={`p-2 rounded-xl ${c.theme}`}><c.icon size={18} /></div>
                </div>
                <div className="text-3xl font-bold text-slate-800 tabular-nums">{c.value}<span className="text-slate-400 ml-1 text-sm font-medium">{c.unit}</span></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <AiAlertCard icon={Zap} title="AI 订单转化延期预警 & 智能挽回" theme="purple"
              actions={<><button className="h-9 px-4 rounded-lg bg-purple-600 text-white text-[12px] font-medium hover:bg-purple-700">生成挽回产品报价单</button><button className="h-9 px-4 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50">发送订单确认提醒</button></>}>
              <p><span className="font-bold text-slate-700">客户：</span>test01客户 <Badge color="rose">极高流失风险</Badge></p>
              <p><span className="font-bold text-slate-700">AI 根因分析：</span>报价单 QT-20260508-001 有效期即将到期，当前状态为"已过期"，系统已结合剩余有效期生成挽回建议。</p>
            </AiAlertCard>
            <AiAlertCard icon={Users} title="AI 客户资产盘点与激活提示" theme="amber"
              actions={<button className="h-9 px-4 rounded-lg bg-amber-500 text-white text-[12px] font-medium hover:bg-amber-600">查看沉睡客户详情</button>}>
              <p><span className="font-bold text-slate-700">客户：</span>商洛墨翠宝石开发 / 上海万申产业股份 <Badge color="amber">建议跟进</Badge></p>
              <p><span className="font-bold text-slate-700">沉睡预警：</span>发现 2 家 D 级客户超过 30 天未互动且联系人或行业资料不完整。</p>
              <p><span className="font-bold text-slate-700">推介建议：</span>根据数据匹配，建议优先完善联系人档案，并定向推送相关产品信息。</p>
            </AiAlertCard>
            <AiAlertCard icon={Truck} title="订单履约延期预警" theme="rose"
              actions={<button className="w-full h-9 rounded-lg bg-rose-500 text-white text-[12px] font-medium hover:bg-rose-600">查看高危销售订单</button>}>
              <p><span className="font-bold text-slate-700">2 单进入交付倒计时</span> <Badge color="rose">交付高危</Badge></p>
              <p><span className="font-bold text-slate-700">穿透分析：</span>高危订单为 SO-20260508-001、SO-20260615-001，核心风险来自库存缺口或待出库环节。</p>
              <p><span className="font-bold text-slate-700">AI 建议：</span>立即发起跨部门交付协同，并为客户提供延期沟通与补偿预案。</p>
            </AiAlertCard>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-purple-50 text-purple-600"><BarChart3 size={20} /></div>
              <h3 className="text-[15px] font-bold text-slate-800">AI 报价-订单转化趋势与归因分析</h3>
              <div className="ml-auto flex items-center gap-4 text-[12px] text-slate-500">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />发出报价金额</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-500" />AI 预测成单金额</span>
              </div>
            </div>
            <div className="flex items-end gap-4 h-40 px-2">
              {TREND.map(d => (
                <div key={d.m} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[11px] text-slate-500 font-medium tabular-nums">{d.v}万</span>
                  <div className="w-full max-w-[48px] rounded-t-lg bg-gradient-to-t from-blue-500 to-purple-400 hover:opacity-80 transition-opacity" style={{ height: `${(d.v / maxV) * 100}%`, minHeight: '8px' }} />
                  <span className="text-[11px] text-slate-400">{d.m}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="flex gap-4">
            {Object.entries(STATUS_MAP).map(([key, val]) => {
              const count = ORDERS.filter(o => o.status === key).length;
              return (
                <div key={key} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-[12px]">
                  <Badge color={val.color as 'amber'}>{val.label}</Badge>
                  <span className="font-bold text-slate-700">{count}</span>
                </div>
              );
            })}
          </div>
          <DataTable columns={orderCols} data={ORDERS} emptyText="暂无销售订单" />
        </div>
      )}
      {tab === 'quotes' && <DataTable columns={quoteCols} data={QUOTES} emptyText="暂无报价单" />}
      {tab === 'customers' && <DataTable columns={custCols} data={CUSTOMERS} emptyText="暂无客户" />}
      {tab === 'settings' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">基础数据配置开发中</div>}
    </div>
  );
}
