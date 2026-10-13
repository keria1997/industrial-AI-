export const inventoryTabs = ['dashboard', 'stock', 'inbound', 'outbound', 'warehouses', 'products', 'materials'] as const;

export type InventoryTab = (typeof inventoryTabs)[number];

export type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export type SalesOutboundLine = {
  productId: string;
  productName: string;
  spec?: string;
  qty: number;
  unit: string;
  unitPrice?: number;
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

type SalesOutboundWorkspace = {
  schemaVersion: 1;
  tasks: SalesOutboundTask[];
};

const salesOutboundStorageKey = (tenantId?: string) =>
  `industrial-ai-inventory-sales-outbound:v1:${tenantId || 'default'}`;

const readWorkspace = (storage: StoragePort, tenantId?: string): SalesOutboundWorkspace => {
  try {
    const parsed = JSON.parse(storage.getItem(salesOutboundStorageKey(tenantId)) || '{}');
    return {
      schemaVersion: 1,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    };
  } catch {
    return { schemaVersion: 1, tasks: [] };
  }
};

const writeWorkspace = (storage: StoragePort, tenantId: string | undefined, tasks: SalesOutboundTask[]) => {
  storage.setItem(salesOutboundStorageKey(tenantId), JSON.stringify({ schemaVersion: 1, tasks }));
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

export const loadSalesOutboundTasks = (
  storage: StoragePort,
  tenantId?: string,
): SalesOutboundTask[] => readWorkspace(storage, tenantId).tasks;

export const requestSalesOutbound = (
  storage: StoragePort,
  tenantId: string | undefined,
  request: SalesOutboundRequest,
  now = new Date(),
): SalesOutboundTask => {
  const workspace = readWorkspace(storage, tenantId);
  const existing = workspace.tasks.find((task) => task.source === request.orderId && task.status !== '已出库');
  if (existing) return existing;

  const availableQty = Number(request.availableQty || 0);
  const shortageQty = Math.max(0, Number(request.qty) - availableQty);
  const task: SalesOutboundTask = {
    id: `OUT-SALES-${request.orderId.replace(/[^A-Z0-9]/gi, '')}`,
    type: '销售发货',
    source: request.orderId,
    customer: request.customer || '-',
    amount: request.amount,
    item: request.item,
    qty: Number(request.qty),
    unit: request.unit || '件',
    warehouse: request.warehouse || '成品主仓',
    productId: request.productId,
    dueDate: request.dueDate,
    sourceRevision: request.sourceRevision || 1,
    availableQty,
    shortageQty,
    lines: request.lines,
    date: now.toISOString(),
    status: shortageQty > 0 ? '库存不足' : '待发货',
    operator: request.operator || '待分配',
  };
  writeWorkspace(storage, tenantId, [task, ...workspace.tasks]);
  return task;
};

export const recordWarehouseProductionResult = (
  storage: StoragePort,
  tenantId: string | undefined,
  outboundId: string,
  result: WarehouseProductionResult,
): SalesOutboundTask | null => {
  const workspace = readWorkspace(storage, tenantId);
  const current = workspace.tasks.find((task) => task.id === outboundId);
  if (!current) return null;
  const updated: SalesOutboundTask = {
    ...current,
    ...result,
    status: result.shortageQty > 0 ? '生产申请中' : '待出库',
  };
  writeWorkspace(storage, tenantId, workspace.tasks.map((task) => task.id === outboundId ? updated : task));
  return updated;
};


export const cancelSalesOutbound = (
  storage: StoragePort,
  tenantId: string | undefined,
  sourceOrderId: string,
): SalesOutboundTask | null => {
  const workspace = readWorkspace(storage, tenantId);
  const current = workspace.tasks.find(
    (task) => task.source === sourceOrderId && task.status !== '已出库' && task.status !== '已取消',
  );
  if (!current) return null;
  const updated: SalesOutboundTask = {
    ...current,
    status: '已取消',
  };
  writeWorkspace(storage, tenantId, workspace.tasks.map((task) => (task.id === current.id ? updated : task)));
  return updated;
};

export const removeSalesOutboundBySource = (
  storage: StoragePort,
  tenantId: string | undefined,
  sourceOrderId: string,
): boolean => {
  const workspace = readWorkspace(storage, tenantId);
  const tasks = workspace.tasks.filter((task) => task.source !== sourceOrderId);
  if (tasks.length === workspace.tasks.length) return false;
  writeWorkspace(storage, tenantId, tasks);
  return true;
};

export const completeSalesOutbound = (
  storage: StoragePort,
  tenantId: string | undefined,
  outboundId: string,
  now = new Date(),
  operator = '当前仓库用户',
): SalesOutboundTask | null => {
  const workspace = readWorkspace(storage, tenantId);
  const current = workspace.tasks.find((task) => task.id === outboundId);
  if (!current || Number(current.shortageQty || 0) > 0 || current.status === '生产申请中') return null;
  const updated: SalesOutboundTask = {
    ...current,
    status: '已出库',
    shippedAt: now.toISOString(),
    operator,
  };
  writeWorkspace(storage, tenantId, workspace.tasks.map((task) => task.id === outboundId ? updated : task));
  return updated;
};
