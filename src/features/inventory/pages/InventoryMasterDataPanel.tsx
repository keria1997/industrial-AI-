import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Box,
  Check,
  ChevronRight,
  Edit2,
  Eye,
  Factory,
  FilePlus,
  MapPin,
  Package,
  Plus,
  Search,
  Trash2,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import {
  getInventoryStockQueryRows,
  getWarehouseInventoryRows,
  isInventoryCodeAvailable,
  loadInventoryMasterData,
  normalizeInventoryCode,
  saveInventoryMasterData,
  type InventoryMasterData,
  type InventoryMaterial,
  type InventoryProduct,
  type InventoryStockFact,
  type InventoryStockQueryRow,
  type InventoryWarehouse,
} from '../model/inventoryMasterData';

type MasterTab = 'warehouses' | 'products' | 'materials';
type MasterEntity = 'warehouse' | 'product' | 'material';
type EditorMode = 'create' | 'edit' | 'view';

type EditorState = {
  entity: MasterEntity;
  mode: EditorMode;
  record: Record<string, string | number>;
};

type Props = {
  activeTab: MasterTab;
  tenantId?: string;
  stockData: InventoryStockFact[];
  selectedWarehouseId?: string;
  onSelectWarehouse: (warehouseId: string) => void;
  onToast: (message: string, type?: string) => void;
  onCreateProductionRequest: (row: InventoryStockQueryRow) => void;
  onCreatePurchaseRequest: (row: InventoryStockQueryRow & { procurementType?: string }) => void;
};

const entityLabels: Record<MasterEntity, string> = {
  warehouse: '仓库',
  product: '产品',
  material: '物料',
};

const nowText = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

