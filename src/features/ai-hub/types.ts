import type { LucideIcon } from 'lucide-react';

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
}

export interface QuickPrompt {
  id: string;
  label: string;
  intent: 'query' | 'action' | 'prediction';
}

export type DomainId = 'all' | 'inventory' | 'sales' | 'production' | 'procurement';

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

export const defaultConfigCards: Omit<AssistantConfigCard, 'icon'>[] = [
  {
    title: '助手身份',
    value: 'AI 工业助手',
    desc: '面向销售、生产、库存、采购、财务的跨模块业务问答与分析。',
    tone: 'blue',
  },
  {
    title: '知识范围',
    value: 'ERP / MES / WMS / 财务',
    desc: '已接入订单、BOM、工单、库存流水、PR/PO、AR/AP 数据。',
    tone: 'emerald',
  },
  {
    title: '执行权限',
    value: '建议 + 草稿',
    desc: '可生成分析、预警、单据草稿；关键业务动作需人工确认。',
    tone: 'amber',
  },
  {
    title: '响应模式',
    value: '实时分析',
    desc: '支持自然语言查询、异常归因、趋势预测、任务派发建议。',
    tone: 'purple',
  },
];

export const defaultSkills: AssistantSkill[] = [
  { id: 'production-attribution', label: '生产异常归因', enabled: true },
  { id: 'material-shortage', label: '缺料风险推演', enabled: true },
  { id: 'inventory-aging', label: '库存账龄分析', enabled: true },
  { id: 'procurement-alert', label: '采购交期预警', enabled: true },
  { id: 'ar-ap-reconciliation', label: '应收应付对账', enabled: false },
  { id: 'sales-order-tracking', label: '销售订单跟进', enabled: true },
];

export const defaultKnowledgeSources: KnowledgeSource[] = [
  { id: 'sales', name: '销售订单与客户档案', status: 'synced', rows: '2.4万', lastSync: '2 分钟前' },
  { id: 'bom', name: 'BOM / MPS / MRP / 工单', status: 'synced', rows: '8,620', lastSync: '5 分钟前' },
  { id: 'inventory', name: '库存流水与安全水位', status: 'realtime', rows: '12.8万', lastSync: '实时' },
  { id: 'procurement', name: '采购 PR/PO 与供应商绩效', status: 'synced', rows: '3.1万', lastSync: '3 分钟前' },
  { id: 'finance', name: '财务 AR/AP 与资金计划', status: 'realtime', rows: '1.7万', lastSync: '实时' },
];

export const defaultBasicSettings: AssistantBasicSetting[] = [
  { label: '默认称呼', value: '工业AI助手', editable: true },
  { label: '业务风格', value: '先诊断、再给建议、最后生成动作草稿', editable: true },
  { label: '回答深度', value: '展示依据数据与关联单据', editable: true },
  { label: '安全策略', value: '关键业务动作需人工确认', editable: true },
];

export const defaultQuickPrompts: QuickPrompt[] = [
  { id: 'low-stock', label: '查询低库存物料', intent: 'query' },
  { id: 'replenish-pr', label: '生成补货采购申请', intent: 'action' },
  { id: 'sales-forecast', label: '预测下月销量', intent: 'prediction' },
];

export const defaultDomainCategories: DomainCategory[] = [
  { id: 'all', label: '全部', features: [] },
  { id: 'inventory', label: '库存域', features: ['低库存物料查询', '缺料风险', '安全水位', '库存账龄', '呆滞料识别'] },
  { id: 'sales', label: '销售域', features: ['订单状态查询', '发货进度跟进', '待确认订单', '客户档案'] },
  { id: 'production', label: '生产域', features: ['工单状态', '排产计划', '报工进度', '完工入库', 'FQC检验通过率'] },
  { id: 'procurement', label: '采购域', features: ['PR/PO状态', '供应商交期预警', '到货跟踪', '延迟风险'] },
];

