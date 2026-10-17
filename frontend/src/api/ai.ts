import { apiRequest, type ApiContext } from './client';

export type ModelProvider = 'openai' | 'anthropic' | 'azure' | 'local' | 'custom';
export type AIDomain = 'inventory' | 'sales' | 'production' | 'procurement' | 'finance' | 'general';
export type InsightType = 'anomaly' | 'prediction' | 'recommendation' | 'optimization' | 'alert';
export type InsightSeverity = 'critical' | 'warning' | 'info' | 'success';
export type InsightStatus = 'active' | 'dismissed' | 'expired' | 'applied';
export type ActionPlanStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'executed' | 'cancelled';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type ModelConfigDto = {
  id: string; code: string; name: string;
  provider: ModelProvider; modelName: string;
  apiKeyMasked: string; baseUrl: string;
  temperature: string; maxTokens: number; timeoutSeconds: number;
  isActive: boolean; isPrimary: boolean;
  fallbackModelId?: string | null;
  remark: string; version: number; createdAt: string; updatedAt: string;
};

export type ConversationDto = {
  id: string; conversationNo: string;
  title: string; domain: AIDomain;
  status: string; messageCount: number;
  version: number; createdAt: string; updatedAt: string;
};

export type ActionPlanData = {
  title: string; description: string;
  targetModule: string; targetEntity: string; targetAction: string;
  parameters: Record<string, unknown>;
  impactScope: string; riskLevel: RiskLevel;
  dataEvidence: Array<{ label: string; value: string }>;
  approvalPath: string;
};

export type MessageDto = {
  id: string; conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  intent: string; domain: AIDomain;
  tokensUsed: number; latencyMs: number;
  modelName: string;
  actionPlan?: ActionPlanData;
  isHelpful?: boolean; feedback: string;
  createdAt: string;
};

export type InsightDto = {
  id: string; insightNo: string;
  type: InsightType; domain: AIDomain; severity: InsightSeverity;
  title: string; summary: string;
  detail: Record<string, unknown>;
  sourceType: string; sourceId: string;
  confidence: string; status: InsightStatus;
  version: number; createdAt: string; updatedAt: string;
};

export type ActionPlanDto = {
  id: string; messageId: string; conversationId: string;
  title: string; description: string;
  targetModule: string; targetEntity: string; targetAction: string;
  impactScope: string; riskLevel: RiskLevel;
  approvalPath: string;
  status: ActionPlanStatus;
  submittedBy: string; submittedAt?: string;
  approvedBy: string; approvedAt?: string;
  rejectedReason: string;
  version: number; createdAt: string; updatedAt: string;
};

export type ChatResponse = {
  conversation: ConversationDto;
  userMessage: MessageDto;
  assistantMessage: MessageDto;
  actionPlan?: ActionPlanData;
};

export type NL2SQLResponse = {
  sql: string;
  explanation: string;
  tables: string[];
  result?: Record<string, unknown>[];
  error?: string;
};

export type ProductionAnalysisResult = {
  anomalies: Array<{ productId: string; productName: string; type: string; severity: InsightSeverity; detail: string }>;
  predictions: Array<{ metric: string; currentValue: string; predictedValue: string; trend: string; confidence: string }>;
  recommendations: Array<{ title: string; description: string; priority: RiskLevel; expectedImpact: string }>;
};

