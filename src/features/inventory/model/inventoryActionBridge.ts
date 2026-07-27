import type { InventoryStockQueryRow } from './inventoryMasterData';

export type InventoryProductionRequest = {
  id: string;
  sourceKey: string;
  productId: string;
  productName: string;
  warehouseId: string;
  availableQty: number;
  safetyStock: number;
  requestedQty: number;
  unit: string;
  requiredDate: string;
  priority: string;
  mpsId: string;
  status: '已生成MPS';
  createdAt: string;
  createdBy: string;
};

export type InventoryPurchaseRequest = {
  id: string;
  sourceKey: string;
  materialId: string;
  materialName: string;
  warehouseId: string;
  availableQty: number;
  safetyStock: number;
  qty: number;
  unit: string;
  reqDate: string;
  procurementType: string;
  source: string;
  item: string;
  status: '待审批' | '已转订单' | '已关闭';
  applicant: string;
  createdAt: string;
  localRequest: true;
};

export type ProductionMaterialIssueTask = {
  id: string;
  sourceKey: string;
  type: '生产领料';
  source: string;
  jobId: string;
  operationName: string;
  productId: string;
  item: string;
  qty: number;
  unit: string;
  warehouse: string;
  targetWarehouse: string;
  date: string;
  status: '待出库' | '库存不足' | '已出库';
  operator: string;
  completedAt?: string;
};

type InventoryWorkflowState = {
  schemaVersion: 1;
  productionRequests: InventoryProductionRequest[];
  purchaseRequests: InventoryPurchaseRequest[];
  materialIssueTasks: ProductionMaterialIssueTask[];
};

type ReadStorage = Pick<Storage, 'getItem'>;
type WriteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export const inventoryWorkflowStorageKey = (tenantId?: string) =>
  `industrial-ai-inventory-workflow:v1:${tenantId || 'default'}`;

const emptyState = (): InventoryWorkflowState => ({
  schemaVersion: 1,
  productionRequests: [],
  purchaseRequests: [],
  materialIssueTasks: [],
});

const loadState = (storage: ReadStorage, tenantId?: string): InventoryWorkflowState => {
  try {
    const parsed = JSON.parse(storage.getItem(inventoryWorkflowStorageKey(tenantId)) || '') as Partial<InventoryWorkflowState>;
    if (parsed.schemaVersion !== 1) return emptyState();
    return {
      schemaVersion: 1,
      productionRequests: Array.isArray(parsed.productionRequests) ? parsed.productionRequests : [],
      purchaseRequests: Array.isArray(parsed.purchaseRequests) ? parsed.purchaseRequests : [],
      materialIssueTasks: Array.isArray(parsed.materialIssueTasks) ? parsed.materialIssueTasks : [],
    };
  } catch {
    return emptyState();
  }
};

const saveState = (storage: WriteStorage, tenantId: string | undefined, state: InventoryWorkflowState) =>
  storage.setItem(inventoryWorkflowStorageKey(tenantId), JSON.stringify(state));

const numericId = (now: number) => String(now).slice(-8);

export const suggestInventoryReplenishmentQty = (availableQty: number, safetyStock: number) =>
  Math.max(1, Math.ceil(Number(safetyStock || 0) - Number(availableQty || 0)));

const legacyProductionStorageKey = (tenantId?: string) =>
  `industrial-ai-production-legacy:${tenantId || 'TENANT-SHWS'}`;

export const createInventoryProductionPlan = (
  storage: WriteStorage,
  tenantId: string | undefined,
  row: Pick<InventoryStockQueryRow, 'id' | 'name' | 'warehouseId' | 'availQty' | 'safetyStock' | 'unit'>,
  input: { requestedQty: number; requiredDate: string; priority: string; actor: string },
  now = Date.now(),
) => {
  const state = loadState(storage, tenantId);
  const sourceKey = `${row.warehouseId}:${row.id}:${row.availQty}:${row.safetyStock}`;
  const existing = state.productionRequests.find((item) => item.sourceKey === sourceKey && item.status === '已生成MPS');
  if (existing) return { request: existing, created: false };

  const suffix = numericId(now);
  const requestId = `IPR-${suffix}`;
  const mpsId = `MPS-INV-${suffix}`;
  const createdAt = new Date(now).toISOString();
  const request: InventoryProductionRequest = {
    id: requestId,
    sourceKey,
    productId: row.id,
    productName: row.name,
    warehouseId: row.warehouseId,
    availableQty: Number(row.availQty),
    safetyStock: Number(row.safetyStock),
    requestedQty: Number(input.requestedQty),
    unit: row.unit,
    requiredDate: input.requiredDate,
    priority: input.priority,
    mpsId,
    status: '已生成MPS',
    createdAt,
    createdBy: input.actor,
  };
  saveState(storage, tenantId, { ...state, productionRequests: [request, ...state.productionRequests] });

  let legacy: Record<string, unknown> = {};
  try {
    legacy = JSON.parse(storage.getItem(legacyProductionStorageKey(tenantId)) || '{}') as Record<string, unknown>;
  } catch {
    legacy = {};
  }
  const mps = Array.isArray(legacy.mps) ? legacy.mps : [];
  if (!mps.some((item: { id?: string }) => item.id === mpsId)) {
    legacy.mps = [{
      id: mpsId,
      source: `库存补货 (${requestId})`,
      product: `${row.id} - ${row.name}`,
      quantity: request.requestedQty,
      unit: row.unit,
      date: input.requiredDate,
      status: '待展算',
      priority: input.priority,
      inventoryRequestId: requestId,
      sourceKey,
      warehouseId: row.warehouseId,
      availableQty: request.availableQty,
      safetyStock: request.safetyStock,
      createdBy: request.createdBy,
    }, ...mps];
    storage.setItem(legacyProductionStorageKey(tenantId), JSON.stringify(legacy));
  }
  return { request, created: true };
};

