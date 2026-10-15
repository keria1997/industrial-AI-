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

export const demandSeed: Demand[] = [
  { id: 'PD-260723-018', factory: 'FAC-SH-01', source: '销售缺货 / SO-260918-02', product: 'FG001 工业控制器', qty: 320, due: '07-28', priority: '紧急', status: '待评审', owner: '周计划 / E0182', correlationId: 'corr-so-260918-02' },
  { id: 'PD-260723-017', factory: 'FAC-SH-01', source: '安全库存补货', product: 'FG002 边缘网关', qty: 180, due: '08-02', priority: '普通', status: '已批准', owner: '陈敏 / E0096', correlationId: 'corr-stock-fg002-17' },
  { id: 'PD-260722-064', factory: 'FAC-SH-01', source: '销售订单 / SO-260902-01', product: 'FG001 工业控制器', qty: 500, due: '07-31', priority: '高', status: '计划中', owner: '周计划 / E0182', correlationId: 'corr-so-260902-01' },
  { id: 'PD-260722-061', factory: 'FAC-SZ-01', source: '预测补货', product: 'FG003 数据采集器', qty: 260, due: '08-08', priority: '普通', status: '阻断', owner: '李可 / E0215', correlationId: 'corr-forecast-fg003-61' },
  { id: 'PD-260723-021', factory: 'FAC-SZ-01', source: '销售订单 / SO-260911-06', product: 'FG005 无线采集终端', qty: 120, due: '08-05', priority: '高', status: '已批准', owner: '李可 / E0215', correlationId: 'corr-so-260911-06' },
];

export const orderSeed: WorkOrder[] = [
  { id: 'WO-260101', factory: 'FAC-SH-01', product: 'FG001 工业控制器', qty: 150, good: 120, posted: 80, due: '07-24 18:00', status: 'IN_PROGRESS', kitting: 'READY', progress: 80, source: 'PD-260722-064', center: 'ASSY-01' },
  { id: 'WO-260104', factory: 'FAC-SH-01', product: 'FG002 边缘网关', qty: 200, good: 200, posted: 120, due: '07-25 12:00', status: 'COMPLETED', kitting: 'READY', progress: 100, source: 'PD-260723-017', center: 'TEST-01' },
  { id: 'WO-260109', factory: 'FAC-SZ-01', product: 'FG003 数据采集器', qty: 260, good: 0, posted: 0, due: '07-29 18:00', status: 'KITTING', kitting: 'SHORTAGE', progress: 0, source: 'PD-260722-061', center: 'SMT-02' },
  { id: 'WO-260112', factory: 'FAC-SH-01', product: 'FG001 工业控制器', qty: 320, good: 0, posted: 0, due: '07-28 12:00', status: 'SCHEDULED', kitting: 'PARTIAL', progress: 0, source: 'PD-260723-018', center: 'SMT-01' },
  { id: 'WO-260118', factory: 'FAC-SZ-01', product: 'FG005 无线采集终端', qty: 120, good: 36, posted: 0, due: '08-05 18:00', status: 'IN_PROGRESS', kitting: 'READY', progress: 30, source: 'PD-260723-021', center: 'ASSY-02' },
];

export const qualitySeed: QualityTask[] = [
  { id: 'FQC-260801', factory: 'FAC-SH-01', order: 'WO-260101', product: 'FG001 工业控制器', pending: 40, sample: 20, passedSamples: 0, failedSamples: 0, defectCode: '', status: 'INSPECTING', result: '待录入检验结果' },
  { id: 'FQC-260806', factory: 'FAC-SH-01', order: 'WO-260104', product: 'FG002 边缘网关', pending: 80, sample: 32, passedSamples: 32, failedSamples: 0, defectCode: '', status: 'PASSED', result: '合格 80' },
  { id: 'FQC-260809', factory: 'FAC-SZ-01', order: 'WO-260097', product: 'FG003 数据采集器', pending: 16, sample: 16, passedSamples: 14, failedSamples: 2, defectCode: 'DEF-COS-02', status: 'DISPOSITION_PENDING', result: '不合格 2 · 待处置' },
];

export const completionSeed: Completion[] = [
  { id: 'CMP-260723-011', factory: 'FAC-SH-01', order: 'WO-260104', inspection: 'FQC-260805', qty: 120, warehouseResource: 'RES-WH-FG-01', inventoryWarehouse: 'WH-FG-01', bin: 'BIN-A-01-02', traceMode: 'BATCH', traceValue: 'FG002-260723-A', status: 'POSTED', stockTx: 'STK-IN-260723-8821', time: '10:42', allocation: [{ orderLine: 'SO-260902-01-L1', qty: 32 }] },
  { id: 'CMP-260723-010', factory: 'FAC-SH-01', order: 'WO-260101', inspection: 'FQC-260798', qty: 80, warehouseResource: 'RES-WH-FG-01', inventoryWarehouse: 'WH-FG-01', bin: 'BIN-A-01-03', traceMode: 'BATCH', traceValue: 'FG001-260723-A', status: 'POSTED', stockTx: 'STK-IN-260723-8796', time: '09:18', allocation: [{ orderLine: 'SO-260902-01-L1', qty: 80 }] },
  { id: 'CMP-260722-064', factory: 'FAC-SZ-01', order: 'WO-260088', inspection: 'FQC-260780', qty: 24, warehouseResource: 'RES-WH-FG-02', inventoryWarehouse: 'WH-FG-02', bin: 'BIN-C-03-01', traceMode: 'BATCH', traceValue: 'FG004-260722-C', status: 'FAILED', stockTx: '库存拒绝：库位冻结', time: '昨天 17:26', allocation: [] },
];

export const taskSeed: ProductionTask[] = [
  { id: 'TASK-78541', factory: 'FAC-SZ-01', type: '完工入库', object: 'CMP-260722-064', step: '库存明确拒绝', status: 'FAILED', retry: 1, owner: '仓库接口责任组', trace: 'tr-4d90be', evidence: '库存返回 REJECTED，原因 BIN_FROZEN；未增加库存、完工量或销售可履约量。' },
  { id: 'TASK-78538', factory: 'FAC-SH-01', type: 'MRP 运算', object: 'MRP-RUN-260723-08', step: '结果发布', status: 'SUCCEEDED', retry: 0, owner: '周计划 / E0182', trace: 'tr-7a130c', evidence: '输入快照 MPS-V12，算法版本 mrp-2.6.1，结果 4 行，失败 0 行。' },
  { id: 'TASK-78532', factory: 'FAC-SZ-01', type: '齐套重检', object: 'WO-260109', step: '等待采购到货', status: 'RUNNING', retry: 0, owner: '物料计划组', trace: 'tr-1260aa', evidence: 'RM201 尚缺 60 PCS；预计 07-25 10:00 到货后自动重检。' },
];

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
