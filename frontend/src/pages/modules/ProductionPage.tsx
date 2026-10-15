/**
 * 生产管理页面
 *
 * 页签: 生产看板 | 生产需求 | 主生产计划 | 工单管理 | 质量管理 | BOM管理
 * 状态机: 需求 PENDING_REVIEW→APPROVED→CLAIMED→PLANNED→SCHEDULED→COMPLETED
 * 工单 CREATED→RELEASED→IN_PROGRESS→PENDING_COMPLETION→COMPLETION_POSTED→CLOSED
 */

import { useState } from 'react';
import { Factory, FileText, Layers, Microscope } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { id: 'dashboard', label: '生产看板' },
  { id: 'demands', label: '生产需求' },
  { id: 'mps', label: '主生产计划' },
  { id: 'work-orders', label: '工单管理' },
  { id: 'quality', label: '质量管理' },
  { id: 'bom', label: 'BOM管理' },
];

interface Demand {
  demandNo: string;
  source: string;
  product: string;
  qty: string;
  warehouse: string;
  status: string;
}

interface WorkOrder {
  woNo: string;
  demandNo: string;
  product: string;
  plannedQty: string;
  completedQty: string;
  status: string;
}

const SAMPLE_DEMANDS: Demand[] = [
  { demandNo: 'DEM-001', source: 'SO-2026-002', product: '工业网关A', qty: '10', warehouse: '深圳主仓', status: 'PLANNED' },
  { demandNo: 'DEM-002', source: '手工创建', product: '边缘计算盒子B', qty: '50', warehouse: '上海分仓', status: 'PENDING_REVIEW' },
  { demandNo: 'DEM-003', source: 'SO-2026-001', product: '工业网关A', qty: '6', warehouse: '深圳主仓', status: 'APPROVED' },
];

const SAMPLE_WOS: WorkOrder[] = [
  { woNo: 'WO-2026-001', demandNo: 'DEM-001', product: '工业网关A', plannedQty: '10', completedQty: '0', status: 'RELEASED' },
  { woNo: 'WO-2026-002', demandNo: 'DEM-003', product: '工业网关A', plannedQty: '6', completedQty: '6', status: 'CLOSED' },
];

const demandStatusMap: Record<string, { label: string; color: 'amber' | 'blue' | 'purple' | 'emerald' }> = {
  PENDING_REVIEW: { label: '待校验', color: 'amber' },
  APPROVED: { label: '已审批', color: 'blue' },
  CLAIMED: { label: '已接收', color: 'blue' },
  PLANNED: { label: '已计划', color: 'purple' },
  SCHEDULED: { label: '已排程', color: 'purple' },
  COMPLETED: { label: '已完成', color: 'emerald' },
};

const woStatusMap: Record<string, { label: string; color: 'amber' | 'blue' | 'purple' | 'emerald' | 'slate' }> = {
  CREATED: { label: '已创建', color: 'slate' },
  RELEASED: { label: '已下达', color: 'blue' },
  IN_PROGRESS: { label: '执行中', color: 'blue' },
  PENDING_COMPLETION: { label: '待完工', color: 'amber' },
  COMPLETION_POSTED: { label: '已入库', color: 'emerald' },
  CLOSED: { label: '已结案', color: 'emerald' },
};

export function ProductionPage() {
  const [tab, setTab] = useState('dashboard');

  const demandCols: Column<Demand>[] = [
    { key: 'demandNo', label: '需求编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.demandNo}</button> },
    { key: 'source', label: '来源', render: r => r.source.startsWith('SO-') ? <button className="text-blue-600 hover:underline">{r.source}</button> : r.source },
    { key: 'product', label: '产品' },
    { key: 'qty', label: '数量', align: 'right' },
    { key: 'warehouse', label: '仓库' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = demandStatusMap[r.status]; return s ? <Badge color={s.color}>{s.label}</Badge> : r.status; } },
  ];

  const woCols: Column<WorkOrder>[] = [
    { key: 'woNo', label: '工单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.woNo}</button> },
    { key: 'demandNo', label: '需求号', render: r => <button className="text-blue-600 hover:underline">{r.demandNo}</button> },
    { key: 'product', label: '产品' },
    { key: 'plannedQty', label: '计划量', align: 'right' },
    { key: 'completedQty', label: '完工量', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = woStatusMap[r.status]; return s ? <Badge color={s.color}>{s.label}</Badge> : r.status; } },
  ];

  return (
    <div>
      <PageHeader title="生产管理" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="待处理需求" value="3" unit="条" icon={FileText} theme="amber" />
          <StatCard title="执行中工单" value="1" unit="个" icon={Factory} theme="blue" />
          <StatCard title="本月完工" value="6" unit="件" icon={Layers} theme="emerald" />
          <StatCard title="质检待处理" value="0" unit="条" icon={Microscope} theme="rose" />
        </div>
      )}
      {tab === 'demands' && <DataTable columns={demandCols} data={SAMPLE_DEMANDS} emptyText="暂无生产需求" />}
      {tab === 'mps' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">MPS/MRP 开发中</div>}
      {tab === 'work-orders' && <DataTable columns={woCols} data={SAMPLE_WOS} emptyText="暂无工单" />}
      {tab === 'quality' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">质量管理开发中</div>}
      {tab === 'bom' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">BOM 管理开发中</div>}
    </div>
  );
}
