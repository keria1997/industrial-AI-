import { apiRequest, type ApiContext } from './client';
import { workbenchProjection } from './workbenchProjection';

export type WorkbenchRole =
  | '老板' | '销售' | '计划员' | '采购' | '仓管' | '车间' | '财务' | '人事' | '管理员' | '超级管理员';

export type WorkbenchMetricDto = {
  key: string;
  title: string;
  value: string;
  unit: string;
  definition: string;
};

export type WorkbenchTodoDto = {
  module: string;
  sourceType: string;
  sourceId: string;
  sourceNo?: string | null;
  title: string;
  dueDate?: string | null;
  urgent: boolean;
};

export type WorkbenchAlertDto = {
  module: string;
  sourceType?: string;
  severity: 'low' | 'medium' | 'high';
  title: string;
  detail: string;
  sourceId?: string | null;
  sourceNo?: string | null;
};

export type WorkbenchActivityDto = {
  id: string;
  title: string;
  detail: string;
  module: string;
  sourceType: string;
  sourceId: string;
  sourceNo?: string | null;
  occurredAt: string;
};

export type WorkbenchDashboardDto = {
  role: WorkbenchRole;
  metrics: WorkbenchMetricDto[];
  todos: WorkbenchTodoDto[];
  alerts: WorkbenchAlertDto[];
  activities: WorkbenchActivityDto[];
  todoTotal: number | null;
  alertTotal: number | null;
  generatedAt: string;
  dataScope: { tenantId: string };
  nextCursor?: string | null;
  activitiesHasMore?: boolean;
  sourceWarnings?: string[];
};

export type WorkbenchQuery = {
  sections?: 'metrics' | 'todos,alerts,activities';
  search?: string;
  eventScope?: 'KEY' | 'ALL';
  todoLimit?: number;
  activityLimit?: number;
  cursor?: string;
};

export const workbenchApi = {
  getDashboard: (context: ApiContext, role: WorkbenchRole, query: WorkbenchQuery = {}) => {
    const params = new URLSearchParams({ role });
    Object.entries(query).forEach(([key, value]) => { if (value !== undefined && value !== '') params.set(key, String(value)); });
    return apiRequest<unknown>(
      `/api/v1/workbench/dashboard?${params}`,
      context,
      { method: 'GET' },
    ).then(response => workbenchProjection(response, query));
  },
};
