import { useEffect, useRef, useState } from 'react';
import { apiContextScope, type ApiContext } from '../api/client';
import { workbenchApi, type WorkbenchDashboardDto, type WorkbenchRole } from '../api/workbench';
import { appendActivityPage } from '../features/workbench/activityPages';

type Snapshot = { scope: string; data: WorkbenchDashboardDto | null; at: number; error: string; loading: boolean };
const initial: Snapshot = { scope: '', data: null, at: 0, error: '', loading: false };

export function useWorkbenchDashboard(context: ApiContext | null, role: WorkbenchRole, identity: string, search: string, eventScope: 'KEY' | 'ALL', timeZone = 'Asia/Shanghai') {
  const [clock, setClock] = useState(Date.now());
  const date = new Intl.DateTimeFormat('sv-SE', { timeZone }).format(clock);
  const scope = context ? JSON.stringify([apiContextScope(context), identity, role, date, timeZone]) : '';
  const businessScope = JSON.stringify([scope, search, eventScope]);
  const [metrics, setMetrics] = useState<Snapshot>(initial);
  const [business, setBusiness] = useState<Snapshot>(initial);
  const [revision, setRevision] = useState(0);
  const businessRef = useRef<Snapshot>(initial);
  const moreRequest = useRef<() => void>(() => {});
  const scopeRef = useRef(businessScope);
  scopeRef.current = businessScope;

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!context) { setMetrics(initial); return; }
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      setMetrics(previous => ({ ...(previous.scope === scope ? previous : initial), scope, loading: true }));
      try {
        const data = await workbenchApi.getDashboard(context, role, { sections: 'metrics', date });
        if (!Array.isArray(data?.metrics)) throw new Error('工作台指标响应与契约不一致');
        const at = Date.parse(data.generatedAt);
        if (!Number.isFinite(at)) throw new Error('工作台缺少有效数据时间');
        if (!cancelled) setMetrics({ scope, data, at, error: '', loading: false });
      } catch (cause) {
        if (!cancelled) setMetrics(previous => ({ ...previous, error: cause instanceof Error ? cause.message : '指标读取失败', loading: false }));
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 300000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [scope, revision]);

  useEffect(() => {
    businessRef.current = initial;
    if (!context) { setBusiness(initial); moreRequest.current = () => {}; return; }
    let cancelled = false;
    let pending = false;
    const refresh = async (historyCursor?: string) => {
      if (pending) return;
      pending = true;
      setBusiness(previous => ({ ...(previous.scope === businessScope ? previous : initial), scope: businessScope, loading: true }));
      try {
        const data = await workbenchApi.getDashboard(context, role, {
          sections: 'todos,alerts,activities', search: search || undefined, eventScope, todoLimit: 5, activityLimit: 10,
          date, cursor: historyCursor,
        });
        if (![data?.todos, data?.alerts, data?.activities].every(Array.isArray)
          || (data.todoTotal !== null && !Number.isInteger(data.todoTotal)) || (data.alertTotal !== null && !Number.isInteger(data.alertTotal))) throw new Error('工作台业务分区响应与契约不一致');
        const at = Date.parse(data.generatedAt);
        if (!Number.isFinite(at)) throw new Error('工作台缺少有效数据时间');
        if (!cancelled && scopeRef.current === businessScope) {
          const previous = businessRef.current;
          if (historyCursor && data.activitiesHasMore && data.nextCursor === historyCursor) throw new Error('动态分页游标未推进，请刷新后重试');
          const activities = historyCursor && previous.scope === businessScope && previous.data
            ? appendActivityPage(previous.data.activities, data.activities)
            : data.activities;
          const next = { scope: businessScope, data: { ...data, activities }, at, error: '', loading: false };
          businessRef.current = next;
          setBusiness(next);
        }
      } catch (cause) {
        if (!cancelled && scopeRef.current === businessScope) setBusiness(previous => ({ ...previous, error: cause instanceof Error ? cause.message : '业务事项读取失败', loading: false }));
      } finally { pending = false; }
    };
    moreRequest.current = () => {
      const page = businessRef.current;
      if (scopeRef.current === businessScope && page.scope === businessScope && page.data?.activitiesHasMore && page.data.nextCursor) {
        void refresh(page.data.nextCursor);
      }
    };
    void refresh();
    // Poll the first page only. History pages are requested solely by an explicit user action.
    const timer = window.setInterval(() => void refresh(), 60000);
    return () => { cancelled = true; moreRequest.current = () => {}; window.clearInterval(timer); };
  }, [businessScope, revision]);

  const m = metrics.scope === scope ? metrics : initial;
  const b = business.scope === businessScope ? business : initial;
  const age = m.at ? Math.max(0, (clock - m.at) / 1000) : Infinity;
  return {
    dashboard: b.data ? { ...b.data, metrics: age > 1800 ? (m.data?.metrics ?? []).map(item => ({ ...item, value: '-' })) : m.data?.metrics ?? [] } : m.data ? { ...m.data, todos: [], alerts: [], activities: [], todoTotal: null, alertTotal: null } : null,
    metricTime: m.data?.generatedAt,
    error: [m.error, b.error].filter(Boolean).join('；'),
    metricError: m.error,
    businessError: b.error,
    loading: m.loading || b.loading,
    stale: age > 300 && Boolean(m.data),
    expired: age > 1800 && Boolean(m.data),
    businessStale: Boolean(b.at && clock - b.at > 300000),
    businessReady: Boolean(b.data),
    sourceWarnings: [...new Set([...(m.data?.sourceWarnings || []), ...(b.data?.sourceWarnings || [])])],
    refresh: () => setRevision(value => value + 1),
    hasMore: Boolean(b.data?.activitiesHasMore && b.data.nextCursor),
    loadMore: () => moreRequest.current(),
  };
}
