export type InventoryMasterStatus = '启用' | '停用';

export type InventoryWarehouse = {
  id: string;
  code?: string;
  serverId?: string;
  serverVersion?: number;
  name: string;
  type: string;
  organization: string;
  manager: string;
  phone?: string;
  address: string;
  capacity: number;
  usedCapacity: number;
  status: InventoryMasterStatus;
  remark: string;
  updatedAt: string;
};

export type InventoryProduct = {
  id: string;
  name: string;
  specification: string;
  category: string;
  unit: string;
  unitPrice: number;
  defaultWarehouseId: string;
  safetyStock: number;
  traceMode: string;
  status: InventoryMasterStatus;
  updatedAt: string;
};

export type InventoryMaterial = {
  id: string;
  name: string;
  specification: string;
  materialType: string;
  unit: string;
  unitPrice: number;
  defaultWarehouseId: string;
  procurementType: string;
  safetyStock: number;
  status: InventoryMasterStatus;
  updatedAt: string;
};

export type InventoryMasterData = {
  schemaVersion: 1;
  stockSource?: 'formal';
  warehouses: InventoryWarehouse[];
  products: InventoryProduct[];
  materials: InventoryMaterial[];
};

export type InventoryStockFact = {
  id: string;
  name: string;
  category: string;
  warehouseId?: string;
  warehouse: string;
  location: string;
  stockQty: number;
  lockQty: number;
  availQty: number;
  unit: string;
  status: string;
  kind?: string;
  specification?: string;
  unitPrice?: string | number;
  safetyStock?: number;
  factVersion?: number;
};

export type WarehouseInventoryRow = {
  id: string;
  kind: '产品' | '物料';
  name: string;
  specification: string;
  category: string;
  warehouseId: string;
  location: string;
  stockQty: number;
  lockQty: number;
  availQty: number;
  unitPrice: number;
  unit: string;
  status: string;
  hasStockFact?: boolean;
};

export type InventoryStockQueryKind = '全部' | '产品' | '物料';

export type InventoryStockQueryFilters = {
  warehouseId?: string;
  kind?: InventoryStockQueryKind;
  query?: string;
  status?: string;
};

export type InventoryStockQueryRow = WarehouseInventoryRow & {
  warehouse: string;
  safetyStock: number;
  hasStockFact: boolean;
};

const seedWarehouses: InventoryWarehouse[] = [
  {
    id: 'WH-RM-01', name: '一号原材料仓', type: '原材料仓', organization: '上海智造工厂',
    manager: '王仓管', address: '上海市浦东新区智造路 18 号 A 区', capacity: 8000, usedCapacity: 5260,
    status: '启用', remark: '电子料与关键原材料存储', updatedAt: '2026-07-26 09:20',
  },
  {
    id: 'WH-FG-01', name: '成品主仓', type: '成品仓', organization: '上海智造工厂',
    manager: '陈主管', address: '上海市浦东新区智造路 18 号 F 区', capacity: 12000, usedCapacity: 7350,
    status: '启用', remark: '销售发货与成品入库主仓', updatedAt: '2026-07-26 09:10',
  },
  {
    id: 'WH-WIP-01', name: '线边暂存仓', type: '线边仓', organization: '上海智造工厂',
    manager: '李班长', address: '上海市浦东新区智造路 18 号 2 号车间', capacity: 2000, usedCapacity: 1180,
    status: '启用', remark: '半成品和在制品短期周转', updatedAt: '2026-07-25 16:40',
  },
  {
    id: 'WH-TR-01', name: '去化中转仓', type: '中转仓', organization: '上海智造工厂',
    manager: '周调度', address: '上海市浦东新区智造路 18 号 T 区', capacity: 3000, usedCapacity: 360,
    status: '启用', remark: '调拨与呆滞库存去化', updatedAt: '2026-07-24 14:15',
  },
];

