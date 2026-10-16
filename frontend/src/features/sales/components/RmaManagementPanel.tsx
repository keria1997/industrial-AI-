/**
 * RMA 管理面板
 *
 * PRD 7.3.9.2.6: RMA 独立退货闭环。
 * 状态机: REQUESTED → APPROVED → IN_TRANSIT → INSPECTING → INSPECTION_COMPLETED → RESTOCKED → CLOSED
 *
 * 当前使用模拟数据展示 UI，后续对接 POST /api/v1/sales/rma 系列 API。
 */

import { useState } from 'react';
import { DataTable, type Column } from '../../../components/DataTable';
import { Badge } from '../../../components/Badge';
import { Plus } from 'lucide-react';
import { formatAmountWithCurrency } from '../../../shared/format';

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

const rmas: RmaRecord[] = [];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  REQUESTED: { label: '待审批', color: 'amber' },
  APPROVED: { label: '已审批', color: 'blue' },
  IN_TRANSIT: { label: '退货在途', color: 'blue' },
  INSPECTING: { label: '检验中', color: 'blue' },
  INSPECTION_COMPLETED: { label: '检验完成', color: 'purple' },
  RESTOCKED: { label: '已回入库', color: 'emerald' },
  CLOSED: { label: '已关闭', color: 'emerald' },
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
        <button className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-blue-600 text-white text-[13px] font-medium hover:bg-blue-700">
          <Plus size={15} />创建 RMA
        </button>
      </div>
      <DataTable columns={cols} data={rmas} emptyText="暂无退货记录" />
    </div>
  );
}
