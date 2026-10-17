/**
 * 客户签收面板
 *
 * PRD 7.3.9.2.7: 客户签收是销售完成关闭的独立业务事实。
 * 每个已全量发货的销售订单生成一个客户签收聚合。
 * 状态: PENDING → PARTIALLY_SIGNED → SIGNED / REJECTED / DISPUTED
 */

import { DataTable, type Column } from '../../../components/DataTable';
import { Badge } from '../../../components/Badge';
import { ApiDataState } from '../../../components/ApiDataState';
import { PageNavigation } from '../../../components/PageNavigation';
import { RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ApiContext } from '../../../api/client';
import { listCustomerReceipts, type CustomerReceiptReadDto } from '../../../api/sales-aftercare';
import { hasPermission } from '../../../app/permissions';
import { useApiResource } from '../../../hooks/useApiResource';
import type { ApiPage } from '../../../shared/apiCollection';
import { aftercareText, aftercareQuantity, customerReceiptStatus } from '../aftercarePresentation';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING: { label: '待签收', color: 'amber' },
  PARTIALLY_SIGNED: { label: '部分签收', color: 'blue' },
  SIGNED: { label: '全部签收', color: 'emerald' },
  REJECTED: { label: '拒收', color: 'rose' },
  DISPUTED: { label: '争议中', color: 'rose' },
};

export function CustomerReceiptPanel({ apiContext, permissions, onOpenOrder }: {
  apiContext: ApiContext | null;
  permissions?: readonly string[];
  onOpenOrder?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const allowed = hasPermission(permissions, 'sales.receipt.read');
  const load = useCallback((context: ApiContext) => listCustomerReceipts(context, page), [page]);
  const records = useApiResource<ApiPage<CustomerReceiptReadDto>>(allowed ? apiContext : null, load);
  const cols: Column<CustomerReceiptReadDto>[] = [
    { key: 'receiptNo', label: '签收单号', render: r => aftercareText(r.receiptNo) },
    { key: 'orderNo', label: '订单号', render: r => onOpenOrder && aftercareText(r.orderId) !== '-'
      ? <button type="button" onClick={() => onOpenOrder(r.orderId!)} className="text-blue-600 hover:underline font-medium">{aftercareText(r.orderNo) === '-' ? r.orderId : r.orderNo}</button>
      : aftercareText(r.orderNo) },
    { key: 'customerName', label: '客户', render: r => aftercareText(r.customerName) },
    { key: 'signedQty', label: '正常签收', align: 'right', render: r => aftercareQuantity(r.signedQty) },
    { key: 'rejectedQty', label: '拒收', align: 'right', render: r => aftercareQuantity(r.rejectedQty) },
    { key: 'damagedQty', label: '破损', align: 'right', render: r => aftercareQuantity(r.damagedQty) },
    { key: 'status', label: '状态', align: 'center', render: r => { const value = customerReceiptStatus(r.receiptStatus, r.status); const s = STATUS_MAP[value]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : value; } },
    { key: 'signedAt', label: '签收时间', render: r => aftercareText(r.signedAt) },
  ];

  if (!allowed) return <ApiDataState error="无客户签收查看权限，请联系管理员" />;
  return <section aria-label="客户签收记录" className="space-y-4">
    <div className="flex justify-end"><button type="button" title="刷新客户签收记录" disabled={records.loading} onClick={() => page === 1 ? records.reload() : setPage(1)} className="rounded-md border bg-white p-2 disabled:opacity-40"><RefreshCw size={16} /><span className="sr-only">刷新客户签收记录</span></button></div>
    <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">可查询客户签收记录。签收登记暂不可用，发货行、数量和重复登记校验待完善。签收、应收结清及退货争议全部闭合后才可完成订单。</div>
    {records.loading || records.error
      ? <ApiDataState loading={records.loading} error={records.error} onRetry={records.reload} />
        : <><div className="[&_table]:min-w-[1000px] [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap"><DataTable columns={cols} data={records.data?.items ?? []} emptyText="暂无客户签收记录" /></div>
        {records.data && <PageNavigation page={page} pageSize={20} total={records.data.total} onPage={setPage} />}</>}
  </section>;
}