const seedProducts: InventoryProduct[] = [
  {
    id: 'FG001', name: '工业控制器顶配版', specification: 'IC-X900 / 32G / 双网口',
    category: '成品', unit: '台', defaultWarehouseId: 'WH-FG-01', safetyStock: 600,
    unitPrice: 500,
    traceMode: '序列号', status: '启用', updatedAt: '2026-07-26 10:00',
  },
  {
    id: 'FG002', name: '边缘计算网关Pro', specification: 'EG-420 / 8G / 4G',
    category: '成品', unit: '台', defaultWarehouseId: 'WH-FG-01', safetyStock: 120,
    unitPrice: 1200,
    traceMode: '序列号', status: '启用', updatedAt: '2026-07-25 15:30',
  },
  {
    id: 'FG003', name: '智能视觉检测终端', specification: 'VX-900 / 200万像素 / 千兆网',
    category: '成品', unit: '台', defaultWarehouseId: 'WH-FG-01', safetyStock: 50,
    unitPrice: 3500,
    traceMode: '序列号', status: '启用', updatedAt: '2026-07-25 16:00',
  },
  {
    id: 'FG004', name: '工业数据采集模块', specification: 'DAQ-100 / 16通道 / Modbus',
    category: '成品', unit: '套', defaultWarehouseId: 'WH-FG-01', safetyStock: 30,
    unitPrice: 800,
    traceMode: '批次', status: '启用', updatedAt: '2026-07-25 16:30',
  },
];

const seedMaterials: InventoryMaterial[] = [
  {
    id: 'RM201', name: 'AI算力芯片', specification: 'AX-9000 / 工业级', materialType: '原材料',
    unit: 'PCS', defaultWarehouseId: 'WH-RM-01', procurementType: '外购', safetyStock: 800,
    unitPrice: 125,
    status: '启用', updatedAt: '2026-07-26 10:05',
  },
  {
    id: 'RM202', name: '12层空PCB板', specification: 'PCB-12L / 180x120mm', materialType: '原材料',
    unit: 'PCS', defaultWarehouseId: 'WH-RM-01', procurementType: '外购', safetyStock: 300,
    unitPrice: 46,
    status: '启用', updatedAt: '2026-07-26 09:55',
  },
  {
    id: 'SA101', name: '核心主板组件', specification: 'MB-X9 / 已贴片', materialType: '半成品',
    unit: '套', defaultWarehouseId: 'WH-WIP-01', procurementType: '自制', safetyStock: 100,
    unitPrice: 860,
    status: '启用', updatedAt: '2026-07-25 17:20',
  },
];

export const createInventoryMasterDataSeed = (): InventoryMasterData => ({
  schemaVersion: 1,
  warehouses: seedWarehouses.map((item) => ({ ...item })),
  products: seedProducts.map((item) => ({ ...item })),
  materials: seedMaterials.map((item) => ({ ...item })),
});

const defaultProductPriceById = new Map(seedProducts.map((item) => [item.id, item.unitPrice]));
const defaultMaterialPriceById = new Map(seedMaterials.map((item) => [item.id, item.unitPrice]));

export const inventoryMasterDataStorageKey = (tenantId?: string) =>
  `industrial-ai-inventory-master-data:v1:${tenantId || 'default'}`;

export const loadInventoryMasterData = (
  storage: Pick<Storage, 'getItem'>,
  tenantId?: string,
): InventoryMasterData => {
  try {
    const raw = storage.getItem(inventoryMasterDataStorageKey(tenantId));
    if (!raw) return createInventoryMasterDataSeed();
    const parsed = JSON.parse(raw) as Partial<InventoryMasterData>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.warehouses)
      || !Array.isArray(parsed.products) || !Array.isArray(parsed.materials)) {
      return createInventoryMasterDataSeed();
    }
    return {
      ...parsed,
      products: parsed.products.map((item) => ({
        ...item,
        unitPrice: item.unitPrice == null
          ? defaultProductPriceById.get(item.id) || 0
          : Number(item.unitPrice),
      })),
      materials: parsed.materials.map((item) => ({
        ...item,
        unitPrice: item.unitPrice == null
          ? defaultMaterialPriceById.get(item.id) || 0
          : Number(item.unitPrice),
      })),
    } as InventoryMasterData;
  } catch {
    return createInventoryMasterDataSeed();
  }
};

export const saveInventoryMasterData = (
  storage: Pick<Storage, 'setItem'>,
  tenantId: string | undefined,
  data: InventoryMasterData,
) => storage.setItem(inventoryMasterDataStorageKey(tenantId), JSON.stringify(data));

export const normalizeInventoryCode = (value: string) => value.trim().toUpperCase();

export const isInventoryCodeAvailable = (
  data: InventoryMasterData,
  code: string,
  currentCode?: string,
) => {
  const normalized = normalizeInventoryCode(code);
  if (normalized === normalizeInventoryCode(currentCode || '')) return true;
  return ![
    ...data.warehouses.map((item) => item.id),
    ...data.products.map((item) => item.id),
    ...data.materials.map((item) => item.id),
  ].some((item) => normalizeInventoryCode(item) === normalized);
};

