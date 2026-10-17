/**
 * RMA 管理面板
 *
 * PRD 7.3.9.2.6: RMA 独立退货闭环。
 * 状态机: REQUESTED → APPROVED → IN_TRANSIT → INSPECTING → INSPECTION_COMPLETED → RESTOCKED → CLOSED
 *
 * 查询/写入路径尚未统一，入口保持不可用；不把未查询伪装成成功空结果。
 */

import { DataTable, type Column } from '../../../components/DataTable';
import { Badge } from '../../../components/Badge';
import { Plus } from 'lucide-react';

interface RmaRecord {
  rmaNo: string;
  orderNo: string;
  product: string;
  requestedQty: string;
  approvedQty: string;
  receivedQty: string;
  qualifiedQty: string;
  status: string;
  creditAr: string;
  createdAt: string;
}

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

export function RmaManagementPanel() {
  const cols: Column<RmaRecord>[] = [
    { key: 'rmaNo', label: 'RMA编号', render: r => <button className="text-blue-600 hover:underline font-medium">{r.rmaNo}</button> },
    { key: 'orderNo', label: '原订单号', render: r => <button className="text-blue-600 hover:underline">{r.orderNo}</button> },
    { key: 'product', label: '产品' },
    { key: 'requestedQty', label: '申请退回', align: 'right' },
    { key: 'approvedQty', label: '批准退回', align: 'right' },
    { key: 'qualifiedQty', label: '检验合格', align: 'right' },
    { key: 'status', label: '状态', align: 'center', render: r => { const s = STATUS_MAP[r.status]; return s ? <Badge color={s.color as 'amber'}>{s.label}</Badge> : r.status; } },
    { key: 'creditAr', label: '红字AR', align: 'right', render: r => <span className={r.creditAr.startsWith('-') ? 'text-rose-600 font-medium' : ''}>{r.creditAr === '-' ? '-' : r.creditAr}</span> },
    { key: 'createdAt', label: '创建时间' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button disabled title="RMA 查询、状态流转和回入库契约待统一" className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-slate-100 text-slate-500 text-[13px] font-medium cursor-not-allowed">
          <Plus size={15} />创建 RMA
        </button>
      </div>
      <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">退货服务尚未接入，当前无法查询或办理 RMA。原订单、出库行、检验、回入库及红字 AR 契约统一后开放。</div>
      <DataTable columns={cols} data={[]} emptyText="尚未取得退货记录" />
    </div>
  );
}
