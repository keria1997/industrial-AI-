export const inventoryTabs = ['dashboard', 'stock', 'inbound', 'outbound', 'warehouses', 'products', 'materials'] as const;

export type InventoryTab = (typeof inventoryTabs)[number];

export type SalesOutboundLine = {
  productId: string;
  productName: string;
  spec?: string;
  qty: number;
  unit: string;
  unitPrice?: number;
  shippedQty?: number;
};

export type SalesOutboundTask = {
  id: string;
  type: '销售发货';
  source: string;
  customer: string;
  amount?: string;
  item: string;
  qty: number;
  unit: string;
  warehouse: string;
  productId?: string;
  dueDate?: string;
  sourceRevision?: number;
  availableQty?: number;
  shortageQty?: number;
  inventoryFactVersion?: number;
  intakeId?: string;
  productionDemandId?: string;
  productionDemandCode?: string;
  lines?: SalesOutboundLine[];
  date: string;
  status: '待发货' | '库存不足' | '生产申请中' | '待出库' | '已出库' | '已取消';
  operator: string;
  shippedAt?: string;
  shippedQty?: number;
};

export type SalesOutboundRequest = {
  orderId: string;
  customer?: string;
  amount?: string;
  item: string;
  qty: number;
  unit?: string;
  warehouse?: string;
  operator?: string;
  productId?: string;
  dueDate?: string;
  sourceRevision?: number;
  availableQty?: number;
  lines?: SalesOutboundLine[];
};

export type WarehouseProductionResult = {
  availableQty: number;
  shortageQty: number;
  inventoryFactVersion: number;
  intakeId: string;
  productionDemandId?: string;
  productionDemandCode?: string;
};

export const resolveInventoryTab = (search: string): InventoryTab => {
  const requestedTab = new URLSearchParams(search).get('inventory');
  return inventoryTabs.includes(requestedTab as InventoryTab)
    ? requestedTab as InventoryTab
    : 'dashboard';
};

export const resolveSalesOutboundOrderId = (search: string) =>
  new URLSearchParams(search).get('sourceOrder') || '';

export const resolveInventoryWarehouseId = (search: string) =>
  new URLSearchParams(search).get('warehouseId') || '';

export const createInventoryTabUrl = (
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  tab: InventoryTab,
) => {
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('module', 'inventory');
  searchParams.set('inventory', tab);
  searchParams.delete('tab');
  searchParams.delete('focusOrder');
  searchParams.delete('platform');
  searchParams.delete('production');
  if (tab !== 'outbound') searchParams.delete('sourceOrder');
  searchParams.delete('warehouseId');
  const search = searchParams.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
};

export const createInventoryWarehouseUrl = (
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  warehouseId: string,
) => {
  const baseUrl = new URL(createInventoryTabUrl(location, 'warehouses'), 'https://inventory.local');
  baseUrl.searchParams.set('warehouseId', warehouseId);
  return `${baseUrl.pathname}${baseUrl.search}${baseUrl.hash}`;
};

export const createSalesOutboundNavigationQuery = (orderId: string) => ({
  inventory: 'outbound',
  sourceOrder: orderId,
});

export const formatSalesOutboundDateTime = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
