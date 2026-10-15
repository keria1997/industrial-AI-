/**
 * 财务管理页面
 * 页签: 财务看板 | 应收账款 | 应付账款 | 收付款记录 | 核销记录
 */

import { useState } from 'react';
import { Wallet, TrendingUp, CreditCard, Coins } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';

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

const SAMPLE_ARS: Ar[] = [
  { arNo: 'AR-001', source: 'OUT-001', orderId: 'SO-2026-002', customer: '中兴通讯', amount: '¥80,000.00', settled: '¥40,000.00', balance: '¥40,000.00', status: 'PARTIALLY_SETTLED' },
  { arNo: 'AR-002', source: 'OUT-002', orderId: 'SO-2026-003', customer: '比亚迪', amount: '¥220,000.00', settled: '¥220,000.00', balance: '¥0.00', status: 'SETTLED' },
];
const SAMPLE_APS: Ap[] = [
  { apNo: 'AP-001', source: 'RCPT-001', supplier: '深圳华强', amount: '¥35,000.00', settled: '¥35,000.00', balance: '¥0.00', status: 'SETTLED' },
];
const SAMPLE_PAYMENTS: Payment[] = [
  { payNo: 'PAY-001', direction: 'IN', targetNo: 'AR-001', amount: '¥40,000.00', method: '银行转账', status: 'CONFIRMED' },
  { payNo: 'PAY-002', direction: 'OUT', targetNo: 'AP-001', amount: '¥35,000.00', method: '银行转账', status: 'CONFIRMED' },
];

const arStatus = (s: string) => s === 'SETTLED' ? <Badge color="emerald">已结算</Badge> : s === 'PARTIALLY_SETTLED' ? <Badge color="blue">部分结算</Badge> : s === 'REVERSED' ? <Badge color="rose">已冲销</Badge> : <Badge color="amber">待结算</Badge>;

export function FinancePage() {
  const [tab, setTab] = useState('dashboard');

  const arCols: Column<Ar>[] = [
    { key: 'arNo', label: 'AR编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.arNo}</button> },
    { key: 'source', label: '来源出库单' },
    { key: 'orderId', label: '订单号', render: r => <button className="text-blue-600 hover:underline">{r.orderId}</button> },
    { key: 'customer', label: '客户' },
    { key: 'amount', label: '金额', align: 'right' },
    { key: 'settled', label: '已核销', align: 'right' },
    { key: 'balance', label: '余额', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => arStatus(r.status) },
  ];
  const apCols: Column<Ap>[] = [
    { key: 'apNo', label: 'AP编号' },
    { key: 'source', label: '来源收货单' },
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
      <PageHeader title="财务管理" />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="应收总额" value="¥300,000" icon={Wallet} theme="blue" />
          <StatCard title="已结算" value="¥220,000" icon={TrendingUp} theme="emerald" />
          <StatCard title="应付总额" value="¥35,000" icon={CreditCard} theme="amber" />
          <StatCard title="已核销笔数" value="2" unit="笔" icon={Coins} theme="purple" />
        </div>
      )}
      {tab === 'receivables' && <DataTable columns={arCols} data={SAMPLE_ARS} emptyText="暂无应收账款" />}
      {tab === 'payables' && <DataTable columns={apCols} data={SAMPLE_APS} emptyText="暂无应付账款" />}
      {tab === 'payments' && <DataTable columns={payCols} data={SAMPLE_PAYMENTS} emptyText="暂无收付款记录" />}
      {tab === 'allocations' && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">核销记录开发中</div>}
    </div>
  );
}
