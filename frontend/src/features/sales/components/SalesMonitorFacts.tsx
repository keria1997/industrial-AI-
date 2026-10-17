import { AlertTriangle, Box, ShoppingCart, Target, Truck, Wallet } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { fetchAiInsights } from '../../../api/fulfillment';
import { supplyChainApi } from '../../../api/supply-chain';
import { ApiDataState } from '../../../components/ApiDataState';
import { useApiResource } from '../../../hooks/useApiResource';
import { loadApiCollection } from '../../../shared/apiCollection';

const loadInsights = (context: ApiContext) => fetchAiInsights(context);
const loadCustomers = (context: ApiContext) =>
  loadApiCollection((page, pageSize) => supplyChainApi.listCustomers(context, { page, pageSize }));
const count = (value: unknown) => Number.isInteger(value) && Number(value) >= 0 ? String(value) : '-';
const money = (value: unknown) => value !== '' && value != null && Number.isFinite(Number(value))
  ? (Number(value) / 10000).toFixed(2) : '-';

// UI -> business APIs. No local quotes, reminder records, forecasts or generated AI replies.
export function SalesMonitorFacts({ apiContext, Cabin }: { apiContext: ApiContext | null; Cabin: any }) {
  const insights = useApiResource(apiContext, loadInsights);
  const customers = useApiResource(apiContext, loadCustomers);
  const facts = insights.data;
  const risks = Array.isArray(facts?.deliveryRiskOrders) ? facts.deliveryRiskOrders : [];
  const customerProfilesComplete = customers.data != null && customers.data.every(customer => {
    const date = customer.metadata?.lastInteractionAt;
    return typeof date === 'string' && Number.isFinite(Date.parse(date));
  });
  const dormant = (customers.data ?? []).filter(customer => {
    const metadata = customer.metadata ?? {};
    return metadata.level === 'D' && (!metadata.phone || !customer.industry)
      && typeof metadata.lastInteractionAt === 'string'
      && Date.now() - Date.parse(metadata.lastInteractionAt) > 30 * 86400000;
  });
  const customerState = customers.loading ? '加载中' : customers.error ? '数据加载失败'
    : !customerProfilesComplete ? '数据不完整' : dormant.length ? '建议跟进' : '暂未发现';
  const riskState = insights.loading ? '加载中' : insights.error ? '数据加载失败'
    : facts?.deliveryRiskCount === 0 ? '暂无 AI 预警'
      : facts?.deliveryRiskCount > 0 ? '交期预警' : '尚未获取预警结果';
  return <>
    {(insights.loading || insights.error) && <ApiDataState loading={insights.loading} error={insights.error} onRetry={insights.reload} />}
    {(customers.loading || customers.error) && <ApiDataState loading={customers.loading} error={customers.error} onRetry={customers.reload} />}
    <Cabin
      metrics={[
        { title: '生效报价数', value: '-', unit: '份', subtitle: '尚未获取报价统计', icon: Target, theme: 'emerald' },
        { title: '本月订单数', value: count(facts?.monthlyOrderCount), unit: '单', subtitle: '正式销售统计', icon: ShoppingCart, theme: 'blue' },
        { title: '异常停滞订单', value: count(facts?.stalledCount), unit: '单', subtitle: '正式停滞规则统计', icon: AlertTriangle, theme: 'rose' },
        { title: '订单销售额', value: money(facts?.totalSalesAmount), unit: '万元', subtitle: '正式销售统计', icon: Wallet, theme: 'amber' },
      ]}
      aiCards={[
        {
          title: 'AI 订单转化延期预警 & 智能挽回', icon: Box, tone: 'purple',
          subject: '报价有效期与订单转化分析', badge: '尚未获取 AI 分析结果',
          lines: ['识别报价临期与订单转化风险。当前暂无可展示的分析结果。'],
        },
        {
          title: 'AI 客户资产盘点与激活提示', icon: AlertTriangle, tone: 'amber',
          subject: '客户互动与档案完整性分析', badge: customerState,
          lines: customers.error || customers.loading ? ['客户来源尚未加载完成。']
            : !customerProfilesComplete ? ['部分客户缺少互动日期，暂无法判断是否超过 30 天未互动。']
              : dormant.length ? [`发现 ${dormant.length} 家 D 级客户超过 30 天未互动且联系人或行业资料不完整。`]
                : ['暂未发现超过 30 天未互动且联系人或行业资料不完整的客户。'],
        },
        {
          title: '订单履约延期预警', icon: Truck, tone: 'rose',
          subject: '未完成订单交期风险分析', badge: riskState,
          lines: insights.error || insights.loading || facts?.deliveryRiskCount == null ? ['尚未获取正式交期预警结果。']
            : facts.deliveryRiskCount > 0
              ? [`${facts.deliveryRiskCount} 单存在交期风险。${risks.map(order => order.orderId).join('、')}`, '立即发起跨部门交付协同。']
              : ['当前没有距离交期不足的未发货订单。'],
        },
      ]}
      trend={{
        title: 'AI 报价-订单转化趋势与归因分析',
        chartTitle: '近半年报价金额与 AI 预测成单金额（万元）',
        metricLabel: '确认滞留', insightTitle: '订单转化趋势',
        legend: [{ label: '发出报价金额', color: '#3b82f6' }, { label: 'AI 预测成单金额', color: '#8b5cf6' }],
      }}
    />
  </>;
}
