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
  code?: string;
  serverVersion?: number;
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
  code?: string;
  serverVersion?: number;
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

export const createInventoryMasterDataSeed = (): InventoryMasterData => ({
  schemaVersion: 1,
  warehouses: [],
  products: [],
  materials: [],
});

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
    ...data.products.map((item) => item.code || item.id),
    ...data.materials.map((item) => item.code || item.id),
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
