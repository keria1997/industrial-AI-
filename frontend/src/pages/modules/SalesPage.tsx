/**
 * 销售管理页面
 *
 * 页签: 监控舱 | 产品报价 | 销售订单 | 客户管理 | 基础数据
 * 状态标签和操作按钮规则见 PRD 7.3 和 UI设计文档 4.3。
 */

import { useState } from 'react';
import { Plus, TrendingUp, Activity, Wallet } from 'lucide-react';
import { TabNav } from '../../components/TabNav';
import { DataTable, type Column } from '../../components/DataTable';
import { Badge } from '../../components/Badge';
import { StatCard } from '../../components/StatCard';
import { PageHeader } from '../../components/PageHeader';

/* ---- 订单状态映射 ---- */
const ORDER_STATUS: Record<string, { label: string; color: 'amber' | 'blue' | 'purple' | 'emerald' | 'slate' }> = {
  PENDING_CONFIRMATION: { label: '待发货', color: 'amber' },
  CONFIRMED: { label: '已确认', color: 'blue' },
  REPLENISHING: { label: '生产补货中', color: 'purple' },
  PARTIALLY_SHIPPED: { label: '部分发货', color: 'blue' },
  SHIPPED: { label: '已发货', color: 'emerald' },
  COMPLETED: { label: '已完成', color: 'emerald' },
  CANCELED: { label: '已取消', color: 'slate' },
};

const TABS = [
  { id: 'dashboard', label: '监控舱' },
  { id: 'quotes', label: '产品报价' },
  { id: 'orders', label: '销售订单' },
  { id: 'customers', label: '客户管理' },
  { id: 'settings', label: '基础数据' },
];

interface Order {
  orderNo: string;
  customer: string;
  status: string;
  totalAmount: string;
  deliveryDate: string;
  shippedQty: string;
}

interface Quote {
  quoteNo: string;
  customer: string;
  totalAmount: string;
  status: string;
  validUntil: string;
}

interface Customer {
  code: string;
  name: string;
  creditLevel: string;
  contactPhone: string;
  status: string;
}

/* ---- 占位数据 ---- */
const SAMPLE_ORDERS: Order[] = [
  { orderNo: 'SO-2026-001', customer: '华为技术', status: 'CONFIRMED', totalAmount: '¥125,000.00', deliveryDate: '2026-10-20', shippedQty: '0/10' },
  { orderNo: 'SO-2026-002', customer: '中兴通讯', status: 'PARTIALLY_SHIPPED', totalAmount: '¥80,000.00', deliveryDate: '2026-10-25', shippedQty: '4/10' },
  { orderNo: 'SO-2026-003', customer: '比亚迪', status: 'SHIPPED', totalAmount: '¥220,000.00', deliveryDate: '2026-10-18', shippedQty: '15/15' },
  { orderNo: 'SO-2026-004', customer: '宁德时代', status: 'PENDING_CONFIRMATION', totalAmount: '¥95,000.00', deliveryDate: '2026-11-01', shippedQty: '0/8' },
];

const SAMPLE_QUOTES: Quote[] = [
  { quoteNo: 'QT-2026-001', customer: '华为技术', totalAmount: '¥120,000.00', status: '生效中', validUntil: '2026-11-15' },
  { quoteNo: 'QT-2026-002', customer: '中兴通讯', totalAmount: '¥85,000.00', status: '草稿', validUntil: '2026-11-30' },
];

const SAMPLE_CUSTOMERS: Customer[] = [
  { code: 'CUST-001', name: '华为技术有限公司', creditLevel: 'A', contactPhone: '0755-28780808', status: '正常' },
  { code: 'CUST-002', name: '中兴通讯股份有限公司', creditLevel: 'B', contactPhone: '0755-26770000', status: '正常' },
  { code: 'CUST-003', name: '比亚迪股份有限公司', creditLevel: 'A', contactPhone: '0755-89888888', status: '正常' },
];

export function SalesPage() {
  const [tab, setTab] = useState('dashboard');

  const orderCols: Column<Order>[] = [
    { key: 'orderNo', label: '订单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.orderNo}</button> },
    { key: 'customer', label: '客户' },
    { key: 'status', label: '状态', render: r => <Badge color={ORDER_STATUS[r.status]?.color ?? 'slate'}>{ORDER_STATUS[r.status]?.label ?? r.status}</Badge> },
    { key: 'totalAmount', label: '总金额', align: 'right' },
    { key: 'deliveryDate', label: '交期' },
    { key: 'shippedQty', label: '已发/订购', align: 'center' },
  ];

  const quoteCols: Column<Quote>[] = [
    { key: 'quoteNo', label: '报价单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.quoteNo}</button> },
    { key: 'customer', label: '客户' },
    { key: 'totalAmount', label: '报价总额', align: 'right' },
    { key: 'status', label: '状态', render: r => <Badge color={r.status === '生效中' ? 'emerald' : 'slate'}>{r.status}</Badge> },
    { key: 'validUntil', label: '有效期至' },
  ];

  const customerCols: Column<Customer>[] = [
    { key: 'code', label: '客户编码' },
    { key: 'name', label: '客户名称' },
    { key: 'creditLevel', label: '信用等级', align: 'center', render: r => <Badge color={r.creditLevel === 'A' ? 'emerald' : 'amber'}>{r.creditLevel}</Badge> },
    { key: 'contactPhone', label: '联系电话' },
    { key: 'status', label: '状态', align: 'center', render: r => <Badge color="emerald">{r.status}</Badge> },
  ];

  return (
    <div>
      <PageHeader
        title="销售管理"
        actions={<button className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700"><Plus size={15} />快速开单</button>}
      />
      <TabNav tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'dashboard' && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard title="本月订单金额" value="-" icon={TrendingUp} theme="blue" />
          <StatCard title="确认收入" value="-" icon={Activity} theme="emerald" />
          <StatCard title="发货确权金额" value="-" icon={Wallet} theme="amber" />
        </div>
      )}

      {tab === 'orders' && (
        <DataTable columns={orderCols} data={SAMPLE_ORDERS} emptyText="暂无销售订单" />
      )}
      {tab === 'quotes' && (
        <DataTable columns={quoteCols} data={SAMPLE_QUOTES} emptyText="暂无报价单" />
      )}
      {tab === 'customers' && (
        <DataTable columns={customerCols} data={SAMPLE_CUSTOMERS} emptyText="暂无客户数据" />
      )}
      {tab === 'settings' && (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-400 text-[13px]">基础数据配置开发中</div>
      )}
    </div>
  );
}
