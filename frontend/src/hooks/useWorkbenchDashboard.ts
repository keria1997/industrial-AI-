import { useEffect, useRef, useState } from 'react';
import type { ApiContext } from '../api/client';
import { workbenchApi, type WorkbenchDashboardDto, type WorkbenchRole } from '../api/workbench';

type Snapshot = { scope: string; data: WorkbenchDashboardDto | null; at: number; error: string; loading: boolean };
const initial: Snapshot = { scope: '', data: null, at: 0, error: '', loading: false };

export function useWorkbenchDashboard(context: ApiContext | null, role: WorkbenchRole, identity: string, search: string, eventScope: 'KEY' | 'ALL') {
  const scope = context ? `${context.tenantId}:${context.accessToken}:${identity}:${role}:${new Date().toDateString()}` : '';
  const businessScope = `${scope}:${search}:${eventScope}`;
  const [metrics, setMetrics] = useState<Snapshot>(initial);
  const [business, setBusiness] = useState<Snapshot>(initial);
  const [revision, setRevision] = useState(0);
  const [pageCursor, setPageCursor] = useState('');
  const [clock, setClock] = useState(Date.now());
  const businessRef = useRef<Snapshot>(initial);
  const cursor = useRef('');
  const more = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => { cursor.current = ''; more.current = false; setPageCursor(''); }, [businessScope]);

  useEffect(() => {
    if (!context) { setMetrics(initial); return; }
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      setMetrics(previous => ({ ...(previous.scope === scope ? previous : initial), scope, loading: true }));
      try {
        const data = await workbenchApi.getDashboard(context, role, { sections: 'metrics' });
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
    if (!context) { setBusiness(initial); businessRef.current = initial; return; }
    let cancelled = false;
    let pending = false;
    const refresh = async () => {
      if (pending) return;
      pending = true;
      setBusiness(previous => ({ ...(previous.scope === businessScope ? previous : initial), scope: businessScope, loading: true }));
      try {
        const data = await workbenchApi.getDashboard(context, role, {
          sections: 'todos,alerts,activities', search: search || undefined, eventScope, todoLimit: 5, activityLimit: 10,
          cursor: cursor.current || undefined,
        });
        if (![data?.todos, data?.alerts, data?.activities].every(Array.isArray)
          || (data.todoTotal !== null && !Number.isInteger(data.todoTotal)) || (data.alertTotal !== null && !Number.isInteger(data.alertTotal))) throw new Error('工作台业务分区响应与契约不一致');
        const at = Date.parse(data.generatedAt);
        if (!Number.isFinite(at)) throw new Error('工作台缺少有效数据时间');
        if (!cancelled) {
          const previous = businessRef.current;
          const activities = cursor.current && previous.scope === businessScope
            ? [...new Map([...previous.data.activities, ...data.activities].map(item => [item.id, item])).values()].slice(-50)
            : data.activities;
          const next = { scope: businessScope, data: { ...data, activities }, at, error: '', loading: false };
          cursor.current = data.nextCursor || '';
          more.current = Boolean(data.activitiesHasMore && data.nextCursor);
          businessRef.current = next;
          setBusiness(next);
        }
      } catch (cause) {
        if (!cancelled) setBusiness(previous => ({ ...previous, error: cause instanceof Error ? cause.message : '业务事项读取失败', loading: false }));
      } finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(refresh, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [businessScope, revision, pageCursor]);

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
    refresh: () => { cursor.current = ''; setRevision(value => value + 1); },
    hasMore: more.current && b.scope === businessScope,
    loadMore: () => { if (cursor.current) setPageCursor(cursor.current); },
  };
}
