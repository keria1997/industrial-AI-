/**
 * 财务管理页面
 * 按 PRD 7.7 + UI设计文档 4.7 实现。
 */

import { useState } from 'react';
import { CreditCard, Coins, TrendingUp, Wallet } from 'lucide-react';
import { ModuleHeader } from '../../components/ModuleHeader';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';

const TABS = [
  { id: 'dashboard', label: '财务看板' },
  { id: 'receivables', label: '应收账款' },
  { id: 'payables', label: '应付账款' },
  { id: 'payments', label: '收付款记录' },
  { id: 'allocations', label: '核销记录' },
];

interface Ar { arNo: string; source: string; orderId: string; customer: string; amount: string; settled: string; balance: string; status: string; }
interface Ap { apNo: string; source: string; supplier: string; amount: string; settled: string; balance: string; status: string; }
interface Payment { payNo: string; direction: string; targetNo: string; amount: string; method: string; status: string; }

const ARS: Ar[] = [
  { arNo: 'AR-001', source: 'OUT-001', orderId: 'SO-2026-002', customer: '中兴通讯', amount: '\u00a580,000.00', settled: '\u00a540,000.00', balance: '\u00a540,000.00', status: 'PARTIALLY_SETTLED' },
  { arNo: 'AR-002', source: 'OUT-002', orderId: 'SO-2026-003', customer: '比亚迪', amount: '\u00a5220,000.00', settled: '\u00a5220,000.00', balance: '\u00a50.00', status: 'SETTLED' },
  { arNo: 'AR-003', source: 'OUT-003', orderId: 'SO-2026-005', customer: '华为技术', amount: '\u00a5180,000.00', settled: '\u00a50.00', balance: '\u00a5180,000.00', status: 'OPEN' },
];
const APS: Ap[] = [
  { apNo: 'AP-001', source: 'RCPT-001', supplier: '深圳华强', amount: '\u00a535,000.00', settled: '\u00a535,000.00', balance: '\u00a50.00', status: 'SETTLED' },
];
const PAYMENTS: Payment[] = [
  { payNo: 'PAY-001', direction: 'IN', targetNo: 'AR-001', amount: '\u00a540,000.00', method: '银行转账', status: 'CONFIRMED' },
  { payNo: 'PAY-002', direction: 'OUT', targetNo: 'AP-001', amount: '\u00a535,000.00', method: '银行转账', status: 'CONFIRMED' },
];

const arStatus = (s: string) => {
  const map: Record<string, { label: string; color: string }> = {
    OPEN: { label: '待结算', color: 'amber' },
    PARTIALLY_SETTLED: { label: '部分结算', color: 'blue' },
    SETTLED: { label: '已结算', color: 'emerald' },
    REVERSED: { label: '已冲销', color: 'rose' },
  };
  const item = map[s];
  return item ? <Badge color={item.color as 'amber'}>{item.label}</Badge> : s;
};
const actionBtn = 'h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors';

export function FinancePage() {
  const [tab, setTab] = useState('dashboard');

  const arCols: Column<Ar>[] = [
    { key: 'arNo', label: 'AR编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.arNo}</button> },
    { key: 'source', label: '出库单' },
    { key: 'orderId', label: '订单号', render: r => <button className="text-blue-600 hover:underline">{r.orderId}</button> },
    { key: 'customer', label: '客户' },
    { key: 'amount', label: '金额', align: 'right' },
    { key: 'settled', label: '已核销', align: 'right' },
    { key: 'balance', label: '余额', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => arStatus(r.status) },
    { key: 'actions', label: '操作', align: 'center', render: r => (
      <div className="flex gap-1">
        {r.status !== 'SETTLED' && r.status !== 'REVERSED' && <button className={`${actionBtn} bg-blue-50 text-blue-600`}>登记收款</button>}
      </div>
    )},
  ];

  const apCols: Column<Ap>[] = [
    { key: 'apNo', label: 'AP编号' },
    { key: 'source', label: '收货单' },
    { key: 'supplier', label: '供应商' },
    { key: 'amount', label: '金额', align: 'right' },
    { key: 'settled', label: '已核销', align: 'right' },
    { key: 'balance', label: '余额', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => arStatus(r.status) },
  ];

  const payCols: Column<Payment>[] = [
    { key: 'payNo', label: '收付款号' },
    { key: 'direction', label: '方向', align: 'center', render: r => <Badge color={r.direction === 'IN' ? 'emerald' : 'rose'}>{r.direction === 'IN' ? '收款' : '付款'}</Badge> },
    { key: 'targetNo', label: '关联单据' },
    { key: 'amount', label: '金额', align: 'right' },
    { key: 'method', label: '付款方式' },
    { key: 'status', label: '状态', align: 'center', render: () => <Badge color="emerald">已确认</Badge> },
  ];

  return (
    <div>
      <ModuleHeader icon={Wallet} title="财务管理" subtitle="AR/AP · 收付款 · 核销 · 冲销" theme="cyan" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { title: '应收总额', value: '¥480,000', icon: Wallet, cls: 'bg-blue-50 text-blue-600' },
            { title: '已结算', value: '¥220,000', icon: TrendingUp, cls: 'bg-emerald-50 text-emerald-600' },
            { title: '应付总额', value: '¥35,000', icon: CreditCard, cls: 'bg-amber-50 text-amber-600' },
            { title: '核销笔数', value: '2', unit: '笔', icon: Coins, cls: 'bg-purple-50 text-purple-600' },
          ].map(c => (
            <div key={c.title} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
              <div className="flex justify-between items-start mb-3">
                <div className="text-slate-500 text-[13px] font-bold">{c.title}</div>
                <div className={`p-2 rounded-xl ${c.cls}`}><c.icon size={18} /></div>
              </div>
              <div className="text-2xl font-bold text-slate-800 tabular-nums">{c.value}</div>
              {c.unit && <span className="text-slate-400 ml-1 text-sm font-medium">{c.unit}</span>}
            </div>
          ))}
        </div>
      )}
      {tab === 'receivables' && <DataTable columns={arCols} data={ARS} emptyText="暂无应收账款" />}
      {tab === 'payables' && <DataTable columns={apCols} data={APS} emptyText="暂无应付账款" />}
      {tab === 'payments' && <DataTable columns={payCols} data={PAYMENTS} emptyText="暂无收付款记录" />}
      {tab === 'allocations' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">核销记录开发中</div>}
    </div>
  );
}
