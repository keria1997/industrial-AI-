/**
 * 工单成本归集面板
 *
 * PRD 7.4.12: 按工单归集材料、人工、制造费用、质量成本和完工成本。
 * 公式: 工单总成本 = 材料 + 人工 + 制造费用 + 质量成本 - 退料冲减
 */

import { DataTable, type Column } from '../../../components/DataTable';
import { formatAmountWithCurrency } from '../../../shared/format';

interface CostItem {
  costType: string;
  amount: string;
  source: string;
}

const SAMPLE_COSTS: CostItem[] = [
  { costType: '直接材料', amount: '¥12,500.00', source: '领料出库流水' },
  { costType: '直接人工', amount: '¥3,000.00', source: '报工记录' },
  { costType: '制造费用', amount: '¥1,500.00', source: '分摊规则计算' },
  { costType: '质量成本', amount: '¥500.00', source: 'FQC 返工/报废' },
  { costType: '退料冲减', amount: '-¥800.00', source: '退料入库流水' },
];

export function CostAccumulationPanel({ workOrderNo }: { workOrderNo: string }) {
  const total = SAMPLE_COSTS.reduce((sum, item) => {
    const val = parseFloat(item.amount.replace(/[¥,]/g, ''));
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const cols: Column<CostItem>[] = [
    { key: 'costType', label: '成本项' },
    { key: 'amount', label: '金额', align: 'right', render: r => {
      const num = parseFloat(r.amount.replace(/[¥,]/g, ''));
      return <span className={num < 0 ? 'text-rose-600' : 'text-slate-800'}>{formatAmountWithCurrency(num)}</span>;
    }},
    { key: 'source', label: '来源' },
  ];

  return (
    <div className="space-y-3">
      <h4 className="text-[14px] font-bold text-slate-700">工单 {workOrderNo} 成本归集</h4>
      <DataTable columns={cols} data={SAMPLE_COSTS} emptyText="暂无成本数据" />
      <div className="flex justify-end items-center gap-4 px-4 py-2 bg-slate-50 rounded-lg">
        <span className="text-[13px] font-bold text-slate-600">工单总成本：</span>
        <span className="text-[16px] font-bold text-slate-900 tabular-nums">
          {formatAmountWithCurrency(total)}
        </span>
      </div>
    </div>
  );
}
