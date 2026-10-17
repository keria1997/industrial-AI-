import { moduleRegistry, type ModuleId } from './moduleRegistry';

// Only effective permissions from the signed session / readiness response grant access.
// Role labels change presentation; they never grant a menu or command.
const readPermissions: Record<ModuleId, string[]> = {
  workbench: ['workbench.dashboard.read'],
  sales: ['sales.order.read', 'sales.fulfillment-trace.read', 'SALES_VIEW'],
  inventory: ['inventory.read', 'inventory.availability.read', 'inventory.product.read', 'inventory.material.read', 'inventory.warehouse.read', 'INV_VIEW'],
  production: ['production.mps.view', 'production.demand.read', 'production.work-order.read', 'PROD_VIEW'],
  procurement: ['procurement.pr.read', 'procurement.request.read', 'procurement.po.read', 'procurement.order.read', 'procurement.supplier.read', 'PUR_VIEW'],
  finance: ['finance.receivable.read', 'finance.payable.read', 'finance.ar.read', 'finance.ap.read', 'finance.payment.read', 'finance.cost.read', 'FIN_VIEW'],
  personnel: ['hr.employee.read', 'hr.skill.read', 'personnel.employee.read', 'personnel.read', 'HR_VIEW'],
  'supply-chain': ['sc.supplier.read', 'sc.customer.read', 'sc.risk.read', 'supply-chain.read', 'supply-chain.supplier.read', 'supply-chain.customer.read', 'CHAIN_VIEW'],
  'ai-hub': ['ai.hub.read', 'ai.config.read', 'AI_CENTER_VIEW'],
  analytics: ['ai.analysis.view', 'AI_ANALYSIS_VIEW'],
  messages: ['message.read', 'message.message.read', 'MSG_VIEW'],
  platform: ['platform.org.view', 'platform.account.manage', 'platform.read', 'platform.tenant.read', 'platform.account.read', 'platform.role.read', 'iam.role.manage', 'iam.scope.manage', 'PLATFORM_VIEW'],
  feedback: ['feedback.read', 'feedback.create'],
};

export function hasPermission(permissions: readonly string[] | undefined, ...codes: string[]) {
  return Boolean(permissions?.includes('*') || codes.some(code => permissions?.includes(code)));
}

export function getAuthorizedModules(permissions: readonly string[] | undefined) {
  return moduleRegistry.filter(module => hasPermission(permissions, ...readPermissions[module.id]));
}
