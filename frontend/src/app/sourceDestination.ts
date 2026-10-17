import type { ModuleLabel } from './moduleRegistry';

type Source = { module?: string; category?: string; sourceType?: string; sourceId?: string | null };
export type SourceDestination = { module: ModuleLabel; query: Record<string, string> };

// Shared by messages and the workbench. A display number never substitutes for a stable ID.
export function sourceDestination(source: Source): SourceDestination | null {
  if (!source.sourceId || !source.sourceType) return null;
  const type = source.sourceType.toUpperCase().replace(/[.-]/g, '_');
  const id = source.sourceId;
  if (['SALES_ORDER', 'SALESORDER', 'ORDER'].includes(type)) return { module: '销售管理', query: { tab: 'orders', focusOrder: id } };
  if (['PURCHASE_REQUEST', 'PR', 'PROCUREMENT_REQUEST'].includes(type)) return { module: '采购管理', query: { procurement: 'pr', focusPr: id } };
  if (['PURCHASE_ORDER', 'PO', 'PROCUREMENT_ORDER'].includes(type)) return { module: '采购管理', query: { procurement: 'order', focusPo: id } };
  if (['PRODUCTION_DEMAND', 'DEMAND', 'MPS'].includes(type)) return { module: '生产管理', query: { production: 'mps', focusMps: id } };
  if (['WORK_ORDER', 'PRODUCTION_WORK_ORDER'].includes(type)) return { module: '生产管理', query: { production: 'orders', focusOrder: id } };
  if (['OUTBOUND', 'SHIPMENT_TASK', 'SHIPMENT', 'INVENTORY_OUTBOUND'].includes(type)) return { module: '库存管理', query: { inventory: 'outbound', focusOutbound: id } };
  if (['RECEIVABLE', 'AR'].includes(type)) return { module: '财务管理', query: { finance: 'receivable', focusAr: id } };
  if (['PAYABLE', 'AP'].includes(type)) return { module: '财务管理', query: { finance: 'payable', focusAp: id } };
  return null;
}