const StatusPill = ({ value }: { value: string }) => {
  const enabled = value === '启用' || value === '正常' || value === '未入库';
  const classes = value === '未入库'
    ? 'border-slate-200 bg-slate-50 text-slate-600'
    : enabled
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : value === '低库存'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-bold ${classes}`}>{value}</span>;
};

const IconButton = ({ title, onClick, tone = 'slate', children }: {
  title: string;
  onClick: () => void;
  tone?: 'slate' | 'blue' | 'amber' | 'rose';
  children: React.ReactNode;
}) => {
  const classes = tone === 'blue'
    ? 'border-blue-200 text-blue-700 hover:bg-blue-50'
    : tone === 'amber'
      ? 'border-amber-200 text-amber-700 hover:bg-amber-50'
    : tone === 'rose'
      ? 'border-rose-200 text-rose-600 hover:bg-rose-50'
      : 'border-slate-200 text-slate-600 hover:bg-slate-50';
  return <button type="button" title={title} aria-label={title} onClick={onClick} className={`flex h-8 w-8 items-center justify-center rounded-md border transition-colors ${classes}`}>{children}</button>;
};

const MasterEditor = ({ state, data, onClose, onSave }: {
  state: EditorState;
  data: InventoryMasterData;
  onClose: () => void;
  onSave: (draft: Record<string, string | number>) => void;
}) => {
  const [draft, setDraft] = useState(state.record);
  const [error, setError] = useState('');
  const readOnly = state.mode === 'view';
  const editLocked = state.mode !== 'create';
  const warehouses = data.warehouses.filter((item) => item.status === '启用' || item.id === draft.defaultWarehouseId);
  const update = (key: string, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));

  const validate = () => {
    const code = normalizeInventoryCode(String(draft.id || ''));
    if (!/^[A-Z0-9][A-Z0-9.-]{1,39}$/.test(code)) return '请输入有效编码';
    if (!isInventoryCodeAvailable(data, code, editLocked ? String(state.record.id) : undefined)) return '编码已存在';
    if (!String(draft.name || '').trim()) return `请输入${entityLabels[state.entity]}名称`;
    if (state.entity === 'warehouse') {
      if (!String(draft.type || '') || !String(draft.organization || '') || !String(draft.manager || '') || !String(draft.address || '')) return '请填写完整的仓库类型、组织、负责人和地址';
      if (Number(draft.capacity) <= 0 || Number(draft.capacity) < Number(draft.usedCapacity || 0)) return '仓库容量必须大于已用容量';
      const duplicateName = data.warehouses.some((item) => item.id !== state.record.id && item.status === '启用' && item.name.trim() === String(draft.name).trim());
      if (duplicateName) return '仓库名称已存在';
    } else {
      if (!String(draft.specification || '').trim() || !String(draft.unit || '').trim()) return '请填写规格型号和基本单位';
      if (!String(draft.defaultWarehouseId || '')) return '请选择默认仓库';
      if (Number(draft.safetyStock) < 0) return '安全库存不能小于 0';
    }
    return '';
  };

  const submit = () => {
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    onSave({ ...draft, id: normalizeInventoryCode(String(draft.id)), name: String(draft.name).trim(), updatedAt: nowText() });
  };

  const fieldClass = (locked = false) => `h-10 w-full rounded-md border px-3 text-[13px] outline-none ${readOnly || locked ? 'border-slate-100 bg-slate-50 text-slate-600' : 'border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}`;
  const Field = ({ label, name, type = 'text', locked = false }: { label: string; name: string; type?: string; locked?: boolean }) => (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}</span>
      <input type={type} value={draft[name] ?? ''} readOnly={readOnly || locked} onChange={(event) => update(name, type === 'number' ? Number(event.target.value) : event.target.value)} className={fieldClass(locked)} />
    </label>
  );
  const Select = ({ label, name, options }: { label: string; name: string; options: string[] | Array<{ value: string; label: string }> }) => (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}</span>
      <select disabled={readOnly} value={String(draft[name] ?? '')} onChange={(event) => update(name, event.target.value)} className={fieldClass()}>
        <option value="">请选择</option>
        {options.map((option) => typeof option === 'string'
          ? <option key={option} value={option}>{option}</option>
          : <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="dialog" aria-modal="true" aria-label={`${state.mode === 'create' ? '新建' : state.mode === 'edit' ? '编辑' : '查看'}${entityLabels[state.entity]}`}>
      <div className="flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-[16px] font-bold text-slate-900">{state.mode === 'create' ? '新建' : state.mode === 'edit' ? '编辑' : '查看'}{entityLabels[state.entity]}</h3>
            <p className="mt-1 text-[12px] text-slate-500">{state.mode === 'create' ? '编码保存后不可修改' : String(state.record.id)}</p>
          </div>
          <IconButton title="关闭" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto px-6 py-5 sm:grid-cols-2">
          <Field label={`${entityLabels[state.entity]}编码`} name="id" locked={editLocked} />
          <Field label={`${entityLabels[state.entity]}名称`} name="name" />
          {state.entity === 'warehouse' ? <>
            <Select label="仓库类型" name="type" options={['原材料仓', '半成品仓', '成品仓', '线边仓', '中转仓']} />
            <Field label="所属组织" name="organization" />
            <Field label="负责人" name="manager" />
            <Field label="仓库地址" name="address" />
            <Field label="仓库容量" name="capacity" type="number" />
            <Field label="已用容量" name="usedCapacity" type="number" locked />
            <Select label="状态" name="status" options={['启用', '停用']} />
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-[12px] font-bold text-slate-600">备注</span><textarea readOnly={readOnly} value={String(draft.remark || '')} onChange={(event) => update('remark', event.target.value)} className={`${fieldClass()} min-h-20 py-2`} /></label>
          </> : <>
            <Field label="规格型号" name="specification" />
            {state.entity === 'product'
              ? <Select label="产品分类" name="category" options={['成品', '半成品']} />
              : <Select label="物料类型" name="materialType" options={['原材料', '辅料', '半成品', '包装材料']} />}
            <Field label="基本单位" name="unit" />
            <Select label="默认仓库" name="defaultWarehouseId" options={warehouses.map((item) => ({ value: item.id, label: `${item.name} (${item.id})` }))} />
            <Field label="安全库存" name="safetyStock" type="number" />
            {state.entity === 'product'
              ? <Select label="追溯方式" name="traceMode" options={['不追溯', '批次', '序列号']} />
              : <Select label="采购策略" name="procurementType" options={['外购', '自制', '委外']} />}
            <Select label="状态" name="status" options={['启用', '停用']} />
          </>}
          {error && <div className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700" role="alert">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 hover:bg-slate-100">{readOnly ? '关闭' : '取消'}</button>
          {!readOnly && <button type="button" onClick={submit} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-bold text-white hover:bg-blue-700"><Check size={15} />保存</button>}
        </div>
      </div>
    </div>
  );
};

const newRecord = (entity: MasterEntity): Record<string, string | number> => {
  if (entity === 'warehouse') return { id: '', name: '', type: '原材料仓', organization: '上海智造工厂', manager: '', address: '', capacity: 1000, usedCapacity: 0, status: '启用', remark: '', updatedAt: nowText() };
  if (entity === 'product') return { id: '', name: '', specification: '', category: '成品', unit: '台', defaultWarehouseId: '', safetyStock: 0, traceMode: '序列号', status: '启用', updatedAt: nowText() };
  return { id: '', name: '', specification: '', materialType: '原材料', unit: 'PCS', defaultWarehouseId: '', procurementType: '外购', safetyStock: 0, status: '启用', updatedAt: nowText() };
};

export const InventoryMasterDataPanel = ({ activeTab, tenantId, stockData, selectedWarehouseId, onSelectWarehouse, onToast, onCreateProductionRequest, onCreatePurchaseRequest }: Props) => {
  const [data, setData] = useState(() => loadInventoryMasterData(localStorage, tenantId));
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部');
  const [warehouseKind, setWarehouseKind] = useState('全部');
  const [editor, setEditor] = useState<EditorState | null>(null);

  useEffect(() => {
    setData(loadInventoryMasterData(localStorage, tenantId));
    setQuery('');
    setStatus('全部');
    setWarehouseKind('全部');
  }, [tenantId]);

  const commit = (next: InventoryMasterData) => {
    setData(next);
    saveInventoryMasterData(localStorage, tenantId, next);
  };
  const warehouseName = (id: string) => data.warehouses.find((item) => item.id === id)?.name || id;
  const selectedWarehouse = data.warehouses.find((item) => item.id === selectedWarehouseId);
  const warehouseRows = useMemo(() => selectedWarehouse ? getWarehouseInventoryRows(selectedWarehouse, data, stockData) : [], [selectedWarehouse, data, stockData]);
  const inventoryRows = useMemo(() => getInventoryStockQueryRows(data, stockData), [data, stockData]);
  const findInventoryRow = (kind: '产品' | '物料', id: string, warehouseId: string) =>
    inventoryRows.find((item) => item.kind === kind && item.id === id && item.warehouseId === warehouseId);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (...values: unknown[]) => !normalizedQuery || values.some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));
  const warehouses = data.warehouses.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.name, item.type, item.organization, item.manager, item.address));
  const products = data.products.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.name, item.specification, item.category, warehouseName(item.defaultWarehouseId)));
  const materials = data.materials.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.name, item.specification, item.materialType, item.procurementType, warehouseName(item.defaultWarehouseId)));
  const detailRows = warehouseRows.filter((item) => (warehouseKind === '全部' || item.kind === warehouseKind) && matches(item.id, item.name, item.specification, item.location));

  const saveRecord = (draft: Record<string, string | number>) => {
    if (!editor) return;
    const collection = editor.entity === 'warehouse' ? 'warehouses' : editor.entity === 'product' ? 'products' : 'materials';
    const rows = data[collection] as Array<Record<string, unknown>>;
    const exists = rows.some((item) => item.id === editor.record.id);
    const nextRows = exists ? rows.map((item) => item.id === editor.record.id ? draft : item) : [draft, ...rows];
    commit({ ...data, [collection]: nextRows } as InventoryMasterData);
    onToast(`${entityLabels[editor.entity]} ${draft.id} 已保存`, 'success');
    setEditor(null);
  };

  const deleteRecord = (entity: MasterEntity, id: string) => {
    const referenced = entity === 'warehouse'
      ? stockData.some((item) => item.warehouseId === id || data.warehouses.find((warehouse) => warehouse.id === id)?.name === item.warehouse)
        || data.products.some((item) => item.defaultWarehouseId === id) || data.materials.some((item) => item.defaultWarehouseId === id)
      : stockData.some((item) => item.id === id);
    if (referenced) {
      onToast(`当前${entityLabels[entity]}已被库存或主数据引用，不能删除，可编辑为停用`, 'warning');
      return;
    }
    const collection = entity === 'warehouse' ? 'warehouses' : entity === 'product' ? 'products' : 'materials';
    commit({ ...data, [collection]: (data[collection] as Array<{ id: string }>).filter((item) => item.id !== id) } as InventoryMasterData);
    onToast(`${entityLabels[entity]} ${id} 已删除`, 'success');
  };

  const openEditor = (entity: MasterEntity, mode: EditorMode, record?: InventoryWarehouse | InventoryProduct | InventoryMaterial) => setEditor({ entity, mode, record: (record ? { ...record } : newRecord(entity)) as Record<string, string | number> });
  const currentEntity: MasterEntity = activeTab === 'warehouses' ? 'warehouse' : activeTab === 'products' ? 'product' : 'material';

  if (selectedWarehouse) {
    const usedRate = Math.min(100, Math.round((selectedWarehouse.usedCapacity / selectedWarehouse.capacity) * 100));
    const productCount = warehouseRows.filter((item) => item.kind === '产品').length;
    const materialCount = warehouseRows.filter((item) => item.kind === '物料').length;
    return <div className="animate-in fade-in duration-200">
      {editor && <MasterEditor state={editor} data={data} onClose={() => setEditor(null)} onSave={saveRecord} />}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => onSelectWarehouse('')} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-700 hover:bg-slate-50"><ArrowLeft size={15} />返回仓库列表</button>
        <button type="button" onClick={() => openEditor('warehouse', 'edit', selectedWarehouse)} className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-[13px] font-bold text-blue-700 hover:bg-blue-100"><Edit2 size={15} />编辑仓库</button>
      </div>
      <section className="border-y border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-[19px] font-bold text-slate-900">{selectedWarehouse.name}</h2><StatusPill value={selectedWarehouse.status} /></div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-slate-500"><span className="font-mono">{selectedWarehouse.id}</span><span>{selectedWarehouse.type}</span><span>{selectedWarehouse.organization}</span><span className="inline-flex items-center gap-1"><MapPin size={12} />{selectedWarehouse.address}</span></div>
          </div>
          <div className="text-right"><div className="text-[12px] text-slate-500">负责人</div><div className="mt-1 text-[14px] font-bold text-slate-800">{selectedWarehouse.manager}</div></div>
        </div>
        <div className="mt-5 grid grid-cols-2 border-y border-slate-100 sm:grid-cols-4">
          {[['库容使用', `${usedRate}%`], ['产品种类', String(productCount)], ['物料种类', String(materialCount)], ['库存条目', String(warehouseRows.filter((item) => item.stockQty > 0).length)]].map(([label, value]) => <div key={label} className="border-r border-slate-100 px-4 py-3 last:border-r-0"><div className="text-[11px] text-slate-500">{label}</div><div className="mt-1 text-[18px] font-bold tabular-nums text-slate-900">{value}</div></div>)}
        </div>
      </section>
      <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div><h3 className="text-[15px] font-bold text-slate-900">库存内容</h3><p className="mt-1 text-[11px] text-slate-500">共 {detailRows.length} 项</p></div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-md border border-slate-200 bg-white p-0.5">{['全部', '产品', '物料'].map((item) => <button key={item} type="button" onClick={() => setWarehouseKind(item)} className={`h-8 rounded px-3 text-[12px] font-bold ${warehouseKind === item ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{item}</button>)}</div>
            <label className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编码、名称、库位" className="h-9 w-56 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[12px] outline-none focus:border-blue-500" /></label>
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1040px] text-left text-[12px]"><thead className="border-b border-slate-200 bg-white text-slate-500"><tr><th className="px-5 py-3">类型</th><th className="px-5 py-3">编码 / 名称</th><th className="px-5 py-3">规格 / 分类</th><th className="px-5 py-3">库位</th><th className="px-5 py-3 text-right">现有总量</th><th className="px-5 py-3 text-right">冻结/预留</th><th className="px-5 py-3 text-right">实际可用</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{detailRows.map((row) => { const actionRow = findInventoryRow(row.kind, row.id, row.warehouseId); return <tr key={`${row.kind}-${row.id}`} className="hover:bg-slate-50"><td className="px-5 py-3"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{row.kind}</span></td><td className="px-5 py-3"><div className="font-bold text-slate-900">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.id}</div></td><td className="px-5 py-3"><div className="text-slate-700">{row.specification}</div><div className="mt-0.5 text-[11px] text-slate-500">{row.category}</div></td><td className="px-5 py-3 font-mono text-slate-600">{row.location}</td><td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{row.stockQty} {row.unit}</td><td className="px-5 py-3 text-right font-bold tabular-nums text-rose-600">{row.lockQty}</td><td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{row.availQty}</td><td className="px-5 py-3"><StatusPill value={row.status} /></td><td className="px-5 py-3"><div className="flex justify-end gap-2"><IconButton title={`查看${row.kind}`} onClick={() => openEditor(row.kind === '产品' ? 'product' : 'material', 'view', row.kind === '产品' ? data.products.find((item) => item.id === row.id) : data.materials.find((item) => item.id === row.id))}><Eye size={14} /></IconButton>{actionRow && (row.kind === '产品' ? <IconButton title="补货申请" tone="blue" onClick={() => onCreateProductionRequest(actionRow)}><Factory size={14} /></IconButton> : <IconButton title="补货申请" tone="amber" onClick={() => onCreatePurchaseRequest({ ...actionRow, procurementType: data.materials.find((item) => item.id === row.id)?.procurementType })}><FilePlus size={14} /></IconButton>)}</div></td></tr>; })}{!detailRows.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-500">当前筛选下没有库存内容</td></tr>}</tbody></table></div>
      </section>
    </div>;
  }

  const titles = activeTab === 'warehouses'
    ? { title: '仓库资料', subtitle: `${data.warehouses.length} 个仓库`, icon: WarehouseIcon }
    : activeTab === 'products'
      ? { title: '产品资料', subtitle: `${data.products.length} 个产品`, icon: Package }
      : { title: '物料资料', subtitle: `${data.materials.length} 项物料`, icon: Box };
  const TitleIcon = titles.icon;

  return <section className="animate-in overflow-hidden rounded-lg border border-slate-200 bg-white fade-in duration-200">
    {editor && <MasterEditor state={editor} data={data} onClose={() => setEditor(null)} onSave={saveRecord} />}
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700"><TitleIcon size={17} /></div><div><h2 className="text-[15px] font-bold text-slate-900">{titles.title}</h2><p className="mt-0.5 text-[11px] text-slate-500">{titles.subtitle}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><label className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编码、名称或规格" className="h-9 w-56 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[12px] outline-none focus:border-blue-500" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500"><option>全部</option><option>启用</option><option>停用</option></select><button type="button" onClick={() => openEditor(currentEntity, 'create')} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12px] font-bold text-white hover:bg-blue-700"><Plus size={15} />新建{entityLabels[currentEntity]}</button></div>
    </div>
    <div className="overflow-x-auto">
      {activeTab === 'warehouses' && <table className="w-full min-w-[980px] text-left text-[12px]"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-5 py-3">仓库编码 / 名称</th><th className="px-5 py-3">类型</th><th className="px-5 py-3">组织 / 地址</th><th className="px-5 py-3">负责人</th><th className="px-5 py-3">库容使用</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{warehouses.map((row) => { const rate = Math.min(100, Math.round((row.usedCapacity / row.capacity) * 100)); return <tr key={row.id} className="hover:bg-slate-50"><td className="px-5 py-4"><button type="button" onClick={() => onSelectWarehouse(row.id)} className="text-left"><div className="font-bold text-blue-700 hover:underline">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.id}</div></button></td><td className="px-5 py-4"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{row.type}</span></td><td className="px-5 py-4"><div className="font-bold text-slate-700">{row.organization}</div><div className="mt-1 max-w-[320px] truncate text-[11px] text-slate-500">{row.address}</div></td><td className="px-5 py-4 text-slate-700">{row.manager}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${rate >= 85 ? 'bg-rose-500' : rate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${rate}%` }} /></div><span className="font-bold tabular-nums text-slate-700">{rate}%</span></div><div className="mt-1 text-[10px] text-slate-400">{row.usedCapacity} / {row.capacity}</div></td><td className="px-5 py-4"><StatusPill value={row.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton title="查看仓库库存" onClick={() => onSelectWarehouse(row.id)}><Eye size={14} /></IconButton><IconButton title="编辑仓库" tone="blue" onClick={() => openEditor('warehouse', 'edit', row)}><Edit2 size={14} /></IconButton><IconButton title="删除仓库" tone="rose" onClick={() => deleteRecord('warehouse', row.id)}><Trash2 size={14} /></IconButton><button type="button" title="进入仓库" aria-label="进入仓库" onClick={() => onSelectWarehouse(row.id)} className="flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">库存内容<ChevronRight size={13} /></button></div></td></tr>; })}{!warehouses.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">没有符合条件的仓库</td></tr>}</tbody></table>}
      {activeTab === 'products' && <table className="w-full min-w-[1080px] text-left text-[12px]"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-5 py-3">产品编码 / 名称</th><th className="px-5 py-3">规格型号</th><th className="px-5 py-3">分类 / 单位</th><th className="px-5 py-3">默认仓库</th><th className="px-5 py-3 text-right">实际可用</th><th className="px-5 py-3">安全库存</th><th className="px-5 py-3">追溯方式</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{products.map((row) => { const actionRow = findInventoryRow('产品', row.id, row.defaultWarehouseId); return <tr key={row.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-bold text-slate-900">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.id}</div></td><td className="px-5 py-4 text-slate-700">{row.specification}</td><td className="px-5 py-4"><div className="font-bold text-slate-700">{row.category}</div><div className="mt-0.5 text-[11px] text-slate-500">{row.unit}</div></td><td className="px-5 py-4"><button type="button" onClick={() => onSelectWarehouse(row.defaultWarehouseId)} className="font-bold text-blue-700 hover:underline">{warehouseName(row.defaultWarehouseId)}</button></td><td className="px-5 py-4 text-right font-bold tabular-nums text-emerald-700">{actionRow ? <span>{actionRow.availQty} <span className="text-[10px] font-medium text-slate-400">{row.unit}</span></span> : <span className="text-slate-400">-</span>}</td><td className="px-5 py-4 font-bold tabular-nums text-slate-800">{row.safetyStock} {row.unit}</td><td className="px-5 py-4 text-slate-700">{row.traceMode}</td><td className="px-5 py-4"><StatusPill value={row.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton title="查看产品" onClick={() => openEditor('product', 'view', row)}><Eye size={14} /></IconButton>{row.status === '启用' && actionRow && <IconButton title="补货申请" tone="blue" onClick={() => onCreateProductionRequest(actionRow)}><Factory size={14} /></IconButton>}<IconButton title="编辑产品" tone="blue" onClick={() => openEditor('product', 'edit', row)}><Edit2 size={14} /></IconButton><IconButton title="删除产品" tone="rose" onClick={() => deleteRecord('product', row.id)}><Trash2 size={14} /></IconButton></div></td></tr>; })}{!products.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-500">没有符合条件的产品</td></tr>}</tbody></table>}
      {activeTab === 'materials' && <table className="w-full min-w-[1040px] text-left text-[12px]"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-5 py-3">物料编码 / 名称</th><th className="px-5 py-3">规格型号</th><th className="px-5 py-3">类型 / 单位</th><th className="px-5 py-3">默认仓库</th><th className="px-5 py-3">采购策略</th><th className="px-5 py-3">安全库存</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{materials.map((row) => { const actionRow = findInventoryRow('物料', row.id, row.defaultWarehouseId); return <tr key={row.id} className="hover:bg-slate-50"><td className="px-5 py-4"><div className="font-bold text-slate-900">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.id}</div></td><td className="px-5 py-4 text-slate-700">{row.specification}</td><td className="px-5 py-4"><div className="font-bold text-slate-700">{row.materialType}</div><div className="mt-0.5 text-[11px] text-slate-500">{row.unit}</div></td><td className="px-5 py-4"><button type="button" onClick={() => onSelectWarehouse(row.defaultWarehouseId)} className="font-bold text-blue-700 hover:underline">{warehouseName(row.defaultWarehouseId)}</button></td><td className="px-5 py-4 text-slate-700">{row.procurementType}</td><td className="px-5 py-4 font-bold tabular-nums text-slate-800">{row.safetyStock} {row.unit}</td><td className="px-5 py-4"><StatusPill value={row.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton title="查看物料" onClick={() => openEditor('material', 'view', row)}><Eye size={14} /></IconButton>{row.status === '启用' && row.procurementType !== '自制' && actionRow && <IconButton title="补货申请" tone="amber" onClick={() => onCreatePurchaseRequest({ ...actionRow, procurementType: row.procurementType })}><FilePlus size={14} /></IconButton>}<IconButton title="编辑物料" tone="blue" onClick={() => openEditor('material', 'edit', row)}><Edit2 size={14} /></IconButton><IconButton title="删除物料" tone="rose" onClick={() => deleteRecord('material', row.id)}><Trash2 size={14} /></IconButton></div></td></tr>; })}{!materials.length && <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">没有符合条件的物料</td></tr>}</tbody></table>}
    </div>
  </section>;
};
