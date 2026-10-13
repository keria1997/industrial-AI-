import { apiRequest, type ApiContext } from './client';

export type MessageCategory = 'order' | 'payment' | 'shipping' | 'inventory' | 'production' | 'procurement' | 'finance' | 'system';
export type MessageChannel = 'in_app' | 'email' | 'sms' | 'webhook';
export type MessagePriority = 'urgent' | 'high' | 'normal' | 'low';

export type TemplateVariable = { name: string; desc: string };

export type MessageTemplateDto = {
  id: string; code: string; name: string;
  category: MessageCategory; channel: MessageChannel;
  titleTemplate: string; bodyTemplate: string;
  variables: TemplateVariable[];
  priority: MessagePriority; isActive: boolean;
  remark: string; version: number; createdAt: string; updatedAt: string;
};

export type MessageRecordDto = {
  id: string; msgNo: string; templateCode?: string;
  category: MessageCategory; channel: MessageChannel; priority: MessagePriority;
  title: string; body: string;
  recipientId: string; recipientName: string;
  senderId: string; senderName: string;
  sourceType: string; sourceId: string; sourceDocNo: string;
  isRead: boolean; readAt?: string;
  isArchived: boolean; archivedAt?: string;
  isStarred: boolean;
  metadata: Record<string, unknown>;
  status: string; errorMessage: string;
  sentAt?: string;
  version: number; createdAt: string; updatedAt: string;
};

export type UserPreferenceDto = {
  id: string; userId: string;
  category: MessageCategory; channel: MessageChannel;
  enabled: boolean; minPriority: MessagePriority;
  quietHoursStart: string; quietHoursEnd: string;
  version: number; createdAt: string; updatedAt: string;
};

export type SubscriptionDto = {
  id: string; userId: string;
  eventType: string; category: MessageCategory;
  enabled: boolean;
  version: number; createdAt: string; updatedAt: string;
};

export type MessageDashboardDto = {
  total: number; unread: number; archived: number; starred: number;
  byCategory: Record<string, number>;
  byPriority: Record<string, number>;
  recentUnread: MessageRecordDto[];
};

const key = (scope: string) => `${scope}:${crypto.randomUUID()}`;

