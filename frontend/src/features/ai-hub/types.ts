import type { LucideIcon } from 'lucide-react';
import type { ActionPlanData } from '../../api/ai';

// ==========================================
// 工业 Copilot 助手（用户侧）类型定义
// ==========================================

export type AssistantTone = 'blue' | 'emerald' | 'amber' | 'purple';

export interface AssistantConfigCard {
  title: string;
  value: string;
  desc: string;
  icon: LucideIcon;
  tone: AssistantTone;
}

export interface AssistantSkill {
  id: string;
  label: string;
  enabled: boolean;
}

export interface KnowledgeSource {
  id: string;
  name: string;
  status: 'synced' | 'realtime';
  rows: string;
  lastSync?: string;
}

export interface AssistantBasicSetting {
  label: string;
  value: string;
  editable: boolean;
}

export type MessageRole = 'user' | 'assistant';

export interface AIActionPlan {
  id: string;
  title: string;
  scope: string;
  basis: string;
  approval: string;
  risk: 'low' | 'medium' | 'high';
  status: 'draft' | 'submitted';
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  time: string;
  action?: AIActionPlan;
  actionData?: ActionPlanData;
}

export interface QuickPrompt {
  id: string;
  label: string;
  intent: 'query' | 'action' | 'prediction';
}

export type DomainId = 'inventory' | 'sales' | 'production' | 'procurement';

export interface DomainCategory {
  id: DomainId;
  label: string;
  features: string[];
}

// ==========================================
// 开发 AI 助手（管理侧）类型定义
// ==========================================

// 模型网关
export interface ModelProvider {
  id: string;
  name: string;
  model: string;
  status: 'active' | 'standby';
  apiKeyMasked: string;
}

export interface ModelGatewayConfig {
  primaryProvider: string;
  fallbackProvider: string;
  temperature: number;
  maxTokens: number;
  timeoutSeconds: number;
  fallbackStrategy: string;
  providers: ModelProvider[];
}

export interface GatewayConfigItem {
  label: string;
  value: string;
  desc: string;
}

// AI 数字员工专员
export interface DigitalEmployee {
  id: string;
  name: string;
  role: string;
  enabled: boolean;
  skills: string[];
  knowledgeSources: string[];
  operationPermission: string;
  responseStyle: string;
  tone: AssistantTone;
}

export interface DigitalEmployeeDetail {
  name: string;
  role: string;
  operationPermission: string;
  responseStyle: string;
  skills: string[];
  knowledgeSources: string[];
}

// 审计与监控
export type AuditStatus = 'query' | 'pending' | 'approved' | 'rejected';

export interface AuditLogEntry {
  id: string;
  time: string;
  user: string;
  action: string;
  amount?: string;
  status: AuditStatus;
}

export interface AuditMetrics {
  todayConversations: number;
  conversationTrend: string;
  todayOperations: number;
  approvedCount: number;
  pendingCount: number;
  avgResponseTime: number;
  responseTimeTrend: string;
  degradationCount: number;
  degradationDetail: string;
}

// ==========================================
// 默认配置数据 — 工业 Copilot 助手
// ==========================================

export const defaultQuickPrompts: QuickPrompt[] = [
  { id: 'low-stock', label: '查询低库存物料', intent: 'query' },
  { id: 'replenish-pr', label: '生成补货采购申请', intent: 'action' },
  { id: 'sales-forecast', label: '预测下月销量', intent: 'prediction' },
];

export const defaultDomainCategories: DomainCategory[] = [
  { id: 'inventory', label: '库存域', features: ['低库存物料查询', '缺料风险', '安全水位', '库存账龄', '呆滞料识别'] },
  { id: 'sales', label: '销售域', features: ['订单状态查询', '发货进度跟进', '待确认订单', '客户档案'] },
  { id: 'production', label: '生产域', features: ['工单状态', '排产计划', '报工进度', '完工入库', 'FQC检验通过率'] },
  { id: 'procurement', label: '采购域', features: ['PR/PO状态', '供应商交期预警', '到货跟踪', '延迟风险'] },
];

// ==========================================
// 默认配置数据 — 开发 AI 助手（管理侧）
// ==========================================

// 色调映射
export const toneMap: Record<AssistantTone, { shell: string; icon: string }> = {
  blue: { shell: 'bg-blue-50 border-blue-100 text-blue-600', icon: 'text-blue-600' },
  emerald: { shell: 'bg-emerald-50 border-emerald-100 text-emerald-600', icon: 'text-emerald-600' },
  amber: { shell: 'bg-amber-50 border-amber-100 text-amber-600', icon: 'text-amber-600' },
  purple: { shell: 'bg-purple-50 border-purple-100 text-purple-600', icon: 'text-purple-600' },
};

// 审计状态标签映射
export const auditStatusMap: Record<AuditStatus, { label: string; className: string }> = {
  query: { label: '查询', className: 'text-slate-400' },
  pending: { label: '待审批', className: 'text-amber-600 font-semibold' },
  approved: { label: '已审批', className: 'text-emerald-600 font-semibold' },
  rejected: { label: '已拒绝', className: 'text-rose-600 font-semibold' },
};
