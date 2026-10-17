export type ProductionPage =
  | 'dashboard'
  | 'master'
  | 'calendar'
  | 'demand'
  | 'plan'
  | 'aps'
  | 'kitting'
  | 'orders'
  | 'report'
  | 'quality'
  | 'completion'
  | 'tasks';

export type FactoryId = 'FAC-SH-01' | 'FAC-SZ-01';
export type TaskStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'WAITING_CONFIRM';
export type CompletionStatus = 'POSTING' | 'POSTED' | 'FAILED';

export interface Demand {
  id: string;
  factory: FactoryId;
  source: string;
  product: string;
  qty: number;
  due: string;
  priority: '紧急' | '高' | '普通';
  status: '待评审' | '已批准' | '计划中' | '阻断';
  owner: string;
  correlationId: string;
}

export interface WorkOrder {
  id: string;
  factory: FactoryId;
  product: string;
  qty: number;
  good: number;
  posted: number;
  due: string;
  status: 'DRAFT' | 'SCHEDULED' | 'KITTING' | 'RELEASED' | 'IN_PROGRESS' | 'COMPLETED' | 'CLOSING' | 'CLOSED';
  kitting: 'READY' | 'PARTIAL' | 'SHORTAGE';
  progress: number;
  source: string;
  center: string;
}

export interface QualityTask {
  id: string;
  factory: FactoryId;
  order: string;
  product: string;
  pending: number;
  sample: number;
  passedSamples: number;
  failedSamples: number;
  defectCode: string;
  status: 'INSPECTING' | 'PASSED' | 'DISPOSITION_PENDING' | 'SCRAPPED';
  result: string;
}

export interface ProductionReport {
  id: string;
  factory: FactoryId;
  order: string;
  operation: string;
  batch: string;
  input: number;
  good: number;
  bad: number;
  scrap: number;
  hours: number;
  operator: string;
  status: 'DRAFT' | 'POSTED';
  time: string;
}

export interface Completion {
  id: string;
  factory: FactoryId;
  order: string;
  inspection: string;
  qty: number;
  warehouseResource: string;
  inventoryWarehouse: string;
  bin: string;
  traceMode: 'NONE' | 'BATCH' | 'SERIAL';
  traceValue: string;
  status: CompletionStatus;
  stockTx: string;
  time: string;
  allocation: { orderLine: string; qty: number }[];
}

export interface ProductionTask {
  id: string;
  factory: FactoryId;
  type: '完工入库' | 'MRP 运算' | 'APS 排程' | '齐套重检' | '库存预占' | 'FQC 处置';
  object: string;
  step: string;
  status: TaskStatus;
  retry: number;
  owner: string;
  trace: string;
  evidence: string;
}

export interface PrototypeState {
  demands: Demand[];
  orders: WorkOrder[];
  quality: QualityTask[];
  reports: ProductionReport[];
  completions: Completion[];
  tasks: ProductionTask[];
}

export const warehouseMappings = {
  'RES-WH-FG-01': {
    label: '成品一仓',
    inventoryWarehouse: 'WH-FG-01',
    bins: [
      { id: 'BIN-A-01-03', label: 'A-01-03', state: '可用' },
      { id: 'BIN-A-01-04', label: 'A-01-04', state: '可用' },
    ],
  },
  'RES-WH-FG-02': {
    label: '成品二仓',
    inventoryWarehouse: 'WH-FG-02',
    bins: [
      { id: 'BIN-C-03-01', label: 'C-03-01', state: '可用' },
      { id: 'BIN-C-03-02', label: 'C-03-02', state: '可用' },
    ],
  },
} as const;

export const demandSeed: Demand[] = [];

export const orderSeed: WorkOrder[] = [];

export const qualitySeed: QualityTask[] = [];

export const completionSeed: Completion[] = [];

export const taskSeed: ProductionTask[] = [];

export const initialPrototypeState: PrototypeState = {
  demands: demandSeed,
  orders: orderSeed,
  quality: qualitySeed,
  reports: [],
  completions: completionSeed,
  tasks: taskSeed,
};

export const productionStorageKey = (tenantId = 'TENANT-SHWS') => `industrial-ai-production-v2:${tenantId}`;

export const createTenantProductionState = (factory: FactoryId): PrototypeState => ({
  demands: initialPrototypeState.demands.filter((item) => item.factory === factory).map((item) => ({ ...item })),
  orders: initialPrototypeState.orders.filter((item) => item.factory === factory).map((item) => ({ ...item })),
  quality: initialPrototypeState.quality.filter((item) => item.factory === factory).map((item) => ({ ...item })),
  reports: initialPrototypeState.reports.filter((item) => item.factory === factory).map((item) => ({ ...item })),
  completions: initialPrototypeState.completions.filter((item) => item.factory === factory).map((item) => ({ ...item, allocation: item.allocation.map((allocation) => ({ ...allocation })) })),
  tasks: initialPrototypeState.tasks.filter((item) => item.factory === factory).map((item) => ({ ...item })),
});

export const loadTenantProductionState = (tenantId: string, factory: FactoryId): PrototypeState => {
  if (typeof window === 'undefined') return createTenantProductionState(factory);
  try {
    const saved = window.sessionStorage.getItem(productionStorageKey(tenantId));
    if (!saved) return createTenantProductionState(factory);
    const value = JSON.parse(saved) as Partial<PrototypeState>;
    const scopedState = {
      demands: (value.demands || []).filter((item) => item.factory === factory),
      orders: (value.orders || []).filter((item) => item.factory === factory),
      quality: (value.quality || []).filter((item) => item.factory === factory),
      reports: (value.reports || []).filter((item) => item.factory === factory),
      completions: (value.completions || []).filter((item) => item.factory === factory),
      tasks: (value.tasks || []).filter((item) => item.factory === factory),
    };
    const scopedRecordCount = Object.values(scopedState).reduce((total, items) => total + items.length, 0);
    return scopedRecordCount === 0 ? createTenantProductionState(factory) : scopedState;
  } catch {
    return createTenantProductionState(factory);
  }
};

export const saveTenantProductionState = (tenantId: string, state: PrototypeState) => {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(productionStorageKey(tenantId), JSON.stringify(state));
};

export const makeId = (prefix: string) => `${prefix}-${Date.now().toString().slice(-8)}`;

export const parseSerials = (value: string) => value
  .split(/[\n,，;；\s]+/)
  .map(item => item.trim())
  .filter(Boolean);
