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
  createInventoryMasterDataSeed,
  normalizeInventoryCode,
  type InventoryMasterData,
  type InventoryMaterial,
  type InventoryProduct,
  type InventoryStockFact,
  type InventoryStockQueryRow,
  type InventoryWarehouse,
} from '../model/inventoryMasterData';
import { inventoryApi, type ApiContext, type ProductDto, type WarehouseDto } from '../../../api/fulfillment';
import { normalizeNumericDraft, parseNumericDraft } from '../../../shared/numericDraft';
import { warehouseAssociation } from '../model/warehouseAssociation';

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
  apiContext?: ApiContext;
  onWarehousesChanged?: () => void;
  formalMasterData?: InventoryMasterData;
  stockStatus?: 'loading' | 'ready' | 'error';
  stockError?: string;
  onRefreshStock?: () => void;
};

const entityLabels: Record<MasterEntity, string> = {
  warehouse: '仓库',
  product: '产品',
  material: '物料',
};

const formatUnitPrice = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

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

type EditorControlProps = {
  label: string;
  name: string;
  draft: EditorState['record'];
  readOnly: boolean;
  locked?: boolean;
  showValidation?: boolean;
  onChange: (name: string, value: string | number) => void;
};

const editorFieldClass = (readOnly: boolean, locked = false) => `h-10 w-full rounded-md border px-3 text-[13px] outline-none ${readOnly || locked ? 'border-slate-100 bg-slate-50 text-slate-600' : 'border-slate-200 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-100'}`;

// Stable component identities preserve the input node, focus and selection on draft updates.
const MasterEditorField = ({ label, name, draft, readOnly, onChange, type = 'text', locked = false, showValidation = false }: EditorControlProps & { type?: string }) => {
  const invalid = showValidation && type === 'number' && !readOnly && !locked
    && parseNumericDraft(draft[name], { positive: name === 'capacity', fractionDigits: 6 }) === null;
  return <label className="block">
    <span className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}</span>
    <input type={type === 'number' ? 'text' : type} inputMode={type === 'number' ? 'decimal' : undefined}
      aria-label={label} value={draft[name] ?? ''} readOnly={readOnly || locked} aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `inventory-${name}-error` : undefined}
      onChange={(event) => onChange(name, event.target.value)} className={editorFieldClass(readOnly, locked)} />
    {invalid && <span id={`inventory-${name}-error`} className="mt-1 block text-[11px] text-rose-600">{label}须为{name === 'capacity' ? '大于 0' : '非负'}的数字，最多 6 位小数</span>}
  </label>;
};