export const messagesApi = {
  // ===== Templates =====
  listTemplates: (context: ApiContext, filter?: { page?: number; pageSize?: number; category?: string; search?: string }) =>
    apiRequest<{ items: MessageTemplateDto[]; total: number }>(`/api/v1/message/templates?${filter ? new URLSearchParams(filter as Record<string, string>).toString() : ''}`, context),
  getTemplate: (context: ApiContext, id: string) =>
    apiRequest<MessageTemplateDto>(`/api/v1/message/templates/${id}`, context),
  createTemplate: (context: ApiContext, input: { code: string; name: string; category: string; channel: string; titleTemplate: string; bodyTemplate: string; variables?: TemplateVariable[]; priority?: string; remark?: string }) =>
    apiRequest<{ template: MessageTemplateDto }>('/api/v1/message/templates', context, { method: 'POST', idempotencyKey: key(`tpl-create:${input.code}`), body: JSON.stringify(input) }),
  updateTemplate: (context: ApiContext, template: MessageTemplateDto, input: Partial<{ name: string; category: string; channel: string; titleTemplate: string; bodyTemplate: string; variables: TemplateVariable[]; priority: string; isActive: boolean; remark: string }>) =>
    apiRequest<{ template: MessageTemplateDto }>(`/api/v1/message/templates/${template.id}`, context, { method: 'PATCH', expectedVersion: template.version, idempotencyKey: key(`tpl-update:${template.id}`), body: JSON.stringify(input) }),
  deleteTemplate: (context: ApiContext, template: MessageTemplateDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/message/templates/${template.id}`, context, { method: 'DELETE', expectedVersion: template.version, idempotencyKey: key(`tpl-delete:${template.id}`) }),

  // ===== Messages =====
  listMessages: (context: ApiContext, filter?: { page?: number; pageSize?: number; recipientId?: string; category?: string; isRead?: boolean; isArchived?: boolean; isStarred?: boolean; priority?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filter) for (const [k, v] of Object.entries(filter)) if (v !== undefined && v !== null) params.append(k, String(v));
    return apiRequest<{ items: MessageRecordDto[]; total: number }>(`/api/v1/message/messages?${params.toString()}`, context);
  },
  getMessage: (context: ApiContext, id: string) =>
    apiRequest<MessageRecordDto>(`/api/v1/message/messages/${id}`, context),
  sendMessage: (context: ApiContext, input: { templateCode?: string; category: string; channel?: string; priority?: string; recipientId: string; recipientName?: string; title: string; body: string; sourceType?: string; sourceId?: string; sourceDocNo?: string; metadata?: Record<string, unknown>; variables?: Record<string, string> }) =>
    apiRequest<{ message: MessageRecordDto }>('/api/v1/message/messages', context, { method: 'POST', idempotencyKey: key('msg-send'), body: JSON.stringify(input) }),
  sendBatchMessage: (context: ApiContext, input: { templateCode?: string; category: string; channel?: string; priority?: string; recipientIds: string[]; title: string; body: string; sourceType?: string; sourceId?: string; sourceDocNo?: string; metadata?: Record<string, unknown>; variables?: Record<string, string> }) =>
    apiRequest<{ messages: MessageRecordDto[]; sent: number; skipped: number }>('/api/v1/message/messages/batch', context, { method: 'POST', idempotencyKey: key('msg-batch'), body: JSON.stringify(input) }),
  markAsRead: (context: ApiContext, message: MessageRecordDto) =>
    apiRequest<{ message: MessageRecordDto }>(`/api/v1/message/messages/${message.id}/read`, context, { method: 'POST', expectedVersion: message.version, idempotencyKey: key(`msg-read:${message.id}`) }),
  markAllAsRead: (context: ApiContext, recipientId: string) =>
    apiRequest<{ marked: number }>('/api/v1/message/messages/mark-all-read', context, { method: 'POST', idempotencyKey: key('msg-read-all'), body: JSON.stringify({ recipientId }) }),
  archiveMessage: (context: ApiContext, message: MessageRecordDto) =>
    apiRequest<{ message: MessageRecordDto }>(`/api/v1/message/messages/${message.id}/archive`, context, { method: 'POST', expectedVersion: message.version, idempotencyKey: key(`msg-archive:${message.id}`) }),
  starMessage: (context: ApiContext, message: MessageRecordDto, starred: boolean) =>
    apiRequest<{ message: MessageRecordDto }>(`/api/v1/message/messages/${message.id}/star`, context, { method: 'POST', expectedVersion: message.version, idempotencyKey: key(`msg-star:${message.id}`), body: JSON.stringify({ starred }) }),

  // ===== Preferences =====
  listPreferences: (context: ApiContext, userId: string) =>
    apiRequest<UserPreferenceDto[]>(`/api/v1/message/preferences?userId=${encodeURIComponent(userId)}`, context),
  updatePreference: (context: ApiContext, input: { category: string; channel: string; enabled?: boolean; minPriority?: string; quietHoursStart?: string; quietHoursEnd?: string }) =>
    apiRequest<{ preference: UserPreferenceDto }>('/api/v1/message/preferences', context, { method: 'PUT', idempotencyKey: key('pref-update'), body: JSON.stringify(input) }),

  // ===== Subscriptions =====
  listSubscriptions: (context: ApiContext, userId: string) =>
    apiRequest<SubscriptionDto[]>(`/api/v1/message/subscriptions?userId=${encodeURIComponent(userId)}`, context),
  createSubscription: (context: ApiContext, input: { eventType: string; category: string; enabled?: boolean }) =>
    apiRequest<{ subscription: SubscriptionDto }>('/api/v1/message/subscriptions', context, { method: 'POST', idempotencyKey: key('sub-create'), body: JSON.stringify(input) }),
  deleteSubscription: (context: ApiContext, subscription: SubscriptionDto) =>
    apiRequest<{ deleted: boolean }>(`/api/v1/message/subscriptions/${subscription.id}`, context, { method: 'DELETE', expectedVersion: subscription.version, idempotencyKey: key(`sub-delete:${subscription.id}`) }),

  // ===== Dashboard =====
  getDashboard: (context: ApiContext, recipientId?: string) =>
    apiRequest<MessageDashboardDto>(`/api/v1/message/dashboard${recipientId ? `?recipientId=${encodeURIComponent(recipientId)}` : ''}`, context),
};
