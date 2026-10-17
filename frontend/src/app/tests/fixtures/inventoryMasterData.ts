import type { InventoryMasterData } from '../../../features/inventory/model/inventoryMasterData';

// Test-only records. Runtime modules must not import this fixture.
export const createInventoryMasterDataSeed = (): InventoryMasterData => ({
  schemaVersion: 1,
  warehouses: [
    { id: 'WH-RM-01', name: '一号原材料仓', type: '原材料仓' },
    { id: 'WH-FG-01', name: '成品主仓', type: '成品仓' },
    { id: 'WH-WIP-01', name: '线边暂存仓', type: '线边仓' },
    { id: 'WH-TR-01', name: '去化中转仓', type: '中转仓' },
  ].map((warehouse) => ({
    ...warehouse, organization: '测试工厂', manager: '', address: '', capacity: 1000,
    usedCapacity: 0, status: '启用', remark: '', updatedAt: '',
  })),
  products: [
    { id: 'FG001', name: '工业控制器顶配版', specification: 'IC-X900 / 32G / 双网口', unit: '台', unitPrice: 500, safetyStock: 600 },
    { id: 'FG002', name: '边缘计算网关Pro', specification: 'EG-420 / 8G / 4G', unit: '台', unitPrice: 1200, safetyStock: 120 },
    { id: 'FG003', name: '智能视觉检测终端', specification: 'VX-900', unit: '台', unitPrice: 3500, safetyStock: 50 },
    { id: 'FG004', name: '工业数据采集模块', specification: 'DAQ-100', unit: '套', unitPrice: 800, safetyStock: 30 },
  ].map((product) => ({
    ...product, category: '成品', defaultWarehouseId: 'WH-FG-01', traceMode: '序列号',
    status: '启用', updatedAt: '',
  })),
  materials: [
    { id: 'RM201', name: 'AI算力芯片', specification: 'AX-9000', materialType: '原材料', unit: 'PCS', unitPrice: 125, safetyStock: 800, defaultWarehouseId: 'WH-RM-01', procurementType: '外购' },
    { id: 'RM202', name: '12层空PCB板', specification: 'PCB-12L', materialType: '原材料', unit: 'PCS', unitPrice: 46, safetyStock: 300, defaultWarehouseId: 'WH-RM-01', procurementType: '外购' },
    { id: 'SA101', name: '核心主板组件', specification: 'MB-X9', materialType: '半成品', unit: '套', unitPrice: 860, safetyStock: 100, defaultWarehouseId: 'WH-WIP-01', procurementType: '自制' },
  ].map((material) => ({ ...material, status: '启用', updatedAt: '' })),
});
