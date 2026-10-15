/**
 * 生产管理页面
 * 按 PRD 7.4 + UI设计文档 4.5 实现。
 */

import { useState } from 'react';
import { Factory, FileText, Layers, Microscope, Play } from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';

const TABS = [
  { id: 'dashboard', label: '生产看板' },
  { id: 'demands', label: '生产需求' },
  { id: 'mps', label: '主生产计划' },
  { id: 'work-orders', label: '工单管理' },
  { id: 'quality', label: '质量管理' },
  { id: 'bom', label: 'BOM管理' },
];

interface Demand { demandNo: string; source: string; product: string; qty: string; warehouse: string; status: string; }
interface WO { woNo: string; demandNo: string; product: string; plannedQty: string; completedQty: string; status: string; }

const DEMANDS: Demand[] = [
  { demandNo: 'DEM-001', source: 'SO-2026-002', product: '工业网关A', qty: '10', warehouse: '深圳主仓', status: 'PLANNED' },
  { demandNo: 'DEM-002', source: '手工创建', product: '边缘计算盒子B', qty: '50', warehouse: '上海分仓', status: 'PENDING_REVIEW' },
  { demandNo: 'DEM-003', source: 'SO-2026-001', product: '工业网关A', qty: '6', warehouse: '深圳主仓', status: 'APPROVED' },
  { demandNo: 'DEM-004', source: 'SO-2026-005', product: '工业网关A', qty: '12', warehouse: '深圳主仓', status: 'COMPLETED' },
];

const WOS: WO[] = [
  { woNo: 'WO-2026-001', demandNo: 'DEM-001', product: '工业网关A', plannedQty: '10', completedQty: '0', status: 'RELEASED' },
  { woNo: 'WO-2026-002', demandNo: 'DEM-003', product: '工业网关A', plannedQty: '6', completedQty: '6', status: 'CLOSED' },
];

const dsMap: Record<string, { label: string; color: string }> = {
  PENDING_REVIEW: { label: '待校验', color: 'amber' },
  APPROVED: { label: '已审批', color: 'blue' },
  CLAIMED: { label: '已接收', color: 'blue' },
  PLANNED: { label: '已计划', color: 'purple' },
  SCHEDULED: { label: '已排程', color: 'purple' },
  COMPLETED: { label: '已完成', color: 'emerald' },
};
const woMap: Record<string, { label: string; color: string }> = {
  CREATED: { label: '已创建', color: 'slate' },
  RELEASED: { label: '已下达', color: 'blue' },
  IN_PROGRESS: { label: '执行中', color: 'blue' },
  PENDING_COMPLETION: { label: '待完工', color: 'amber' },
  COMPLETION_POSTED: { label: '已入库', color: 'emerald' },
  CLOSED: { label: '已结案', color: 'emerald' },
};

const actionBtn = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';

export function ProductionPage() {
  const [tab, setTab] = useState('dashboard');

  const demandCols: Column<Demand>[] = [
    { key: 'demandNo', label: '需求编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.demandNo}</button> },
    { key: 'source', label: '来源', render: r => r.source.startsWith('SO-') ? <button className="text-blue-600 hover:underline">{r.source}</button> : r.source },
    { key: 'product', label: '产品' },
    { key: 'qty', label: '数量', align: 'right' },
    { key: 'warehouse', label: '仓库' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = dsMap[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : r.status; } },
    { key: 'actions', label: '操作', align: 'center', render: r => (
      <div className="flex gap-1">
        {r.status === 'PENDING_REVIEW' && <><button className={`${actionBtn} bg-blue-50 text-blue-600`}>校验</button><button className={`${actionBtn} bg-blue-50 text-blue-600`}>审批</button></>}
        {r.status === 'APPROVED' && <button className={`${actionBtn} bg-purple-50 text-purple-600`}>接收</button>}
      </div>
    )},
  ];

  const woCols: Column<WO>[] = [
    { key: 'woNo', label: '工单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.woNo}</button> },
    { key: 'demandNo', label: '需求号', render: r => <button className="text-blue-600 hover:underline">{r.demandNo}</button> },
    { key: 'product', label: '产品' },
    { key: 'plannedQty', label: '计划量', align: 'right' },
    { key: 'completedQty', label: '完工量', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = woMap[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : r.status; } },
    { key: 'actions', label: '操作', align: 'center', render: r => (
      <div className="flex gap-1">
        {r.status === 'RELEASED' && <button className={`${actionBtn} bg-blue-50 text-blue-600 flex items-center gap-0.5`}><Play size={11} />开工</button>}
        {r.status === 'IN_PROGRESS' && <button className={`${actionBtn} bg-purple-50 text-purple-600`}>报工</button>}
        {r.status === 'COMPLETION_POSTED' && <button className={`${actionBtn} bg-emerald-50 text-emerald-600`}>结案</button>}
      </div>
    )},
  ];

  return (
    <div>
      <ModuleHeader icon={Factory} title="生产管理" subtitle="需求 · MRP · 排程 · 工单 · 质量" theme="purple" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: '待处理需求', value: '2', unit: '条', icon: FileText, cls: 'bg-amber-50 text-amber-600' },
            { title: '执行中工单', value: '1', unit: '个', icon: Factory, cls: 'bg-blue-50 text-blue-600' },
            { title: '本月完工', value: '18', unit: '件', icon: Layers, cls: 'bg-emerald-50 text-emerald-600' },
            { title: '质检待处理', value: '0', unit: '条', icon: Microscope, cls: 'bg-rose-50 text-rose-600' },
          ].map(c => (
            <div key={c.title} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="text-slate-500 text-[13px] font-bold">{c.title}</div>
                <div className={`p-2 rounded-xl ${c.cls}`}><c.icon size={18} /></div>
              </div>
              <div className="text-3xl font-bold text-slate-800 tabular-nums">{c.value}<span className="text-slate-400 ml-1 text-sm font-medium">{c.unit}</span></div>
            </div>
          ))}
        </div>
      )}
      {tab === 'demands' && <DataTable columns={demandCols} data={DEMANDS} emptyText="暂无生产需求" />}
      {tab === 'mps' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">MPS/MRP 开发中</div>}
      {tab === 'work-orders' && <DataTable columns={woCols} data={WOS} emptyText="暂无工单" />}
      {tab === 'quality' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">质量管理开发中</div>}
      {tab === 'bom' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">BOM 管理开发中</div>}
    </div>
  );
}
