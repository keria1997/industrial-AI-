import type { LucideIcon } from 'lucide-react';
import {
  BrainCircuit,
  Building,
  Factory,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  Network,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';

export const moduleIds = [
  'workbench',
  'sales',
  'inventory',
  'production',
  'procurement',
  'finance',
  'personnel',
  'supply-chain',
  'ai-hub',
  'analytics',
  'messages',
  'platform',
  'feedback',
] as const;

export type ModuleId = (typeof moduleIds)[number];

export const moduleLabels = [
  '工作台',
  '销售管理',
  '库存管理',
  '生产管理',
  '采购管理',
  '财务管理',
  '人员管理',
  '产业链管理',
  'AI智能中枢',
  'AI数据分析',
  '消息管理',
  '平台管理',
  '问题反馈',
] as const;

export type ModuleLabel = (typeof moduleLabels)[number];

export type AppModule = {
  id: ModuleId;
  label: ModuleLabel;
  icon: LucideIcon;
};

export const moduleRegistry: readonly AppModule[] = [
  { id: 'workbench', label: '工作台', icon: LayoutDashboard },
  { id: 'sales', label: '销售管理', icon: TrendingUp },
  { id: 'inventory', label: '库存管理', icon: Package },
  { id: 'production', label: '生产管理', icon: Factory },
  { id: 'procurement', label: '采购管理', icon: ShoppingCart },
  { id: 'finance', label: '财务管理', icon: Wallet },
  { id: 'personnel', label: '人员管理', icon: Users },
  { id: 'supply-chain', label: '产业链管理', icon: Network },
  { id: 'ai-hub', label: 'AI智能中枢', icon: Sparkles },
  { id: 'analytics', label: 'AI数据分析', icon: BrainCircuit },
  { id: 'messages', label: '消息管理', icon: MessageSquare },
  { id: 'platform', label: '平台管理', icon: Building },
  { id: 'feedback', label: '问题反馈', icon: MessageCircle },
];

export const roleNames = ['老板', '销售', '计划员', '采购', '仓管', '车间', '财务', '人事', '超级管理员'] as const;
export type RoleName = (typeof roleNames)[number];

const roleModuleAccess: Record<RoleName, readonly ModuleId[]> = {
  老板: ['workbench', 'ai-hub', 'analytics', 'sales', 'production', 'inventory', 'procurement', 'finance', 'personnel', 'supply-chain', 'messages', 'feedback'],
  销售: ['workbench', 'ai-hub', 'analytics', 'sales', 'inventory', 'finance', 'supply-chain', 'messages', 'feedback'],
  计划员: ['workbench', 'ai-hub', 'analytics', 'sales', 'production', 'inventory', 'procurement', 'supply-chain', 'messages', 'feedback'],
  采购: ['workbench', 'ai-hub', 'analytics', 'production', 'inventory', 'procurement', 'finance', 'supply-chain', 'messages', 'feedback'],
  仓管: ['workbench', 'ai-hub', 'production', 'inventory', 'procurement', 'messages', 'feedback'],
  车间: ['workbench', 'ai-hub', 'production', 'inventory', 'personnel', 'messages', 'feedback'],
  财务: ['workbench', 'ai-hub', 'analytics', 'sales', 'procurement', 'finance', 'messages', 'feedback'],
  人事: ['workbench', 'ai-hub', 'analytics', 'personnel', 'messages', 'feedback'],
  超级管理员: moduleIds,
};

export const defaultRole: RoleName = '老板';

export const isRoleName = (value: unknown): value is RoleName =>
  typeof value === 'string' && (roleNames as readonly string[]).includes(value);

export const findModuleById = (id: string | null | undefined) =>
  moduleRegistry.find((item) => item.id === id);

export const findModuleByLabel = (label: string | null | undefined) =>
  moduleRegistry.find((item) => item.label === label);

export const getModulesForRole = (role: string | null | undefined) => {
  if (!isRoleName(role)) return [];
  const allowedIds = new Set(roleModuleAccess[role]);
  return moduleRegistry.filter((item) => allowedIds.has(item.id));
};

export const canRoleAccessModule = (role: string | null | undefined, label: string) =>
  getModulesForRole(role).some((item) => item.label === label);