export const getWarehouseInventoryRows = (
  warehouse: InventoryWarehouse,
  data: InventoryMasterData,
  stockFacts: InventoryStockFact[],
): WarehouseInventoryRow[] => {
  const productById = new Map(data.products.map((item) => [item.id, item]));
  const materialById = new Map(data.materials.map((item) => [item.id, item]));
  const warehouseNames = new Map(data.warehouses.map((item) => [item.name, item.id]));
  const facts = stockFacts.filter((fact) =>
    [warehouse.id, warehouse.code, warehouse.serverId].filter(Boolean)
      .includes(fact.warehouseId || warehouseNames.get(fact.warehouse)));
  const rows = facts.map((fact) => {
    const product = productById.get(fact.id);
    const material = materialById.get(fact.id);
    return {
      id: fact.id,
      kind: fact.kind === '产品' || product ? '产品' as const : '物料' as const,
      name: fact.name,
      specification: fact.specification || product?.specification || material?.specification || '-',
      category: product?.category || material?.materialType || fact.category,
      warehouseId: warehouse.id,
      location: fact.location,
      stockQty: Number(fact.stockQty || 0),
      lockQty: Number(fact.lockQty || 0),
      availQty: Number(fact.availQty || 0),
      unitPrice: Number(fact.unitPrice ?? product?.unitPrice ?? material?.unitPrice ?? 0),
      unit: fact.unit,
      status: fact.status,
      hasStockFact: true,
    };
  });
  const existingIds = new Set(rows.map((item) => item.id));
  data.products.filter((item) => item.defaultWarehouseId === warehouse.id && !existingIds.has(item.id))
    .forEach((item) => rows.push({
      id: item.id, kind: '产品', name: item.name, specification: item.specification,
      category: item.category, warehouseId: warehouse.id, location: '-', stockQty: 0,
      lockQty: 0, availQty: 0, unitPrice: item.unitPrice, unit: item.unit,
      status: data.stockSource === 'formal' ? '未查询到库存记录' : '未入库', hasStockFact: false,
    }));
  data.materials.filter((item) => item.defaultWarehouseId === warehouse.id && !existingIds.has(item.id))
    .forEach((item) => rows.push({
      id: item.id, kind: '物料', name: item.name, specification: item.specification,
      category: item.materialType, warehouseId: warehouse.id, location: '-', stockQty: 0,
      lockQty: 0, availQty: 0, unitPrice: item.unitPrice, unit: item.unit,
      status: data.stockSource === 'formal' ? '未查询到库存记录' : '未入库', hasStockFact: false,
    }));
  return rows.sort((left, right) => left.id.localeCompare(right.id));
};

export const getInventoryStockQueryRows = (
  data: InventoryMasterData,
  stockFacts: InventoryStockFact[],
): InventoryStockQueryRow[] => {
  const productById = new Map(data.products.map((item) => [item.id, item]));
  const materialById = new Map(data.materials.map((item) => [item.id, item]));

  return data.warehouses.flatMap((warehouse) =>
    getWarehouseInventoryRows(warehouse, data, stockFacts).map((row) => {
      const master = row.kind === '产品' ? productById.get(row.id) : materialById.get(row.id);
      return {
        ...row,
        warehouse: warehouse.name,
        safetyStock: stockFacts.find(fact => fact.id === row.id
          && [warehouse.id, warehouse.code, warehouse.serverId, warehouse.name].filter(Boolean)
            .includes(fact.warehouseId || fact.warehouse))?.safetyStock ?? Number(master?.safetyStock || 0),
        hasStockFact: row.hasStockFact === true,
      };
    }),
  ).sort((left, right) => left.id.localeCompare(right.id) || left.warehouseId.localeCompare(right.warehouseId));
};

export const queryInventoryStock = (
  rows: InventoryStockQueryRow[],
  filters: InventoryStockQueryFilters,
) => {
  const query = filters.query?.trim().toLowerCase() || '';
  return rows.filter((row) => {
    if (filters.warehouseId && filters.warehouseId !== '全部' && row.warehouseId !== filters.warehouseId) return false;
    if (filters.kind && filters.kind !== '全部' && row.kind !== filters.kind) return false;
    if (filters.status && filters.status !== '全部' && row.status !== filters.status) return false;
    if (!query) return true;
    return [row.id, row.name, row.specification, row.category, row.warehouse, row.warehouseId, row.location]
      .some((value) => value.toLowerCase().includes(query));
  });
};
