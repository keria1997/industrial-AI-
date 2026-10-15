/**
 * 采购管理页面
 * 按 PRD 7.6 + UI设计文档 4.6 实现。
 */

import { useState } from 'react';
import { CheckCircle, FileCheck, PackageCheck, ShoppingCart, Truck, Users } from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';

const TABS = [
  { id: 'dashboard', label: '采购看板' },
  { id: 'requisitions', label: '采购申请' },
  { id: 'orders', label: '采购订单' },
  { id: 'receipts', label: '采购收货' },
  { id: 'returns', label: '采购退货' },
  { id: 'suppliers', label: '供应商' },
];

interface Pr { prNo: string; source: string; material: string; qty: string; unit: string; status: string; requester: string; }
interface Po { poNo: string; supplier: string; material: string; orderedQty: string; receivedQty: string; status: string; requiredDate: string; }
interface Receipt { receiptNo: string; poNo: string; material: string; qty: string; inspection: string; status: string; }
interface Supplier { code: string; name: string; contact: string; phone: string; status: string; }

const PRS: Pr[] = [
  { prNo: 'PR-2026-001', source: 'DEM-001', material: '芯片 XC7Z010', qty: '100', unit: '件', status: 'PENDING_APPROVAL', requester: '李四' },
  { prNo: 'PR-2026-002', source: 'DEM-003', material: '电容 100uF', qty: '500', unit: '件', status: 'APPROVED', requester: '王五' },
];
const POS: Po[] = [
  { poNo: 'PO-2026-001', supplier: '深圳华强', material: '芯片 XC7Z010', orderedQty: '100', receivedQty: '60', status: 'PARTIALLY_RECEIVED', requiredDate: '2026-10-25' },
  { poNo: 'PO-2026-002', supplier: '上海元器件', material: '电容 100uF', orderedQty: '500', receivedQty: '500', status: 'RECEIVED', requiredDate: '2026-10-18' },
];
const RECEIPTS: Receipt[] = [
  { receiptNo: 'RCPT-001', poNo: 'PO-2026-001', material: '芯片 XC7Z010', qty: '60', inspection: '合格', status: 'POSTED' },
  { receiptNo: 'RCPT-002', poNo: 'PO-2026-002', material: '电容 100uF', qty: '500', inspection: '免检', status: 'POSTED' },
];
const SUPPLIERS: Supplier[] = [
  { code: 'SUP-001', name: '深圳华强电子', contact: '赵六', phone: '0755-83675566', status: '正常' },
  { code: 'SUP-002', name: '上海元器件供应', contact: '钱七', phone: '021-58888888', status: '正常' },
];

const prStatus = (s: string) => s === 'PENDING_APPROVAL' ? <Badge color="amber">待审批</Badge> : s === 'APPROVED' ? <Badge color="emerald">已审批</Badge> : <Badge color="slate">{s}</Badge>;
const poStatus = (s: string) => s === 'RECEIVED' ? <Badge color="emerald">已收齐</Badge> : s === 'PARTIALLY_RECEIVED' ? <Badge color="blue">部分收货</Badge> : <Badge color="slate">已创建</Badge>;
const inspColor = (s: string) => (s === '合格' ? 'emerald' : s === '免检' ? 'blue' : 'amber') as 'emerald' | 'blue' | 'amber';
const actionBtn = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';

export function ProcurementPage() {
  const [tab, setTab] = useState('dashboard');

  const prCols: Column<Pr>[] = [
    { key: 'prNo', label: 'PR编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.prNo}</button> },
    { key: 'source', label: 'MRP来源', render: r => <button className="text-blue-600 hover:underline">{r.source}</button> },
    { key: 'material', label: '物料' },
    { key: 'qty', label: '数量', align: 'right', render: r => `${r.qty} ${r.unit}` },
    { key: 'status', label: '状态', align: 'center', render: r => prStatus(r.status) },
    { key: 'requester', label: '申请人' },
    { key: 'actions', label: '操作', align: 'center', render: r => (
      <div className="flex gap-1">
        {r.status === 'PENDING_APPROVAL' && <button className={`${actionBtn} bg-emerald-50 text-emerald-600`}>审批</button>}
        {r.status === 'APPROVED' && <button className={`${actionBtn} bg-blue-50 text-blue-600`}>转PO</button>}
      </div>
    )},
  ];

  const poCols: Column<Po>[] = [
    { key: 'poNo', label: 'PO编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.poNo}</button> },
    { key: 'supplier', label: '供应商' },
    { key: 'material', label: '物料' },
    { key: 'orderedQty', label: '订购量', align: 'right' },
    { key: 'receivedQty', label: '已收量', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => poStatus(r.status) },
    { key: 'requiredDate', label: '要求交期' },
    { key: 'actions', label: '操作', align: 'center', render: () => (
      <button className={`${actionBtn} bg-blue-50 text-blue-600`}>登记收货</button>
    )},
  ];

  const rcptCols: Column<Receipt>[] = [
    { key: 'receiptNo', label: '收货单号' },
    { key: 'poNo', label: 'PO编号', render: r => <button className="text-blue-600 hover:underline">{r.poNo}</button> },
    { key: 'material', label: '物料' },
    { key: 'qty', label: '收货量', align: 'right' },
    { key: 'inspection', label: '质检', align: 'center', render: r => <Badge color={inspColor(r.inspection)}>{r.inspection}</Badge> },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">已入库</Badge> },
  ];

  const supCols: Column<Supplier>[] = [
    { key: 'code', label: '编码' },
    { key: 'name', label: '供应商名称' },
    { key: 'contact', label: '联系人' },
    { key: 'phone', label: '联系电话' },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">正常</Badge> },
  ];

  return (
    <div>
      <ModuleHeader icon={ShoppingCart} title="采购管理" subtitle="MRP缺料 · PR审批 · PO · 收货质检" theme="amber" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: '待审批PR', value: '1', unit: '条', icon: FileCheck, cls: 'bg-amber-50 text-amber-600' },
            { title: '在途订单', value: '1', unit: '个', icon: Truck, cls: 'bg-blue-50 text-blue-600' },
            { title: '本月收货', value: '560', unit: '件', icon: PackageCheck, cls: 'bg-emerald-50 text-emerald-600' },
            { title: '供应商数', value: '2', unit: '家', icon: Users, cls: 'bg-purple-50 text-purple-600' },
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
      {tab === 'requisitions' && <DataTable columns={prCols} data={PRS} emptyText="暂无采购申请" />}
      {tab === 'orders' && <DataTable columns={poCols} data={POS} emptyText="暂无采购订单" />}
      {tab === 'receipts' && <DataTable columns={rcptCols} data={RECEIPTS} emptyText="暂无收货记录" />}
      {tab === 'returns' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">暂无退货记录</div>}
      {tab === 'suppliers' && <DataTable columns={supCols} data={SUPPLIERS} emptyText="暂无供应商" />}
    </div>
  );
}
