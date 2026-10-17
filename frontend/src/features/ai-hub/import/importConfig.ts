export type ImportEntityType = 'warehouse' | 'product' | 'material' | 'inventoryFact';

export type ImportFieldDef = {
  field: string;
  label: string;
  required: boolean;
  aliases: string[];
};

export type EntityImportConfig = {
  entityType: ImportEntityType;
  label: string;
  fields: ImportFieldDef[];
};

const warehouseConfig: EntityImportConfig = {
  entityType: 'warehouse',
  label: '仓库',
  fields: [
    { field: 'code', label: '仓库编码', required: true, aliases: ['仓库编码', '编码', 'code', '仓库代码'] },
    { field: 'name', label: '仓库名称', required: true, aliases: ['仓库名称', '名称', 'name', '仓库'] },
    { field: 'type', label: '仓库类型', required: false, aliases: ['仓库类型', '类型', 'type'] },
    { field: 'address', label: '地址', required: false, aliases: ['地址', 'address', '仓库地址'] },
    { field: 'manager', label: '负责人', required: false, aliases: ['负责人', 'manager', '管理员'] },
    { field: 'phone', label: '联系电话', required: false, aliases: ['联系电话', 'phone', '电话'] },
    { field: 'remark', label: '备注', required: false, aliases: ['备注', 'remark', '说明'] },
  ],
};

const productConfig: EntityImportConfig = {
  entityType: 'product',
  label: '产品',
  fields: [
    { field: 'code', label: '产品编码', required: true, aliases: ['产品编码', '编码', 'code', '产品代码'] },
    { field: 'name', label: '产品名称', required: true, aliases: ['产品名称', '名称', 'name', '产品'] },
    { field: 'specification', label: '规格型号', required: false, aliases: ['规格型号', '规格', 'specification', 'spec'] },
    { field: 'category', label: '分类', required: false, aliases: ['分类', 'category', '类别', '产品分类'] },
    { field: 'uom', label: '单位', required: false, aliases: ['单位', 'uom', '计量单位'] },
    { field: 'safetyStockQty', label: '安全库存', required: false, aliases: ['安全库存', 'safetyStockQty', '安全库存量'] },
    { field: 'maxStockQty', label: '最大库存', required: false, aliases: ['最大库存', 'maxStockQty', '最大库存量'] },
    { field: 'productType', label: '产品类型', required: false, aliases: ['产品类型', 'productType', '类型'] },
    { field: 'defaultWarehouseId', label: '库存仓库ID', required: false, aliases: ['库存仓库ID', 'defaultWarehouseId', '仓库ID'] },
    { field: 'remark', label: '备注', required: false, aliases: ['备注', 'remark', '说明'] },
  ],
};

const materialConfig: EntityImportConfig = {
  entityType: 'material',
  label: '物料',
  fields: [
    { field: 'code', label: '物料编码', required: true, aliases: ['物料编码', '编码', 'code', '物料代码'] },
    { field: 'name', label: '物料名称', required: true, aliases: ['物料名称', '名称', 'name', '物料'] },
    { field: 'specification', label: '规格型号', required: false, aliases: ['规格型号', '规格', 'specification', 'spec'] },
    { field: 'category', label: '分类', required: false, aliases: ['分类', 'category', '类别', '物料分类'] },
    { field: 'uom', label: '单位', required: false, aliases: ['单位', 'uom', '计量单位'] },
    { field: 'safetyStockQty', label: '安全库存', required: false, aliases: ['安全库存', 'safetyStockQty', '安全库存量'] },
    { field: 'maxStockQty', label: '最大库存', required: false, aliases: ['最大库存', 'maxStockQty', '最大库存量'] },
    { field: 'materialType', label: '物料类型', required: false, aliases: ['物料类型', 'materialType', '类型', '采购类型'] },
    { field: 'defaultWarehouseId', label: '库存仓库ID', required: true, aliases: ['库存仓库ID', 'defaultWarehouseId', '仓库ID'] },
    { field: 'remark', label: '备注', required: false, aliases: ['备注', 'remark', '说明'] },
  ],
};

const importConfigs: EntityImportConfig[] = [warehouseConfig, productConfig, materialConfig];

const inventoryFactConfig: EntityImportConfig = {
  entityType: 'inventoryFact',
  label: 'WMS库存快照',
  fields: [
    { field: 'warehouseId', label: '仓库', required: true, aliases: ['仓库编码', '仓库ID', 'warehouseId', '仓库'] },
    { field: 'productId', label: '产品', required: true, aliases: ['产品编码', '产品ID', 'productId', '编码'] },
    { field: 'qualifiedOnHandQty', label: '合格现存量', required: true, aliases: ['合格现存量', '现存量', 'qualifiedOnHandQty'] },
    { field: 'allocatedReservedQty', label: '已预留', required: false, aliases: ['已预留', '预留量', 'allocatedReservedQty'] },
    { field: 'frozenQty', label: '冻结量', required: false, aliases: ['冻结量', '冻结', 'frozenQty'] },
    { field: 'safetyStockQty', label: '安全库存', required: false, aliases: ['安全库存', 'safetyStockQty'] },
    { field: 'inTransitQty', label: '在途量', required: false, aliases: ['在途量', '在途', 'inTransitQty'] },
    { field: 'fulfillableQty', label: '可履约量', required: true, aliases: ['可履约量', '可用量', 'fulfillableQty'] },
    { field: 'uom', label: '单位', required: true, aliases: ['单位', 'uom', '计量单位'] },
    { field: 'factVersion', label: '事实版本', required: true, aliases: ['事实版本', '版本', 'factVersion'] },
    { field: 'asOf', label: '快照时间', required: true, aliases: ['快照时间', '截止时间', 'asOf'] },
    { field: 'sourceSystem', label: '来源系统', required: false, aliases: ['来源系统', 'WMS系统', 'sourceSystem'] },
  ],
};

export const allImportConfigs: EntityImportConfig[] = [...importConfigs, inventoryFactConfig];

/** Attempts to map each system field to a CSV header by alias matching. */
export function suggestMapping(headers: string[], config: EntityImportConfig): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const fieldDef of config.fields) {
    const matched = headers.find(header =>
      fieldDef.aliases.some(alias => header.trim() === alias.trim() || header.trim().toLowerCase() === alias.toLowerCase())
    );
    if (matched) mapping[fieldDef.field] = matched;
  }
  return mapping;
}

export function validateRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
  config: EntityImportConfig,
): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  for (const fieldDef of config.fields) {
    if (!fieldDef.required) continue;
    const column = mapping[fieldDef.field];
    if (!column || !row[column]?.trim()) {
      errors.push({ field: fieldDef.field, message: `${fieldDef.label} 为必填项` });
    }
  }
  return errors;
}
