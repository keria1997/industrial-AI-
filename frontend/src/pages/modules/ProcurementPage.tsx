/**
 * 采购管理页面
 * 页签: 采购看板 | 采购申请 | 采购订单 | 采购收货 | 采购退货 | 供应商
 */

import { useState } from 'react';
import { ShoppingCart, Package, Truck, Users } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';

const TABS = [
  { id: 'dashboard', label: '采购看板' },
  { id: 'requisitions', label: '采购申请' },
  { id: 'orders', label: '采购订单' },
  { id: 'receipts', label: '采购收货' },
  { id: 'returns', label: '采购退货' },
  { id: 'suppliers', label: '供应商' },
];

interface Pr { prNo: string; source: string; material: string; qty: string; status: string; requester: string; }
interface Po { poNo: string; supplier: string; material: string; orderedQty: string; receivedQty: string; status: string; requiredDate: string; }
interface Receipt { receiptNo: string; poNo: string; material: string; qty: string; inspection: string; status: string; }
interface Supplier { code: string; name: string; contact: string; phone: string; status: string; }

const SAMPLE_PRS: Pr[] = [
  { prNo: 'PR-2026-001', source: 'DEM-001', material: '芯片 XC7Z010', qty: '100', status: 'PENDING_APPROVAL', requester: '李四' },
  { prNo: 'PR-2026-002', source: 'DEM-003', material: '电容 100uF', qty: '500', status: 'APPROVED', requester: '王五' },
];
const SAMPLE_POS: Po[] = [
  { poNo: 'PO-2026-001', supplier: '深圳华强', material: '芯片 XC7Z010', orderedQty: '100', receivedQty: '60', status: 'PARTIALLY_RECEIVED', requiredDate: '2026-10-25' },
  { poNo: 'PO-2026-002', supplier: '上海元器件', material: '电容 100uF', orderedQty: '500', receivedQty: '500', status: 'RECEIVED', requiredDate: '2026-10-18' },
];
const SAMPLE_RECEIPTS: Receipt[] = [
  { receiptNo: 'RCPT-001', poNo: 'PO-2026-001', material: '芯片 XC7Z010', qty: '60', inspection: '合格', status: 'POSTED' },
  { receiptNo: 'RCPT-002', poNo: 'PO-2026-002', material: '电容 100uF', qty: '500', inspection: '免检', status: 'POSTED' },
];
const SAMPLE_SUPPLIERS: Supplier[] = [
  { code: 'SUP-001', name: '深圳华强电子', contact: '赵六', phone: '0755-83675566', status: '正常' },
  { code: 'SUP-002', name: '上海元器件供应', contact: '钱七', phone: '021-58888888', status: '正常' },
];

const prStatus = (s: string) => s === 'PENDING_APPROVAL' ? <Badge color="amber">待审批</Badge> : s === 'APPROVED' ? <Badge color="emerald">已审批</Badge> : <Badge color="slate">{s}</Badge>;
const poStatus = (s: string) => s === 'RECEIVED' ? <Badge color="emerald">已收齐</Badge> : s === 'PARTIALLY_RECEIVED' ? <Badge color="blue">部分收货</Badge> : <Badge color="slate">{s}</Badge>;

export function ProcurementPage() {
  const [tab, setTab] = useState('dashboard');

  const prCols: Column<Pr>[] = [
    { key: 'prNo', label: 'PR编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.prNo}</button> },
    { key: 'source', label: 'MRP来源', render: r => <button className="text-blue-600 hover:underline">{r.source}</button> },
    { key: 'material', label: '物料' },
    { key: 'qty', label: '数量', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => prStatus(r.status) },
    { key: 'requester', label: '申请人' },
  ];
  const poCols: Column<Po>[] = [
    { key: 'poNo', label: 'PO编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.poNo}</button> },
    { key: 'supplier', label: '供应商' },
    { key: 'material', label: '物料' },
    { key: 'orderedQty', label: '订购量', align: 'right' },
    { key: 'receivedQty', label: '已收量', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => poStatus(r.status) },
    { key: 'requiredDate', label: '要求交期' },
  ];
  const receiptCols: Column<Receipt>[] = [
    { key: 'receiptNo', label: '收货单号' },
    { key: 'poNo', label: 'PO编号', render: r => <button className="text-blue-600 hover:underline">{r.poNo}</button> },
    { key: 'material', label: '物料' },
    { key: 'qty', label: '收货量', align: 'right' },
    { key: 'inspection', label: '质检', align: 'center', render: r => <Badge color={r.inspection === '合格' ? 'emerald' : r.inspection === '免检' ? 'blue' : 'amber'}>{r.inspection}</Badge> },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">已入库</Badge> },
  ];
  const supCols: Column<Supplier>[] = [
    { key: 'code', label: '供应商编码' },
    { key: 'name', label: '供应商名称' },
    { key: 'contact', label: '联系人' },
    { key: 'phone', label: '联系电话' },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">正常</Badge> },
  ];

  return (
    <div>
      <PageHeader title="采购管理" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="待审批PR" value="1" unit="条" icon={ShoppingCart} theme="amber" />
          <StatCard title="在途订单" value="1" unit="个" icon={Truck} theme="blue" />
          <StatCard title="本月收货" value="560" unit="件" icon={Package} theme="emerald" />
          <StatCard title="供应商数" value="2" unit="家" icon={Users} theme="purple" />
        </div>
      )}
      {tab === 'requisitions' && <DataTable columns={prCols} data={SAMPLE_PRS} emptyText="暂无采购申请" />}
      {tab === 'orders' && <DataTable columns={poCols} data={SAMPLE_POS} emptyText="暂无采购订单" />}
      {tab === 'receipts' && <DataTable columns={receiptCols} data={SAMPLE_RECEIPTS} emptyText="暂无收货记录" />}
      {tab === 'returns' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">暂无退货记录</div>}
      {tab === 'suppliers' && <DataTable columns={supCols} data={SAMPLE_SUPPLIERS} emptyText="暂无供应商" />}
    </div>
  );
}
