import { useCallback, useState } from 'react';
import type { ApiContext } from '../../../api/client';
import { listCostAccounting, type CostAccounting } from '../../../api/finance';
import { ApiDataState } from '../../../components/ApiDataState';
import { useApiResource } from '../../../hooks/useApiResource';
import { loadApiCollection } from '../../../shared/apiCollection';
import { formatAmountWithCurrency } from '../../../shared/format';

type Props = { apiContext: ApiContext | null; workOrders: Array<{ id: string; code: string }> };
const amount = (value: unknown) => value !== '' && value != null && Number.isFinite(Number(value))
  ? formatAmountWithCurrency(Number(value)) : '-';

export function CostAccumulationPanel({ apiContext, workOrders }: Props) {
  const [workOrderId, setWorkOrderId] = useState('');
  const selected = workOrders.find(order => order.id === workOrderId);
  // UI -> finance API. Match the selected formal order, never a demonstration order.
  const load = useCallback(async (context: ApiContext) => {
    if (!selected) return [];
    const records = await loadApiCollection((page, pageSize) => listCostAccounting(context, { page, pageSize }));
    return records.filter(record => record.workOrderId === selected.id || record.workOrderNo === selected.code);
  }, [selected?.id, selected?.code]);
  const costs = useApiResource<CostAccounting[]>(apiContext, load);
  return <section className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h4 className="text-[14px] font-bold text-slate-700">工单成本归集</h4>
      <select aria-label="成本归集工单" value={workOrderId} onChange={event => setWorkOrderId(event.target.value)} className="rounded-md border border-slate-200 p-2 text-[13px]">
        <option value="">请选择正式工单</option>
        {workOrders.map(order => <option key={order.id} value={order.id}>{order.code}</option>)}
      </select>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[12px]"><thead><tr>{['成本单号', '材料', '人工', '制造费用', '质量成本', '退料冲减', '总成本'].map(label => <th key={label} className="border-b px-3 py-2">{label}</th>)}</tr></thead>
        <tbody>{(costs.data ?? []).map(record => <tr key={record.id}>
          <td className="border-b px-3 py-3">{record.docNo}</td>
          {[record.materialCost, record.laborCost, record.manufacturingCost, null, null, record.totalCost].map((value, index) => <td key={index} className="border-b px-3 py-3">{amount(value)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>
    {(!selected || costs.loading || costs.error || !costs.data?.length) && <ApiDataState loading={Boolean(selected) && costs.loading} error={selected ? costs.error : null} onRetry={costs.reload} empty={selected ? '暂无成本数据' : '请选择工单查看成本，尚未获取成本数据'} />}
  </section>;
}