export const createInventoryPurchaseRequest = (
  storage: WriteStorage,
  tenantId: string | undefined,
  row: Pick<InventoryStockQueryRow, 'id' | 'name' | 'warehouseId' | 'availQty' | 'safetyStock' | 'unit'> & { procurementType?: string },
  input: { requestedQty: number; requiredDate: string; actor: string },
  now = Date.now(),
) => {
  if (row.procurementType === '自制') throw new Error('自制物料不能发起采购，请改为发起生产申请');
  const state = loadState(storage, tenantId);
  const sourceKey = `${row.warehouseId}:${row.id}:${row.availQty}:${row.safetyStock}`;
  const existing = state.purchaseRequests.find((item) => item.sourceKey === sourceKey && item.status !== '已关闭');
  if (existing) return { request: existing, created: false };

  const id = `PR-INV-${numericId(now)}`;
  const request: InventoryPurchaseRequest = {
    id,
    sourceKey,
    materialId: row.id,
    materialName: row.name,
    warehouseId: row.warehouseId,
    availableQty: Number(row.availQty),
    safetyStock: Number(row.safetyStock),
    qty: Number(input.requestedQty),
    unit: row.unit,
    reqDate: input.requiredDate,
    procurementType: row.procurementType || '外购',
    source: `库存补货 / ${row.warehouseId}`,
    item: `${row.name} (${row.id})`,
    status: '待审批',
    applicant: input.actor,
    createdAt: new Date(now).toISOString(),
    localRequest: true,
  };
  saveState(storage, tenantId, { ...state, purchaseRequests: [request, ...state.purchaseRequests] });
  return { request, created: true };
};

export const loadInventoryPurchaseRequests = (storage: ReadStorage, tenantId?: string) =>
  loadState(storage, tenantId).purchaseRequests;

export const updateInventoryPurchaseRequestStatus = (
  storage: WriteStorage,
  tenantId: string | undefined,
  requestId: string,
  status: InventoryPurchaseRequest['status'],
) => {
  const state = loadState(storage, tenantId);
  const current = state.purchaseRequests.find((item) => item.id === requestId);
  if (!current) return null;
  const updated = { ...current, status };
  saveState(storage, tenantId, {
    ...state,
    purchaseRequests: state.purchaseRequests.map((item) => item.id === requestId ? updated : item),
  });
  return updated;
};

export const createProductionMaterialIssueTask = (
  storage: WriteStorage,
  tenantId: string | undefined,
  input: {
    jobId: string;
    orderId: string;
    operationName: string;
    materialId: string;
    materialName: string;
    requestedQty: number;
    unit: string;
    warehouseId: string;
    targetWarehouse: string;
    actor: string;
  },
  now = Date.now(),
) => {
  const state = loadState(storage, tenantId);
  const sourceKey = `${input.jobId}:${input.materialId}`;
  const existing = state.materialIssueTasks.find((item) => item.sourceKey === sourceKey && item.status !== '已出库');
  if (existing) return { task: existing, created: false };
  const task: ProductionMaterialIssueTask = {
    id: `OUT-MI-${numericId(now)}`,
    sourceKey,
    type: '生产领料',
    source: input.orderId,
    jobId: input.jobId,
    operationName: input.operationName,
    productId: input.materialId,
    item: input.materialName,
    qty: Number(input.requestedQty),
    unit: input.unit,
    warehouse: input.warehouseId,
    targetWarehouse: input.targetWarehouse,
    date: new Date(now).toISOString().slice(0, 16).replace('T', ' '),
    status: '待出库',
    operator: input.actor,
  };
  saveState(storage, tenantId, { ...state, materialIssueTasks: [task, ...state.materialIssueTasks] });
  return { task, created: true };
};

export const loadProductionMaterialIssueTasks = (storage: ReadStorage, tenantId?: string) =>
  loadState(storage, tenantId).materialIssueTasks;

export const completeProductionMaterialIssueTask = (
  storage: WriteStorage,
  tenantId: string | undefined,
  taskId: string,
  now = Date.now(),
) => {
  const state = loadState(storage, tenantId);
  const current = state.materialIssueTasks.find((item) => item.id === taskId);
  if (!current) return null;
  if (current.status === '已出库') return current;
  const completed = { ...current, status: '已出库' as const, completedAt: new Date(now).toISOString() };
  saveState(storage, tenantId, {
    ...state,
    materialIssueTasks: state.materialIssueTasks.map((item) => item.id === taskId ? completed : item),
  });
  return completed;
};

export const markProductionMaterialIssueTaskShortage = (
  storage: WriteStorage,
  tenantId: string | undefined,
  taskId: string,
) => {
  const state = loadState(storage, tenantId);
  const current = state.materialIssueTasks.find((item) => item.id === taskId);
  if (!current || current.status === '已出库') return current || null;
  const updated = { ...current, status: '库存不足' as const };
  saveState(storage, tenantId, {
    ...state,
    materialIssueTasks: state.materialIssueTasks.map((item) => item.id === taskId ? updated : item),
  });
  return updated;
};
