/**
 * 库存管理页面
 * 按 PRD 7.5 + UI设计文档 4.4 实现。可用量 = 现存 - 已预留 - 冻结 - 安全库存。
 */

import { useState } from 'react';
import { AlertTriangle, ArrowDownToLine, Boxes, Package, Warehouse } from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';

const TABS = [
  { id: 'dashboard', label: '库存看板' },
  { id: 'stock', label: '现存量台账' },
  { id: 'outbound', label: '出库管理' },
  { id: 'inbound', label: '入库记录' },
  { id: 'master', label: '主数据' },
];

interface StockItem { code: string; name: string; warehouse: string; type: string; onHand: string; reserved: string; frozen: string; safety: string; available: string; health: string; }
interface Txn { id: string; type: string; objectType: string; objectId: string; qty: string; source: string; time: string; }

const STOCK: StockItem[] = [
  { code: 'PROD-001', name: '工业网关A', warehouse: '深圳主仓', type: '产品', onHand: '120', reserved: '10', frozen: '0', safety: '20', available: '90', health: '正常' },
  { code: 'MAT-001', name: '芯片 XC7Z010', warehouse: '深圳主仓', type: '物料', onHand: '45', reserved: '50', frozen: '0', safety: '30', available: '-35', health: '缺货' },
  { code: 'MAT-002', name: '电容 100uF', warehouse: '深圳主仓', type: '物料', onHand: '2000', reserved: '500', frozen: '0', safety: '500', available: '1000', health: '正常' },
  { code: 'PROD-002', name: '边缘计算盒子B', warehouse: '上海分仓', type: '产品', onHand: '8', reserved: '5', frozen: '0', safety: '10', available: '-7', health: '低于安全线' },
];

const TXNS: Txn[] = [
  { id: 'TXN-001', type: 'SALES_OUT', objectType: '产品', objectId: 'PROD-001', qty: '-10', source: 'SO-2026-002', time: '2026-10-15 10:30' },
  { id: 'TXN-002', type: 'PURCHASE_IN', objectType: '物料', objectId: 'MAT-001', qty: '+200', source: 'PO-2026-001', time: '2026-10-14 14:00' },
  { id: 'TXN-003', type: 'PRODUCTION_IN', objectType: '产品', objectId: 'PROD-002', qty: '+20', source: 'WO-2026-003', time: '2026-10-13 16:45' },
  { id: 'TXN-004', type: 'SALES_RETURN_IN', objectType: '产品', objectId: 'PROD-001', qty: '+2', source: 'RMA-001', time: '2026-10-12 09:00' },
];

const healthColor = (h: string) => (h === '正常' ? 'emerald' : h === '缺货' ? 'rose' : 'amber') as 'emerald' | 'rose' | 'amber';
const txnColor = (t: string) => (t.includes('OUT') ? 'rose' : 'emerald') as 'rose' | 'emerald';
const txnLabel = (t: string) => ({ SALES_OUT: '销售出库', PURCHASE_IN: '采购入库', PRODUCTION_IN: '生产完工入库', SALES_RETURN_IN: '销售退货入库' }[t] ?? t);

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

  const txnCols: Column<Txn>[] = [
    { key: 'id', label: '流水号' },
    { key: 'type', label: '类型', render: r => <Badge color={txnColor(r.type)}>{txnLabel(r.type)}</Badge> },
    { key: 'objectType', label: '对象类型', align: 'center' },
    { key: 'objectId', label: '对象编码' },
    { key: 'qty', label: '数量', align: 'right' },
    { key: 'source', label: '来源单据', render: r => <button className="text-blue-600 hover:underline">{r.source}</button> },
    { key: 'time', label: '时间' },
  ];

  return (
    <div>
      <ModuleHeader icon={Package} title="库存管理" subtitle="可用量 · 预留 · 出入库流水" theme="emerald" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: '在库 SKU', value: '4', unit: '种', icon: Boxes, cls: 'bg-blue-50 text-blue-600' },
              { title: '低于安全线', value: '1', unit: '种', icon: AlertTriangle, cls: 'bg-amber-50 text-amber-600' },
              { title: '缺货', value: '1', unit: '种', icon: AlertTriangle, cls: 'bg-rose-50 text-rose-600' },
              { title: '本月入库', value: '4', unit: '笔', icon: ArrowDownToLine, cls: 'bg-emerald-50 text-emerald-600' },
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
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-center gap-3">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            <div className="text-[13px] text-amber-800">
              <span className="font-bold">物料预警：</span>芯片 XC7Z010 可用量为负数（-35），需要紧急补货。边缘计算盒子B 低于安全线（-7）。
            </div>
          </div>
        </div>
      )}
      {tab === 'stock' && <DataTable columns={stockCols} data={STOCK} emptyText="暂无库存数据" />}
      {tab === 'outbound' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Warehouse size={32} className="text-slate-300 mx-auto mb-3" />
          <div className="text-slate-400 text-[13px]">出库管理页面按 PRD 7.5.9 出库守卫开发中</div>
        </div>
      )}
      {tab === 'inbound' && <DataTable columns={txnCols} data={TXNS} emptyText="暂无入库记录" />}
      {tab === 'master' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">库存主数据开发中</div>}
    </div>
  );
}