// ==========================================
// 默认配置数据 — 开发 AI 助手（管理侧）
// ==========================================

export const defaultModelProviders: ModelProvider[] = [
  { id: 'gpt4o', name: 'GPT-4o', model: 'gpt-4o-2024-08-06', status: 'active', apiKeyMasked: 'sk-****...****3a7f' },
  { id: 'claude35', name: 'Claude-3.5-Sonnet', model: 'claude-3-5-sonnet-20241022', status: 'standby', apiKeyMasked: 'sk-ant-****...****9b2c' },
];

export const defaultGatewayConfig: ModelGatewayConfig = {
  primaryProvider: 'gpt4o',
  fallbackProvider: 'claude35',
  temperature: 0.3,
  maxTokens: 2048,
  timeoutSeconds: 15,
  fallbackStrategy: '主模型超时 → 备用模型 → 规则引擎',
  providers: defaultModelProviders,
};

export const defaultGatewayItems: GatewayConfigItem[] = [
  { label: '主模型', value: 'GPT-4o', desc: '默认推理模型' },
  { label: '备用模型', value: 'Claude-3.5-Sonnet', desc: '主模型不可用时切换' },
  { label: 'Temperature', value: '0.3', desc: '偏确定性，适合业务场景' },
  { label: 'Max Tokens', value: '2048', desc: '单次回复最大 Token 数' },
  { label: '超时阈值', value: '15 秒', desc: '超时后自动切换备用模型' },
  { label: '降级策略', value: '主模型 → 备用模型 → 规则引擎', desc: '三级降级链路' },
];

export const defaultDigitalEmployees: DigitalEmployee[] = [
  {
    id: 'sales-specialist',
    name: '销售订单专员',
    role: '销售主管',
    enabled: true,
    skills: ['sales-order-tracking'],
    knowledgeSources: ['sales', 'inventory'],
    operationPermission: '仅查询',
    responseStyle: '先诊断、再给建议、最后生成动作草稿',
    tone: 'blue',
  },
  {
    id: 'warehouse-specialist',
    name: '仓库补货专员',
    role: '仓库主管',
    enabled: true,
    skills: ['material-shortage', 'inventory-aging'],
    knowledgeSources: ['inventory', 'bom', 'procurement'],
    operationPermission: '补货 PR 草稿',
    responseStyle: '先诊断、再给建议、最后生成动作草稿',
    tone: 'emerald',
  },
  {
    id: 'procurement-specialist',
    name: '采购跟单专员',
    role: '采购员',
    enabled: true,
    skills: ['procurement-alert'],
    knowledgeSources: ['procurement', 'inventory'],
    operationPermission: '查询 + 预警',
    responseStyle: '先诊断、再给建议、最后生成动作草稿',
    tone: 'amber',
  },
];

export const defaultAuditMetrics: AuditMetrics = {
  todayConversations: 1247,
  conversationTrend: '+12%',
  todayOperations: 38,
  approvedCount: 23,
  pendingCount: 15,
  avgResponseTime: 1.8,
  responseTimeTrend: '-0.3s',
  degradationCount: 3,
  degradationDetail: '主模型超时 2 次',
};

export const defaultAuditLogs: AuditLogEntry[] = [
  { id: 'audit-1', time: '14:32', user: '仓库主管', action: '生成 3 笔采购申请', amount: '¥186,400', status: 'approved' },
  { id: 'audit-2', time: '14:15', user: '销售主管', action: '查询延期订单', status: 'query' },
  { id: 'audit-3', time: '13:48', user: '采购员', action: '生成补货方案', amount: '¥52,300', status: 'pending' },
  { id: 'audit-4', time: '13:20', user: '仓库主管', action: '查询低库存物料', status: 'query' },
  { id: 'audit-5', time: '12:55', user: '销售主管', action: '生成发货计划', amount: '¥89,200', status: 'approved' },
];

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