const MasterEditorSelect = ({ label, name, draft, readOnly, onChange, options, locked = false, placeholder, placeholderDisabled = false }: EditorControlProps & { options: string[] | Array<{ value: string; label: string; disabled?: boolean }>; placeholder?: string; placeholderDisabled?: boolean }) => (
  <label className="block">
    <span className="mb-1.5 block text-[12px] font-bold text-slate-600">{label}</span>
    <select disabled={readOnly || locked} value={String(draft[name] ?? '')} onChange={(event) => onChange(name, event.target.value)} className={editorFieldClass(readOnly, locked)}>
      <option value="" disabled={placeholderDisabled}>{placeholder || (locked ? '未配置' : '请选择')}</option>
      {options.map((option) => typeof option === 'string'
        ? <option key={option} value={option}>{option}</option>
        : <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
  </label>
);

const MasterEditor = ({ state, data, sourceReady, sourceError, onRefreshSource, onClose, onSave }: {
  state: EditorState;
  data: InventoryMasterData;
  sourceReady: boolean;
  sourceError?: string;
  onRefreshSource?: () => void;
  onClose: () => void;
  onSave: (draft: Record<string, string | number>) => Promise<void>;
}) => {
  const [draft, setDraft] = useState(() => ({
    ...state.record,
    ...Object.fromEntries((state.entity === 'warehouse' ? ['capacity'] : ['unitPrice', 'safetyStock'])
      .map(field => [field, String(state.record[field] ?? '')])),
  }));
  const [error, setError] = useState('');
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);
  const readOnly = state.mode === 'view';
  const editLocked = state.mode !== 'create';
  const warehouses = data.warehouses.filter((item) => item.status === '启用'
    || [item.id, item.serverId].includes(String(draft.defaultWarehouseId || '')));
  const productWarehouseOptions = warehouses.map((item) => ({
    value: item.id,
    label: `${item.name} (${item.code || item.id})${item.status === '启用' ? '' : '（已停用）'}`,
    disabled: item.status !== '启用',
  }));
  if (draft.defaultWarehouseId
    && !productWarehouseOptions.some(item => item.value === draft.defaultWarehouseId)) {
    productWarehouseOptions.push({
      value: String(draft.defaultWarehouseId), label: `当前关联仓库（不可用）：${draft.defaultWarehouseId}`, disabled: true,
    });
  }
  const update = (key: string, value: string | number) => setDraft((current) => ({ ...current, [key]: value }));
  const controlProps = { draft, readOnly, onChange: update, showValidation };

  const validate = () => {
    const code = normalizeInventoryCode(String(draft.id || ''));
    if (!editLocked && !/^[A-Z0-9][A-Z0-9.-]{1,39}$/.test(code)) return '请输入有效编码';
    if (!editLocked && !isInventoryCodeAvailable(data, code)) return '编码已存在';
    if (!String(draft.name || '').trim()) return `请输入${entityLabels[state.entity]}名称`;
    if (state.entity === 'warehouse') {
      if (!String(draft.type || '') || !String(draft.organization || '') || !String(draft.manager || '') || !String(draft.address || '')) return '请填写完整的仓库类型、组织、负责人和地址';
      const capacity = parseNumericDraft(draft.capacity, { positive: true, fractionDigits: 6 });
      if (capacity === null) return '请输入大于 0 的仓库容量，最多保留 6 位小数';
      if (capacity < Number(draft.usedCapacity || 0)) return '仓库容量不能小于已用容量';
      const duplicateName = data.warehouses.some((item) => item.id !== state.record.id && item.status === '启用' && item.name.trim() === String(draft.name).trim());
      if (duplicateName) return '仓库名称已存在';
    } else {
      if (!String(draft.specification || '').trim() || !String(draft.unit || '').trim()) return '请填写规格型号和基本单位';
      if (parseNumericDraft(draft.unitPrice, { fractionDigits: 6 }) === null) return '请输入非负价格（可填写 0），最多保留 6 位小数';
      if (parseNumericDraft(draft.safetyStock, { fractionDigits: 6 }) === null) return '请输入非负安全库存（可填写 0），最多保留 6 位小数';
      try {
        warehouseAssociation(data.warehouses, String(draft.defaultWarehouseId || ''), String(state.record.defaultWarehouseId || ''),
          state.entity, state.mode === 'create');
      } catch (cause) { return cause instanceof Error ? cause.message : '请选择可用的库存仓库'; }
    }
    return '';
  };

  const submit = async () => {
    if (saving || !sourceReady) return;
    setShowValidation(true);
    const nextError = validate();
    if (nextError) {
      setError(nextError);
      return;
    }
    setSaving(true);
    try {
      const numericFields = state.entity === 'warehouse' ? ['capacity'] : ['unitPrice', 'safetyStock'];
      const normalized = Object.fromEntries(numericFields.map(field => [field, normalizeNumericDraft(draft[field], { fractionDigits: 6 })!]));
      await onSave({ ...draft, ...normalized, id: editLocked ? String(draft.id) : normalizeInventoryCode(String(draft.id)), name: String(draft.name).trim() });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败，请重试');
    } finally { setSaving(false); }
  };

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
          <MasterEditorField {...controlProps} label={`${entityLabels[state.entity]}编码`} name={editLocked && state.record.code ? 'code' : 'id'} locked={editLocked} />
          <MasterEditorField {...controlProps} label={`${entityLabels[state.entity]}名称`} name="name" />
          {state.entity === 'warehouse' ? <>
            <MasterEditorSelect {...controlProps} label="仓库类型" name="type" options={['原材料仓', '半成品仓', '成品仓', '线边仓', '中转仓']} />
            <MasterEditorField {...controlProps} label="所属组织" name="organization" />
            <MasterEditorField {...controlProps} label="负责人" name="manager" />
            <MasterEditorField {...controlProps} label="仓库地址" name="address" />
            <MasterEditorField {...controlProps} label="仓库容量" name="capacity" type="number" />
            <MasterEditorField {...controlProps} label="已用容量" name="usedCapacity" type="number" locked />
            <MasterEditorSelect {...controlProps} label="状态" name="status" options={['启用', '停用']} />
            <label className="block sm:col-span-2"><span className="mb-1.5 block text-[12px] font-bold text-slate-600">备注</span><textarea readOnly={readOnly} value={String(draft.remark || '')} onChange={(event) => update('remark', event.target.value)} className={`${editorFieldClass(readOnly)} min-h-20 py-2`} /></label>
          </> : <>
            <MasterEditorField {...controlProps} label="规格型号" name="specification" />
            {state.entity === 'product'
              ? <MasterEditorSelect {...controlProps} label="产品分类" name="category" options={['成品', '半成品']} />
              : <MasterEditorSelect {...controlProps} label="物料类型" name="materialType" options={['原材料', '辅料', '半成品', '包装材料']} />}
            <MasterEditorField {...controlProps} label="基本单位" name="unit" />
            <MasterEditorField {...controlProps} label="价格 (元)" name="unitPrice" type="number" />
            <div>
              <>
                <MasterEditorSelect {...controlProps} label="库存仓库" name="defaultWarehouseId"
                  options={productWarehouseOptions} placeholder={state.entity === 'material' ? '请选择库存仓库（必填）' : '暂不关联'}
                  placeholderDisabled={state.entity === 'material' || (state.mode !== 'create' && !!state.record.defaultWarehouseId)} />
                {!warehouses.some(item => item.status === '启用') && !readOnly
                  && <p className="mt-1.5 text-[12px] leading-5 text-slate-500">暂无可选仓库，{state.record.defaultWarehouseId ? '保留当前关联。' : state.entity === 'material' ? '请先配置授权仓库后再保存。' : '可暂不关联。'}</p>}
              </>
            </div>
            <MasterEditorField {...controlProps} label="安全库存" name="safetyStock" type="number" />
            {state.entity === 'product'
              ? <MasterEditorSelect {...controlProps} label="追溯方式" name="traceMode" locked options={['不追溯', '批次', '序列号']} />
              : <MasterEditorSelect {...controlProps} label="采购策略" name="procurementType" locked options={['外购', '自制', '委外']} />}
            <MasterEditorSelect {...controlProps} label="状态" name="status" locked={state.mode === 'create'} options={['启用', '停用']} />
          </>}
          {!sourceReady && <div className="sm:col-span-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800" role={sourceError ? 'alert' : 'status'}>
            {sourceError ? `${sourceError}。草稿已保留，重新加载成功后可保存。` : '正在刷新库存资料，草稿已保留，可继续填写，刷新完成后可保存。'}
            {sourceError && onRefreshSource && <button type="button" onClick={onRefreshSource} className="ml-3 font-bold text-blue-700">重新加载</button>}
          </div>}
          {error && <div className="sm:col-span-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] font-medium text-rose-700" role="alert">{error}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4">
          <button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 hover:bg-slate-100">{readOnly ? '关闭' : '取消'}</button>
          {!readOnly && <button type="button" disabled={saving || !sourceReady} onClick={submit} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[13px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"><Check size={15} />{saving ? '保存中' : '保存'}</button>}
        </div>
      </div>
    </div>
  );
};

const newRecord = (entity: MasterEntity): Record<string, string | number> => {
  if (entity === 'warehouse') return { id: '', name: '', type: '原材料仓', organization: '', manager: '', phone: '', address: '', capacity: '', usedCapacity: 0, status: '启用', remark: '' };
  if (entity === 'product') return { id: '', name: '', specification: '', category: '成品', unit: '', unitPrice: 0, defaultWarehouseId: '', safetyStock: 0, traceMode: '', status: '启用' };
  return { id: '', name: '', specification: '', materialType: '原材料', unit: '', unitPrice: 0, defaultWarehouseId: '', procurementType: '', safetyStock: 0, status: '启用' };
};

const warehouseStatusToServer = (value: string) => value === '启用' ? 'active' : 'inactive';
const mapWarehouseDto = (dto: WarehouseDto, local?: InventoryWarehouse): InventoryWarehouse => ({
  id: dto.code,
  code: dto.code,
  serverId: dto.id,
  serverVersion: dto.version,
  name: dto.name,
  type: dto.type,
  organization: dto.organization || '',
  manager: dto.manager || local?.manager || '',
  phone: dto.phone || local?.phone || '',
  address: dto.address || local?.address || '',
  capacity: Number(dto.capacity || 0),
  usedCapacity: Number(dto.usedCapacity || local?.usedCapacity || 0),
  status: dto.status === 'active' ? '启用' : '停用',
  remark: dto.remark || local?.remark || '',
  updatedAt: dto.updatedAt.slice(0, 16).replace('T', ' '),
});

export const InventoryMasterDataPanel = ({
  activeTab,
  tenantId,
  stockData,
  selectedWarehouseId,
  onSelectWarehouse,
  onToast,
  onCreateProductionRequest,
  onCreatePurchaseRequest,
  apiContext,
  onWarehousesChanged,
  formalMasterData,
  stockStatus,
  stockError,
  onRefreshStock,
}: Props) => {
  const data = formalMasterData || createInventoryMasterDataSeed();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部');
  const [warehouseKind, setWarehouseKind] = useState('全部');
  const [editor, setEditor] = useState<EditorState | null>(null);

  useEffect(() => {
    setEditor(null);
    setQuery('');
    setStatus('全部');
    setWarehouseKind('全部');
  }, [tenantId]);

  const commit = (next: InventoryMasterData) => {
    window.dispatchEvent(new CustomEvent('inventory-master-data-changed', { detail: { tenantId } }));
  };
  const warehouseName = (id: string) => data.warehouses.find((item) => item.id === id || item.serverId === id)?.name || id || '未配置';
  const selectedWarehouse = data.warehouses.find((item) =>
    item.id === selectedWarehouseId || item.serverId === selectedWarehouseId || item.code === selectedWarehouseId);
  const stockReady = !stockStatus || stockStatus === 'ready';
  const warehouseRows = useMemo(() => selectedWarehouse && stockReady ? getWarehouseInventoryRows(selectedWarehouse, data, stockData) : [], [selectedWarehouse, data, stockData, stockReady]);
  const inventoryRows = useMemo(() => stockReady ? getInventoryStockQueryRows(data, stockData) : [], [data, stockData, stockReady]);
  const findInventoryRow = (kind: '产品' | '物料', id: string, warehouseId: string) =>
    inventoryRows.find((item) => item.kind === kind && item.id === id && item.warehouseId === warehouseId);
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (...values: unknown[]) => !normalizedQuery || values.some((value) => String(value ?? '').toLowerCase().includes(normalizedQuery));
  const warehouses = data.warehouses.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.name, item.type, item.organization, item.manager, item.address));
  const products = data.products.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.code, item.name, item.specification, item.category, warehouseName(item.defaultWarehouseId)));
  const materials = data.materials.filter((item) => (status === '全部' || item.status === status) && matches(item.id, item.code, item.name, item.specification, item.materialType, item.procurementType, warehouseName(item.defaultWarehouseId)));
  const detailRows = warehouseRows.filter((item) => (warehouseKind === '全部' || item.kind === warehouseKind) && matches(item.id, item.name, item.specification, item.location));

  const warehouseApiPayload = (draft: Record<string, string | number>) => ({
    name: String(draft.name),
    type: String(draft.type),
    address: String(draft.address),
    manager: String(draft.manager),
    phone: String(draft.phone || ''),
    organization: String(draft.organization),
    capacity: String(draft.capacity),
    usedCapacity: String(draft.usedCapacity || 0),
    status: warehouseStatusToServer(String(draft.status)),
    remark: String(draft.remark || ''),
  });

  const saveRecord = async (draft: Record<string, string | number>) => {
    if (!editor) return;
    if (!apiContext) throw new Error('请登录后保存主数据');

    if (apiContext && editor.entity === 'warehouse') {
      try {
        if (editor.mode === 'create') {
          const created = await inventoryApi.createWarehouse(apiContext, {
            code: String(draft.id),
            ...warehouseApiPayload(draft),
          });
          commit({ ...data, warehouses: [mapWarehouseDto(created.warehouse), ...data.warehouses] });
          onWarehousesChanged?.();
        } else {
          const current = data.warehouses.find((item) => item.id === editor.record.id);
          if (!current?.serverId) throw new Error('仓库主数据未同步，请刷新后重试');
          const updated = await inventoryApi.updateWarehouse(apiContext, {
            id: current.serverId,
            code: current.code || current.id,
            name: current.name,
            type: current.type,
            address: current.address,
            manager: current.manager,
            phone: current.phone || '',
            status: warehouseStatusToServer(current.status),
            remark: current.remark,
            version: current.serverVersion || 1,
            createdAt: '',
            updatedAt: '',
          }, warehouseApiPayload(draft));
          commit({
            ...data,
            warehouses: data.warehouses.map((item) => item.id === editor.record.id ? mapWarehouseDto(updated.warehouse, item) : item),
          });
          onWarehousesChanged?.();
        }
        onToast(`仓库 ${draft.id} 已保存到服务端`, 'success');
        setEditor(null);
        return;
      } catch (error) {
        throw error;
      }
    }

    const input = {
      name: String(draft.name), specification: String(draft.specification || ''),
      uom: String(draft.unit), unitPrice: String(draft.unitPrice), safetyStockQty: String(draft.safetyStock),
    };
    // UI warehouse code -> server warehouse ID -> inventory API; no stock mutation.
    const association = warehouseAssociation(data.warehouses, String(draft.defaultWarehouseId || ''),
      String(editor.record.defaultWarehouseId || ''), editor.entity, editor.mode === 'create');
    if (editor.entity === 'product') {
      const values = {
        ...input, category: String(draft.category || ''), ...association,
      };
      let saved: { product: ProductDto };
      if (editor.mode === 'create') saved = await inventoryApi.createProduct(apiContext, { code: String(draft.id), ...values });
      else {
        const current = data.products.find(item => item.id === editor.record.id);
        if (!current?.serverVersion) throw new Error('产品版本未加载，请刷新后重试');
        saved = await inventoryApi.updateProduct(apiContext, current.id, current.serverVersion, { ...values, status: warehouseStatusToServer(String(draft.status)) });
      }
      // A successful legacy response may omit the association; reload facts without claiming it was saved.
      if (values.defaultWarehouseId && saved.product?.defaultWarehouseId !== values.defaultWarehouseId) {
        commit(data);
        setEditor(null);
        onToast('产品资料已提交，但库存仓库关联未确认，请刷新后检查', 'warning');
        return;
      }
    } else {
      const values = { ...input, materialType: String(draft.materialType || ''), ...association };
      const saved = editor.mode === 'create'
        ? await inventoryApi.createMaterial(apiContext, { code: String(draft.id), ...values })
        : await (async () => {
        const current = data.materials.find(item => item.id === editor.record.id);
        if (!current?.serverVersion) throw new Error('物料版本未加载，请刷新后重试');
        return inventoryApi.updateMaterial(apiContext, current.id, current.serverVersion, { ...values, status: warehouseStatusToServer(String(draft.status)) });
      })();
      if (values.defaultWarehouseId && saved.material?.defaultWarehouseId !== values.defaultWarehouseId) {
        commit(data); setEditor(null);
        onToast('物料资料已提交，但库存仓库关联未确认，请刷新后检查', 'warning');
        return;
      }
    }
    commit(data);
    setEditor(null);
    onToast(`${entityLabels[editor.entity]}已保存到服务端`, 'success');
  };

  const deleteRecord = async (entity: MasterEntity, id: string) => {
    const referenced = entity === 'warehouse'
      ? stockData.some((item) => item.warehouseId === id || data.warehouses.find((warehouse) => warehouse.id === id)?.name === item.warehouse)
        || data.products.some((item) => item.defaultWarehouseId === id) || data.materials.some((item) => item.defaultWarehouseId === id)
      : stockData.some((item) => item.id === id);
    if (referenced) {
      onToast(`当前${entityLabels[entity]}已被库存或主数据引用，不能删除，可编辑为停用`, 'warning');
      return;
    }
    if (apiContext && entity === 'warehouse') {
      const current = data.warehouses.find((item) => item.id === id);
      if (current?.serverId) {
        try {
          await inventoryApi.deleteWarehouse(apiContext, {
            id: current.serverId,
            code: current.code || current.id,
            name: current.name,
            type: current.type,
            address: current.address,
            manager: current.manager,
            phone: current.phone || '',
            status: warehouseStatusToServer(current.status),
            remark: current.remark,
            version: current.serverVersion || 1,
            createdAt: '',
            updatedAt: '',
          });
          commit({ ...data, warehouses: data.warehouses.filter((item) => item.id !== id) });
          onWarehousesChanged?.();
          onToast(`仓库 ${id} 已删除`, 'success');
          return;
        } catch (error) {
          onToast(error instanceof Error ? error.message : '仓库删除失败，请稍后重试', 'danger');
          return;
        }
      }
    }
    onToast('未删除：当前入口尚未接入主数据删除接口', 'danger');
  };

  const openEditor = (entity: MasterEntity, mode: EditorMode, record?: InventoryWarehouse | InventoryProduct | InventoryMaterial) => setEditor({ entity, mode, record: (record ? { ...record } : newRecord(entity)) as Record<string, string | number> });
  const currentEntity: MasterEntity = activeTab === 'warehouses' ? 'warehouse' : activeTab === 'products' ? 'product' : 'material';
  // Keep the editor at the same tree position across loading, error and detail/list branches.
  const editorPanel = editor && <MasterEditor state={editor} data={data} sourceReady={stockReady}
    sourceError={stockStatus === 'error' ? stockError || '库存加载失败，请重试' : undefined}
    onRefreshSource={onRefreshStock} onClose={() => setEditor(null)} onSave={saveRecord} />;

  if (!stockReady) return <>{editorPanel}<div role={stockStatus === 'error' ? 'alert' : 'status'} className="border-y border-slate-200 bg-white px-6 py-10 text-center text-[13px] text-slate-600">
    {stockStatus === 'error' ? stockError || '库存加载失败，请重试' : '正在加载仓库库存…'}
    {stockStatus === 'error' && <button type="button" onClick={onRefreshStock} className="ml-3 font-bold text-blue-700">重新加载</button>}
  </div></>;

  if (selectedWarehouse) {
    const usedRate = selectedWarehouse.capacity > 0 ? Math.min(100, Math.round((selectedWarehouse.usedCapacity / selectedWarehouse.capacity) * 100)) : 0;
    const productCount = warehouseRows.filter((item) => item.kind === '产品').length;
    const materialCount = warehouseRows.filter((item) => item.kind === '物料').length;
    return <>{editorPanel}<div className="animate-in fade-in duration-200">
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
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1160px] text-left text-[12px]">
            <thead className="border-b border-slate-200 bg-white text-slate-500">
              <tr>
                <th className="px-5 py-3">类型</th>
                <th className="px-5 py-3">编码 / 名称</th>
                <th className="px-5 py-3">规格 / 分类</th>
                <th className="px-5 py-3">库位</th>
                <th className="px-5 py-3 text-right">现有总量</th>
                <th className="px-5 py-3 text-right">冻结/预留</th>
                <th className="px-5 py-3 text-right">实际可用</th>
                <th className="px-5 py-3 text-right">价格</th>
                <th className="px-5 py-3">状态</th>
                <th className="px-5 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {detailRows.map((row) => {
                const actionRow = findInventoryRow(row.kind, row.id, row.warehouseId);
                const master = row.kind === '产品'
                  ? data.products.find((item) => item.id === row.id)
                  : data.materials.find((item) => item.id === row.id);
                return (
                  <tr key={`${row.kind}-${row.id}`} className="hover:bg-slate-50">
                    <td className="px-5 py-3"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{row.kind}</span></td>
                    <td className="px-5 py-3">
                      <div className="font-bold text-slate-900">{row.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{'code' in row ? row.code || row.id : row.id}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div className="text-slate-700">{row.specification}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{row.category}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-600">{row.location}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{row.hasStockFact ? row.stockQty : '-'} {row.unit}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-rose-600">{row.hasStockFact ? row.lockQty : '-'}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{row.hasStockFact ? row.availQty : '-'}</td>
                    <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-800">{formatUnitPrice(master?.unitPrice ?? row.unitPrice)}</td>
                    <td className="px-5 py-3"><StatusPill value={row.status} /></td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {master && <IconButton title={`查看${row.kind}`} onClick={() => openEditor(row.kind === '产品' ? 'product' : 'material', 'view', master)}>
                          <Eye size={14} />
                        </IconButton>}
                        {actionRow && (row.kind === '产品'
                          ? <IconButton title="补货申请" tone="blue" onClick={() => onCreateProductionRequest(actionRow)}><Factory size={14} /></IconButton>
                          : <IconButton title="补货申请" tone="amber" onClick={() => onCreatePurchaseRequest({ ...actionRow, procurementType: (master as InventoryMaterial)?.procurementType })}><FilePlus size={14} /></IconButton>)}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!detailRows.length && <tr><td colSpan={10} className="px-5 py-12 text-center text-slate-500">当前筛选下没有库存内容</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div></>;
  }

  const titles = activeTab === 'warehouses'
    ? { title: '仓库资料', subtitle: `${data.warehouses.length} 个仓库`, icon: WarehouseIcon }
    : activeTab === 'products'
      ? { title: '产品资料', subtitle: `${data.products.length} 个产品`, icon: Package }
      : { title: '物料资料', subtitle: `${data.materials.length} 项物料`, icon: Box };
  const TitleIcon = titles.icon;

  return <>{editorPanel}<section className="animate-in overflow-hidden rounded-lg border border-slate-200 bg-white fade-in duration-200">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4">
      <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700"><TitleIcon size={17} /></div><div><h2 className="text-[15px] font-bold text-slate-900">{titles.title}</h2><p className="mt-0.5 text-[11px] text-slate-500">{titles.subtitle}</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><label className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编码、名称或规格" className="h-9 w-56 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[12px] outline-none focus:border-blue-500" /></label><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500"><option>全部</option><option>启用</option><option>停用</option></select><button type="button" onClick={() => openEditor(currentEntity, 'create')} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-4 text-[12px] font-bold text-white hover:bg-blue-700"><Plus size={15} />新建{entityLabels[currentEntity]}</button></div>
    </div>
    <div className="overflow-x-auto">
      {activeTab === 'warehouses' && <table className="w-full min-w-[980px] text-left text-[12px]"><thead className="border-b border-slate-200 text-slate-500"><tr><th className="px-5 py-3">仓库编码 / 名称</th><th className="px-5 py-3">类型</th><th className="px-5 py-3">组织 / 地址</th><th className="px-5 py-3">负责人</th><th className="px-5 py-3">库容使用</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead><tbody className="divide-y divide-slate-100">{warehouses.map((row) => { const rate = Math.min(100, Math.round((row.usedCapacity / row.capacity) * 100)); return <tr key={row.id} className="hover:bg-slate-50"><td className="px-5 py-4"><button type="button" onClick={() => onSelectWarehouse(row.id)} className="text-left"><div className="font-bold text-blue-700 hover:underline">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{'code' in row ? row.code || row.id : row.id}</div></button></td><td className="px-5 py-4"><span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-bold text-slate-700">{row.type}</span></td><td className="px-5 py-4"><div className="font-bold text-slate-700">{row.organization}</div><div className="mt-1 max-w-[320px] truncate text-[11px] text-slate-500">{row.address}</div></td><td className="px-5 py-4 text-slate-700">{row.manager}</td><td className="px-5 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${rate >= 85 ? 'bg-rose-500' : rate >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${rate}%` }} /></div><span className="font-bold tabular-nums text-slate-700">{rate}%</span></div><div className="mt-1 text-[10px] text-slate-400">{row.usedCapacity} / {row.capacity}</div></td><td className="px-5 py-4"><StatusPill value={row.status} /></td><td className="px-5 py-4"><div className="flex justify-end gap-2"><IconButton title="查看仓库库存" onClick={() => onSelectWarehouse(row.id)}><Eye size={14} /></IconButton><IconButton title="编辑仓库" tone="blue" onClick={() => openEditor('warehouse', 'edit', row)}><Edit2 size={14} /></IconButton><IconButton title="删除仓库" tone="rose" onClick={() => deleteRecord('warehouse', row.id)}><Trash2 size={14} /></IconButton><button type="button" title="进入仓库" aria-label="进入仓库" onClick={() => onSelectWarehouse(row.id)} className="flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">库存内容<ChevronRight size={13} /></button></div></td></tr>; })}{!warehouses.length && <tr><td colSpan={7} className="px-5 py-12 text-center text-slate-500">没有符合条件的仓库</td></tr>}</tbody></table>}
      {activeTab === 'products' && (
        <table className="w-full min-w-[1240px] text-left text-[12px]">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-5 py-3">产品编码 / 名称</th>
              <th className="px-5 py-3">规格型号</th>
              <th className="px-5 py-3">分类 / 单位</th>
              <th className="px-5 py-3">库存仓库</th>
              <th className="px-5 py-3 text-right">实际可用</th>
              <th className="px-5 py-3 text-right">价格</th>
              <th className="px-5 py-3">安全库存</th>
              <th className="px-5 py-3">追溯方式</th>
              <th className="px-5 py-3">状态</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.map((row) => {
              const actionRow = findInventoryRow('产品', row.id, row.defaultWarehouseId);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">{'code' in row ? row.code || row.id : row.id}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{row.specification}</td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-700">{row.category}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{row.unit}</div>
                  </td>
                  <td className="px-5 py-4">
                    {row.defaultWarehouseId
                      ? data.warehouses.some(item => item.id === row.defaultWarehouseId || item.serverId === row.defaultWarehouseId)
                        ? <button type="button" onClick={() => onSelectWarehouse(row.defaultWarehouseId)} className="font-bold text-blue-700 hover:underline">{warehouseName(row.defaultWarehouseId)}</button>
                        : <span className="text-slate-500">关联仓库不可用</span>
                      : <span className="text-slate-400">未关联</span>}
                  </td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums text-emerald-700">
                    {actionRow?.hasStockFact ? <span>{actionRow.availQty} <span className="text-[10px] font-medium text-slate-400">{row.unit}</span></span> : <span className="text-slate-400">-</span>}
                  </td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums text-slate-800">{formatUnitPrice(row.unitPrice)}</td>
                  <td className="px-5 py-4 font-bold tabular-nums text-slate-800">{row.safetyStock} {row.unit}</td>
                  <td className="px-5 py-4 text-slate-700">{row.traceMode}</td>
                  <td className="px-5 py-4"><StatusPill value={row.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <IconButton title="查看产品" onClick={() => openEditor('product', 'view', row)}><Eye size={14} /></IconButton>
                      {row.status === '启用' && actionRow && <IconButton title="补货申请" tone="blue" onClick={() => onCreateProductionRequest(actionRow)}><Factory size={14} /></IconButton>}
                      <IconButton title="编辑产品" tone="blue" onClick={() => openEditor('product', 'edit', row)}><Edit2 size={14} /></IconButton>
                      <IconButton title="删除产品" tone="rose" onClick={() => deleteRecord('product', row.id)}><Trash2 size={14} /></IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!products.length && <tr><td colSpan={10} className="px-5 py-12 text-center text-slate-500">没有符合条件的产品</td></tr>}
          </tbody>
        </table>
      )}
      {activeTab === 'materials' && (
        <table className="w-full min-w-[1160px] text-left text-[12px]">
          <thead className="border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-5 py-3">物料编码 / 名称</th>
              <th className="px-5 py-3">规格型号</th>
              <th className="px-5 py-3">类型 / 单位</th>
              <th className="px-5 py-3">默认仓库</th>
              <th className="px-5 py-3 text-right">价格</th>
              <th className="px-5 py-3">采购策略</th>
              <th className="px-5 py-3">安全库存</th>
              <th className="px-5 py-3">状态</th>
              <th className="px-5 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {materials.map((row) => {
              const actionRow = findInventoryRow('物料', row.id, row.defaultWarehouseId);
              return (
                <tr key={row.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-900">{row.name}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-500">{'code' in row ? row.code || row.id : row.id}</div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">{row.specification}</td>
                  <td className="px-5 py-4">
                    <div className="font-bold text-slate-700">{row.materialType}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{row.unit}</div>
                  </td>
                  <td className="px-5 py-4">
                    <button type="button" onClick={() => onSelectWarehouse(row.defaultWarehouseId)} className="font-bold text-blue-700 hover:underline">{warehouseName(row.defaultWarehouseId)}</button>
                  </td>
                  <td className="px-5 py-4 text-right font-bold tabular-nums text-slate-800">{formatUnitPrice(row.unitPrice)}</td>
                  <td className="px-5 py-4 text-slate-700">{row.procurementType}</td>
                  <td className="px-5 py-4 font-bold tabular-nums text-slate-800">{row.safetyStock} {row.unit}</td>
                  <td className="px-5 py-4"><StatusPill value={row.status} /></td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <IconButton title="查看物料" onClick={() => openEditor('material', 'view', row)}><Eye size={14} /></IconButton>
                      {row.status === '启用' && row.procurementType !== '自制' && actionRow && <IconButton title="补货申请" tone="amber" onClick={() => onCreatePurchaseRequest({ ...actionRow, procurementType: row.procurementType })}><FilePlus size={14} /></IconButton>}
                      <IconButton title="编辑物料" tone="blue" onClick={() => openEditor('material', 'edit', row)}><Edit2 size={14} /></IconButton>
                      <IconButton title="删除物料" tone="rose" onClick={() => deleteRecord('material', row.id)}><Trash2 size={14} /></IconButton>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!materials.length && <tr><td colSpan={9} className="px-5 py-12 text-center text-slate-500">没有符合条件的物料</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  </section></>;
};
