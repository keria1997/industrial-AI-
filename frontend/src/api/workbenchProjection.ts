import type { WorkbenchDashboardDto, WorkbenchMetricDto, WorkbenchQuery } from './workbench';

const moduleLabels: Record<string, string> = { SALES: '销售管理', PRODUCTION: '生产管理', INVENTORY: '库存管理', PROCUREMENT: '采购管理', FINANCE: '财务管理', MESSAGE: '消息管理', PLATFORM: '平台管理' };
const moduleLabel = (value: string) => moduleLabels[value?.toUpperCase()] || value;
const unavailable = (value: unknown) => value === null || value === undefined ? '-' : String(value);

function sourceWarnings(sources: any): string[] {
  if (sources == null) return [];
  if (!Array.isArray(sources)) throw new Error('工作台来源状态响应与契约不一致');
  return sources.flatMap(source => {
    // Pending integration is an expected empty state; partial/stale/failed sources remain visible.
    const status = source?.status ?? source?.availability;
    if (status === 'AVAILABLE' || status === 'SOURCE_PENDING') return [];
    const name = typeof source?.source === 'string' && source.source.trim() ? moduleLabel(source.source) : '未知来源';
    const label = typeof status === 'string' && status.trim() ? status : '来源状态未提供';
    const reason = source?.errorCode || source?.unavailableReason;
    return [`${name}：${label}${reason ? ` (${reason})` : ''}`];
  });
}

// Adapt the frozen PRD 1.1 projection without inventing facts or combining currencies/units.
// Only the delivered 1.1 envelope is accepted; missing sections fail visibly.
export function workbenchProjection(response: any, query: WorkbenchQuery): WorkbenchDashboardDto {
  if (response?.schemaVersion !== '1.1' || !response.data || response.error) throw new Error('工作台响应版本不受支持或返回错误');
  const data = response.data;
  if (Array.isArray(data.activities?.items) && data.activities.items.some(item => !item?.activityId && !item?.id)) {
    throw new Error('工作台动态缺少稳定事件标识，请重新查询');
  }
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
  const directMoney = {
    orderAmount: '本月订单金额', confirmedRevenueAmount: '本月确认收入',
    shippedRecognizedAmount: '本月发货确权金额',
  };
  if (!revenue) Object.entries(directMoney).forEach(([key, title]) => {
    const fact = data.metrics?.[key];
    if (!fact) return;
    const available = fact.availability === 'AVAILABLE' && fact.currency && fact.taxBasis;
    metrics.push({
      key, title, value: available ? unavailable(fact.value) : '-', unit: available ? fact.currency : '',
      definition: fact.availability === 'UNAVAILABLE'
        ? `数据待接入（${fact.unavailableReason || '来源事实缺失'}）`
        : available ? `${fact.taxBasis}；来源事实金额，不跨币种合计` : '金额币种或税口径未提供，待服务端补齐',
    });
  });
  // Preserve delivered role counts, but never expose ungrouped money or removed attendance metrics.
  for (const fact of data.metrics?.legacy || []) {
    if (fact.key === 'attendanceRate' || metrics.some(item => item.key === fact.key)) continue;
    const money = ['元', '¥', 'CNY', 'USD', 'EUR'].includes(fact.unit) || /amount|receivable|payable|revenue|expenditure/i.test(fact.key);
    metrics.push({ ...fact, value: money ? '-' : unavailable(fact.value), unit: money ? '' : fact.unit,
      definition: money ? '金额币种或税口径未提供，待服务端补齐' : fact.definition });
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
    // Refresh freshness uses the server projection time, not the last business change.
    role: data.role, generatedAt: data.generatedAt || data.dataAsOf,
    dataScope: { tenantId: data.scope?.tenantId },
    metrics,
    todos: (data.todos?.items || []).map(item => ({
      module: moduleLabel(item.sourceModule || item.module), sourceType: item.sourceType, sourceId: item.sourceId, sourceNo: item.sourceNo,
      title: item.title, dueDate: item.dueAt ?? item.dueDate, urgent: item.priority === 'P0' || item.urgent === true,
    })),
    alerts: (data.alerts?.items || []).map(item => ({
      module: moduleLabel(item.sourceModule || item.module), sourceType: item.availability === 'UNAVAILABLE' ? undefined : item.sourceType,
      sourceId: item.sourceId, sourceNo: item.sourceNo, title: item.title, detail: item.detail,
      severity: ({ LOW: 'low', MEDIUM: 'medium', HIGH: 'high', low: 'low', medium: 'medium', high: 'high' } as const)[item.riskLevel || item.severity] || 'high',
    })),
    activities: (data.activities?.items || []).map(item => ({
      id: item.activityId || item.id, module: moduleLabel(item.sourceModule || item.module), sourceType: item.sourceType, sourceId: item.sourceId,
      sourceNo: item.sourceNo, title: item.title, detail: item.summary ?? item.detail, occurredAt: item.occurredAt,
    })),
    // The frozen response has no aggregate total. A limited items.length is never used as a total.
    todoTotal: Number.isInteger(data.todos?.total) ? data.todos.total : null,
    alertTotal: Number.isInteger(data.alerts?.total) ? data.alerts.total : null,
    nextCursor: data.activities?.nextCursor,
    activitiesHasMore: data.activities?.hasMore,
    sourceWarnings: sourceWarnings(data.sources),
  };
}