export type AIDashboardDto = {
  totalConversations: number; totalMessages: number;
  activeInsights: number; criticalAlerts: number;
  pendingActionPlans: number; executedActionPlans: number;
  messagesByDomain: Record<string, number>;
  insightsBySeverity: Record<string, number>;
  recentInsights: InsightDto[];
};

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const aiApi = {
  // ===== Model Configs =====
  listModels: (context: ApiContext, filter?: { page?: number; pageSize?: number; provider?: string; isActive?: boolean; search?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<ModelConfigDto[]>(`/api/v1/ai/models?${params.toString()}`, context);
  },
  getModel: (context: ApiContext, id: string) =>
    apiRequest<ModelConfigDto>(`/api/v1/ai/models/${id}`, context),
  createModel: (context: ApiContext, input: { code: string; name: string; provider: string; modelName: string; apiKey?: string; baseUrl?: string; temperature?: string; maxTokens?: number; timeoutSeconds?: number; isPrimary?: boolean; remark?: string }) =>
    apiRequest<{ config: ModelConfigDto }>('/api/v1/ai/models', context, { method: 'POST', idempotencyKey: key(`ai-model-create:${input.code}`), body: JSON.stringify(input) }),
  updateModel: (context: ApiContext, model: ModelConfigDto, input: Partial<{ name: string; provider: string; modelName: string; apiKey: string; baseUrl: string; temperature: string; maxTokens: number; timeoutSeconds: number; isActive: boolean; isPrimary: boolean; remark: string }>) =>
    apiRequest<{ config: ModelConfigDto }>(`/api/v1/ai/models/${model.id}`, context, { method: 'PATCH', expectedVersion: model.version, idempotencyKey: key(`ai-model-update:${model.id}`), body: JSON.stringify(input) }),
  deleteModel: (context: ApiContext, model: ModelConfigDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/ai/models/${model.id}`, context, { method: 'DELETE', expectedVersion: model.version, idempotencyKey: key(`ai-model-delete:${model.id}`) }),

  // ===== Chat =====
  chat: (context: ApiContext, input: { conversationId?: string; message: string; domain?: string; context?: Record<string, unknown> }) =>
    apiRequest<ChatResponse>('/api/v1/ai/chat', context, { method: 'POST', idempotencyKey: key('ai-chat'), body: JSON.stringify(input) }),

  // ===== Conversations =====
  listConversations: (context: ApiContext, filter?: { page?: number; pageSize?: number; domain?: string; status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: ConversationDto[]; total: number }>(`/api/v1/ai/conversations?${params.toString()}`, context);
  },
  getConversation: (context: ApiContext, id: string) =>
    apiRequest<ConversationDto>(`/api/v1/ai/conversations/${id}`, context),

  // ===== Messages =====
  listMessages: (context: ApiContext, conversationId: string, filter?: { page?: number; pageSize?: number }) => {
    const params = new URLSearchParams({ conversationId });
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: MessageDto[]; total: number }>(`/api/v1/ai/messages?${params.toString()}`, context);
  },
  feedback: (context: ApiContext, messageId: string, isHelpful: boolean, feedback?: string) =>
    apiRequest<{ updated: boolean }>(`/api/v1/ai/messages/${messageId}/feedback`, context, { method: 'POST', idempotencyKey: key(`ai-feedback:${messageId}`), body: JSON.stringify({ isHelpful, feedback: feedback ?? '' }) }),

  // ===== NL2SQL =====
  nl2sql: (context: ApiContext, query: string) =>
    apiRequest<NL2SQLResponse>('/api/v1/ai/nl2sql', context, { method: 'POST', body: JSON.stringify({ query }) }),

  mapColumns: (context: ApiContext, input: { fields: Array<{ field: string; label: string; required: boolean }>; csvHeaders: string[]; sampleRows: Array<Record<string, string>>; entityType: string }) =>
    apiRequest<{ source: 'llm' | 'unavailable'; mapping: Record<string, string> }>('/api/v1/ai/map-columns', context, { method: 'POST', body: JSON.stringify(input) }),

  // ===== Production Intelligence =====
  analyzeProduction: (context: ApiContext) =>
    apiRequest<ProductionAnalysisResult>('/api/v1/ai/analyze-production', context, { method: 'POST' }),

  // ===== Insights =====
  listInsights: (context: ApiContext, filter?: { page?: number; pageSize?: number; domain?: string; type?: string; severity?: string; status?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: InsightDto[]; total: number }>(`/api/v1/ai/insights?${params.toString()}`, context);
  },
  getInsight: (context: ApiContext, id: string) =>
    apiRequest<InsightDto>(`/api/v1/ai/insights/${id}`, context),
  createInsight: (context: ApiContext, input: { type: string; domain: string; severity: string; title: string; summary: string; detail?: Record<string, unknown>; sourceType?: string; sourceId?: string; confidence?: string }) =>
    apiRequest<{ insight: InsightDto }>('/api/v1/ai/insights', context, { method: 'POST', idempotencyKey: key('ai-insight-create'), body: JSON.stringify(input) }),
  dismissInsight: (context: ApiContext, insight: InsightDto) =>
    apiRequest<{ dismissed: boolean }>(`/api/v1/ai/insights/${insight.id}/dismiss`, context, { method: 'POST', expectedVersion: insight.version, idempotencyKey: key(`ai-insight-dismiss:${insight.id}`) }),

  // ===== Action Plans =====
  listActionPlans: (context: ApiContext, filter?: { page?: number; pageSize?: number; status?: string; conversationId?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: ActionPlanDto[]; total: number }>(`/api/v1/ai/action-plans?${params.toString()}`, context);
  },
  submitActionPlan: (context: ApiContext, input: { messageId: string; conversationId: string; actionPlan: ActionPlanData }) =>
    apiRequest<{ actionPlan: ActionPlanDto }>('/api/v1/ai/action-plans/submit', context, { method: 'POST', idempotencyKey: key('ai-action-submit'), body: JSON.stringify(input) }),
  reviewActionPlan: (context: ApiContext, actionPlanId: string, decision: 'approve' | 'reject', reason?: string) =>
    apiRequest<{ actionPlanId: string; status: string }>(`/api/v1/ai/action-plans/${actionPlanId}/review`, context, { method: 'POST', idempotencyKey: key(`ai-action-review:${actionPlanId}`), body: JSON.stringify({ decision, reason }) }),

  // ===== Dashboard =====
  getDashboard: (context: ApiContext) =>
    apiRequest<AIDashboardDto>('/api/v1/ai/dashboard', context),
};
