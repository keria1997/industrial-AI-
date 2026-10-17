/**
 * 客户签收面板
 *
 * PRD 7.3.9.2.7: 客户签收是销售完成关闭的独立业务事实。
 * 每个已全量发货的销售订单生成一个客户签收聚合。
 * 状态: PENDING → PARTIALLY_SIGNED → SIGNED / REJECTED / DISPUTED
 */

import { DataTable, type Column } from '../../../components/DataTable';
import { Badge } from '../../../components/Badge';

interface ReceiptRecord {
  receiptNo: string;
  orderNo: string;
  customer: string;
  signedQty: string;
  rejectedQty: string;
  damagedQty: string;
  status: string;
  signedAt: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待签收', color: 'amber' },
  PARTIALLY_SIGNED: { label: '部分签收', color: 'blue' },
  SIGNED: { label: '全部签收', color: 'emerald' },
  REJECTED: { label: '拒收', color: 'rose' },
  DISPUTED: { label: '争议中', color: 'rose' },
};

export function CustomerReceiptPanel() {
  const cols: Column<ReceiptRecord>[] = [
    { key: 'receiptNo', label: '签收单号' },
    { key: 'orderNo', label: '订单号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.orderNo}</button> },
    { key: 'customer', label: '客户' },
    { key: 'signedQty', label: '正常签收', align: 'right' },
    { key: 'rejectedQty', label: '拒收', align: 'right' },
    { key: 'damagedQty', label: '破损', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = STATUS_MAP[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : r.status; } },
    { key: 'signedAt', label: '签收时间' },
  ];

  return <section className="space-y-4">
    <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">客户签收服务尚未接入，当前无法查询或登记签收。签收与订单完成是独立状态；签收、应收结清及退货争议全部闭合后才可完成订单。</div>
    <DataTable columns={cols} data={[]} emptyText="尚未取得客户签收记录" />
  </section>;
}
