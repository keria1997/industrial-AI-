/**
 * RMA 管理面板
 *
 * PRD 7.3.9.2.6: RMA 独立退货闭环。
 * 状态机: REQUESTED → APPROVED → IN_TRANSIT → RECEIVED → INSPECTING → INSPECTION_COMPLETED → RESTOCKED → CLOSED
 *
 * 查询使用正式分页接口；写入闭环尚未通过验收，办理入口保持不可用。
 */

import { DataTable, type Column } from '../../../components/DataTable';
import { Badge } from '../../../components/Badge';
import { ApiDataState } from '../../../components/ApiDataState';
import { PageNavigation } from '../../../components/PageNavigation';
import { Plus, RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import type { ApiContext } from '../../../api/client';
import { listSalesRmas, type RmaReadDto } from '../../../api/sales-aftercare';
import { hasPermission } from '../../../app/permissions';
import { useApiResource } from '../../../hooks/useApiResource';
import type { ApiPage } from '../../../shared/apiCollection';
import { aftercareText, aftercareQuantity, creditNoteAmount } from '../aftercarePresentation';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: '待审批', color: 'amber' },
  APPROVED: { label: '已审批', color: 'blue' },
  IN_TRANSIT: { label: '退货在途', color: 'blue' },
  RECEIVED: { label: '已收货', color: 'blue' },
  INSPECTING: { label: '检验中', color: 'blue' },
  INSPECTION_COMPLETED: { label: '检验完成', color: 'purple' },
  RESTOCKED: { label: '已回入库', color: 'emerald' },
  CLOSED: { label: '已关闭', color: 'emerald' },
  REJECTED: { label: '已拒绝', color: 'rose' },
};

export function RmaManagementPanel({ apiContext, permissions, onOpenOrder }: {
  apiContext: ApiContext | null;
  permissions?: readonly string[];
  onOpenOrder?: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const allowed = hasPermission(permissions, 'sales.order.read');
  const load = useCallback((context: ApiContext) => listSalesRmas(context, page), [page]);
  const records = useApiResource<ApiPage<RmaReadDto>>(allowed ? apiContext : null, load);
  const cols: Column<RmaReadDto>[] = [
    { key: 'rmaNo', label: 'RMA编号', render: r => aftercareText(r.rmaNo) },
    { key: 'orderNo', label: '原订单号', render: r => onOpenOrder && aftercareText(r.orderId) !== '-'
      ? <button type="button" onClick={() => onOpenOrder(r.orderId!)} className="text-blue-600 hover:underline">{aftercareText(r.orderNo) === '-' ? r.orderId : r.orderNo}</button>
      : aftercareText(r.orderNo) },
    { key: 'productName', label: '产品', render: r => aftercareText(r.productName) },
    { key: 'requestedQty', label: '申请退回', align: 'right', render: r => aftercareQuantity(r.requestedQty) },
    { key: 'approvedQty', label: '批准退回', align: 'right', render: r => aftercareQuantity(r.approvedQty) },
    { key: 'receivedQty', label: '实际收到', align: 'right', render: r => aftercareQuantity(r.receivedQty) },
    { key: 'qualifiedQty', label: '检验合格', align: 'right', render: r => aftercareQuantity(r.qualifiedQty) },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = STATUS_MAP[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : aftercareText(r.status); } },
    { key: 'creditNoteFinanceId', label: '贷项财务单引用', render: r => aftercareText(r.creditNoteFinanceId) },
    { key: 'creditNoteAmount', label: '贷项金额', align: 'right', render: r => creditNoteAmount(r.creditNoteAmount, r.currency) },
    { key: 'createdAt', label: '创建时间', render: r => aftercareText(r.createdAt) },
  ];

  if (!allowed) return <ApiDataState error="无退货记录查看权限，请联系管理员" />;
  return (
    <section aria-label="退货记录" className="space-y-4">
      <div className="flex justify-end gap-3">
        <button type="button" title="刷新退货记录" disabled={records.loading} onClick={() => page === 1 ? records.reload() : setPage(1)} className="rounded-md border bg-white p-2 disabled:opacity-40"><RefreshCw size={16} /><span className="sr-only">刷新退货记录</span></button>
        <button disabled title="原出库行、回入库与红字AR闭环尚未通过验收" className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-100 text-slate-500 text-[13px] font-medium cursor-not-allowed">
          <Plus size={15} />创建 RMA
        </button>
      </div>
      <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">可查询退货记录。退货办理暂不可用，原出库行、检验、回入库和红字 AR 的业务校验待完善。金额缺少币种时显示“-”。</div>
      {records.loading || records.error
        ? <ApiDataState loading={records.loading} error={records.error} onRetry={records.reload} />
        : <><div className="[&_table]:min-w-[1320px] [&_th]:whitespace-nowrap [&_td]:whitespace-nowrap"><DataTable columns={cols} data={records.data?.items ?? []} emptyText="暂无退货记录" /></div>
          {records.data && <PageNavigation page={page} pageSize={20} total={records.data.total} onPage={setPage} />}</>}
    </section>
  );
}
