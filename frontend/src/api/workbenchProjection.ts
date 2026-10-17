import type { WorkbenchDashboardDto, WorkbenchMetricDto, WorkbenchQuery } from './workbench';

const moduleLabels: Record<string, string> = { SALES: '销售管理', PRODUCTION: '生产管理', INVENTORY: '库存管理', PROCUREMENT: '采购管理', FINANCE: '财务管理', MESSAGE: '消息管理', PLATFORM: '平台管理' };
const moduleLabel = (value: string) => moduleLabels[value?.toUpperCase()] || value;
const unavailable = (value: unknown) => value === null || value === undefined ? '-' : String(value);

// Adapt the frozen PRD 1.1 projection without inventing facts or combining currencies/units.
// Legacy flat responses are retained for existing deployments; malformed requested sections fail visibly.
export function workbenchProjection(response: any, query: WorkbenchQuery): WorkbenchDashboardDto {
  if (!response?.schemaVersion) return response;
  if (response.schemaVersion !== '1.1' || !response.data) throw new Error('工作台响应版本不受支持');
  const data = response.data;
  const metrics: WorkbenchMetricDto[] = [];
  const revenueTitles = { ORDER_AMOUNT: '本月订单金额', CONFIRMED_REVENUE_AMOUNT: '本月确认收入', SHIPPED_RECOGNIZED_AMOUNT: '本月发货确权金额' };
  const revenue = data.metrics?.revenue;
  if (revenue) {
    for (const group of revenue.periodAmountGroups || []) {
      if (!revenueTitles[group.metric] || !group.currency || !group.taxBasis) throw new Error('金额分组缺少指标、币种或税口径');
      metrics.push({ key: `${group.metric}:${group.currency}:${group.taxBasis}`, title: revenueTitles[group.metric], value: revenue.availability === 'UNAVAILABLE' ? '-' : unavailable(group.amount), unit: group.currency, definition: `${group.taxBasis}；来源事实金额，不跨币种合计` });
    }
    if (!metrics.length) Object.entries(revenueTitles).forEach(([key, title]) => metrics.push({ key, title, value: '-', unit: '', definition: '尚未取得权威金额事实' }));
  }
  const due = data.metrics?.productionDue;
  if (due) for (const group of due.unitGroups || []) {
    metrics.push({ key: `productionDue:${group.factoryId}:${group.plannedUnit}`, title: '交期达成量', value: due.availability === 'UNAVAILABLE' ? '-' : unavailable(group.achievedQty), unit: group.plannedUnit || '', definition: `工厂 ${group.factoryId}；应交 ${unavailable(group.dueQty)}，逾期 ${unavailable(group.overdueQty)}` });
  }
  if (due && !due.unitGroups?.length) metrics.push({ key: 'productionDue', title: '交期达成量', value: '-', unit: '', definition: '尚未取得完工事实' });
  const low = data.metrics?.lowStockMaterial;
  if (low) metrics.push({ key: 'lowStockMaterial', title: '库存低水位物料', value: low.availability === 'UNAVAILABLE' ? '-' : unavailable(low.distinctMaterialCount), unit: '种', definition: '当前用户授权仓库，按物料去重' });
  if (query.sections === 'metrics' && !data.metrics) throw new Error('响应缺少请求的指标分区');
  if (query.sections === 'todos,alerts,activities' && ![data.todos?.items, data.alerts?.items, data.activities?.items].every(Array.isArray)) throw new Error('响应缺少请求的业务分区');
  return {
    role: data.role, generatedAt: data.dataAsOf || data.generatedAt,
    dataScope: { tenantId: data.scope?.tenantId },
    metrics,
    todos: (data.todos?.items || []).map(item => ({
      module: moduleLabel(item.sourceModule), sourceType: item.sourceType, sourceId: item.sourceId, sourceNo: item.sourceNo,
      title: item.title, dueDate: item.dueAt, urgent: item.priority === 'P0',
    })),
    alerts: (data.alerts?.items || []).map(item => ({
      module: moduleLabel(item.sourceModule), sourceType: item.availability === 'SOURCE_READY' ? item.sourceType : undefined,
      sourceId: item.sourceId, sourceNo: item.sourceNo, title: item.title, detail: item.detail,
      severity: item.riskLevel === 'MEDIUM' ? 'medium' : 'high',
    })),
    activities: (data.activities?.items || []).map(item => ({
      id: item.activityId, module: moduleLabel(item.sourceModule), sourceType: item.sourceType, sourceId: item.sourceId,
      sourceNo: item.sourceNo, title: item.title, detail: item.summary, occurredAt: item.occurredAt,
    })),
    // The frozen response has no aggregate total. A limited items.length is never used as a total.
    todoTotal: Number.isInteger(data.todos?.total) ? data.todos.total : null,
    alertTotal: Number.isInteger(data.alerts?.total) ? data.alerts.total : null,
    nextCursor: data.activities?.nextCursor,
    activitiesHasMore: data.activities?.hasMore,
    sourceWarnings: (data.sources || []).filter(source => source.status !== 'AVAILABLE')
      .map(source => `${moduleLabel(source.source)}：${source.status}${source.errorCode ? ` (${source.errorCode})` : ''}`),
  };
}
