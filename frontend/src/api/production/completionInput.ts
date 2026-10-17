export type CompletionFacts = {
  warehouseResourceId: string;
  traceMode: string;
  productionDate: string;
  allocationRevision: number;
  batchNo?: string;
  serialNumbers?: string[];
  binId?: string;
};

// Facts must come from a frozen source contract/form; inventory IDs are not platform resource IDs.
export function requireCompletionFacts(facts?: CompletionFacts): CompletionFacts {
  const date = new Date(`${facts?.productionDate || ''}T00:00:00Z`);
  if (!facts?.warehouseResourceId?.trim() || !facts.traceMode?.trim()
    || !Number.isSafeInteger(facts.allocationRevision) || facts.allocationRevision < 1
    || !/^\d{4}-\d{2}-\d{2}$/.test(facts.productionDate)
    || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== facts.productionDate) {
    throw new Error('暂不能提交完工入库：缺少已确认的仓库资源映射、追溯规则、分配修订或生产日期，请等待正式来源契约补齐后办理');
  }
  return facts;
}
