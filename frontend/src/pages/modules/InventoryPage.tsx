/**
 * 库存管理页面
 *
 * 页签: 库存看板 | 现存量台账 | 出库管理 | 入库记录 | 主数据
 * 可用量 = 现存 - 已预留 - 冻结 - 安全库存
 */

import { useState } from 'react';
import { Package, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { id: 'dashboard', label: '库存看板' },
  { id: 'stock', label: '现存量台账' },
  { id: 'outbound', label: '出库管理' },
  { id: 'inbound', label: '入库记录' },
  { id: 'master', label: '主数据' },
];

interface StockItem {
  code: string;
  name: string;
  warehouse: string;
  type: string;
  onHand: string;
  reserved: string;
  frozen: string;
  safety: string;
  available: string;
  health: string;
}

interface StockTransaction {
  id: string;
  type: string;
  objectType: string;
  objectId: string;
  qty: string;
  source: string;
  createdAt: string;
}

const SAMPLE_STOCK: StockItem[] = [
  { code: 'PROD-001', name: '工业网关A', warehouse: '深圳主仓', type: '产品', onHand: '120', reserved: '10', frozen: '0', safety: '20', available: '90', health: '正常' },
  { code: 'MAT-001', name: '芯片 XC7Z010', warehouse: '深圳主仓', type: '物料', onHand: '45', reserved: '50', frozen: '0', safety: '30', available: '-35', health: '缺货' },
  { code: 'MAT-002', name: '电容 100uF', warehouse: '深圳主仓', type: '物料', onHand: '2000', reserved: '500', frozen: '0', safety: '500', available: '1000', health: '正常' },
  { code: 'PROD-002', name: '边缘计算盒子B', warehouse: '上海分仓', type: '产品', onHand: '8', reserved: '5', frozen: '0', safety: '10', available: '-7', health: '低于安全线' },
];

const SAMPLE_TXNS: StockTransaction[] = [
  { id: 'TXN-001', type: 'SALES_OUT', objectType: '产品', objectId: 'PROD-001', qty: '-10', source: 'SO-2026-002', createdAt: '2026-10-15 10:30' },
  { id: 'TXN-002', type: 'PURCHASE_IN', objectType: '物料', objectId: 'MAT-001', qty: '+200', source: 'PO-2026-001', createdAt: '2026-10-14 14:00' },
  { id: 'TXN-003', type: 'PRODUCTION_IN', objectType: '产品', objectId: 'PROD-002', qty: '+20', source: 'WO-2026-003', createdAt: '2026-10-13 16:45' },
];

const healthColor = (h: string) => (h === '正常' ? 'emerald' : h === '缺货' ? 'rose' : 'amber') as 'emerald' | 'rose' | 'amber';

export function InventoryPage() {
  const [tab, setTab] = useState('dashboard');

  const stockCols: Column<StockItem>[] = [
    { key: 'code', label: '编码' },
    { key: 'name', label: '名称' },
    { key: 'warehouse', label: '仓库' },
    { key: 'type', label: '类型', align: 'center', render: r => <Badge color={r.type === '产品' ? 'blue' : 'purple'}>{r.type}</Badge> },
    { key: 'onHand', label: '现存量', align: 'right' },
    { key: 'reserved', label: '已预留', align: 'right' },
    { key: 'frozen', label: '冻结', align: 'right' },
    { key: 'safety', label: '安全库存', align: 'right' },
    { key: 'available', label: '可用量', align: 'right', render: r => <span className={Number(r.available) < 0 ? 'text-rose-600 font-bold' : 'text-emerald-600 font-bold'}>{r.available}</span> },
    { key: 'health', label: '健康度', align: 'center', render: r => <Badge color={healthColor(r.health)}>{r.health}</Badge> },
  ];

  const txnCols: Column<StockTransaction>[] = [
    { key: 'id', label: '流水号' },
    { key: 'type', label: '类型', render: r => <Badge color={r.type.includes('OUT') ? 'rose' : 'emerald'}>{r.type}</Badge> },
    { key: 'objectType', label: '对象类型', align: 'center' },
    { key: 'objectId', label: '对象编码' },
    { key: 'qty', label: '数量', align: 'right' },
    { key: 'source', label: '来源单据', render: r => <button className="text-blue-600 hover:underline">{r.source}</button> },
    { key: 'createdAt', label: '时间' },
  ];

  return (
    <div>
      <PageHeader title="库存管理" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="物料总数" value="2" unit="种" icon={Package} theme="blue" />
          <StatCard title="低于安全线" value="1" unit="种" icon={AlertTriangle} theme="amber" />
          <StatCard title="缺货" value="1" unit="种" icon={AlertTriangle} theme="rose" />
          <StatCard title="今日入库" value="3" unit="笔" icon={ArrowDownToLine} theme="emerald" />
        </div>
      )}
      {tab === 'stock' && <DataTable columns={stockCols} data={SAMPLE_STOCK} emptyText="暂无库存数据" />}
      {tab === 'outbound' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">出库管理开发中</div>
      )}
      {tab === 'inbound' && <DataTable columns={txnCols} data={SAMPLE_TXNS} emptyText="暂无入库记录" />}
      {tab === 'master' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">库存主数据开发中</div>
      )}
    </div>
  );
}
