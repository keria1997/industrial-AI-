import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRightLeft,
  Box,
  Database,
  Edit2,
  Eye,
  Factory,
  FilePlus,
  MapPin,
  Package,
  RotateCcw,
  ScanLine,
  Search,
  Trash2,
  Warehouse,
} from 'lucide-react';
import {
  getInventoryStockQueryRows,
  createInventoryMasterDataSeed,
  queryInventoryStock,
  type InventoryStockFact,
  type InventoryMasterData,
  type InventoryStockQueryKind,
  type InventoryStockQueryRow,
} from '../model/inventoryMasterData';

type Props = {
  tenantId?: string;
  stockData: InventoryStockFact[];
  onQuickInventory: () => void;
  onView: (row: InventoryStockQueryRow) => void;
  onEdit: (row: InventoryStockQueryRow) => void;
  onTransfer: (row: InventoryStockQueryRow) => void;
  onDelete: (row: InventoryStockQueryRow) => void;
  onCreateProductionRequest: (row: InventoryStockQueryRow) => void;
  onCreatePurchaseRequest: (row: InventoryStockQueryRow) => void;
  formalMasterData?: InventoryMasterData;
  stockStatus?: 'loading' | 'ready' | 'error';
  stockError?: string;
  onRefreshStock?: () => void;
};

const statusClasses: Record<string, string> = {
  正常: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  低库存: 'border-rose-200 bg-rose-50 text-rose-700',
  积压呆滞: 'border-amber-200 bg-amber-50 text-amber-700',
  去化中: 'border-blue-200 bg-blue-50 text-blue-700',
  未入库: 'border-slate-200 bg-slate-50 text-slate-600',
};

const IconButton = ({ title, tone = 'slate', onClick, children }: {
  title: string;
  tone?: 'slate' | 'blue' | 'amber' | 'rose';
  onClick: () => void;
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

export const InventoryStockQueryPanel = ({
  tenantId,
  stockData,
  onQuickInventory,
  onView,
  onEdit,
  onTransfer,
  onDelete,
  onCreateProductionRequest,
  onCreatePurchaseRequest,
  formalMasterData,
  stockStatus,
  stockError,
  onRefreshStock,
}: Props) => {
  const masterData = formalMasterData || createInventoryMasterDataSeed();
  const [kind, setKind] = useState<InventoryStockQueryKind>('全部');
  const [warehouseId, setWarehouseId] = useState('全部');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('全部');

  useEffect(() => {
    setKind('全部');
    setWarehouseId('全部');
    setQuery('');
    setStatus('全部');
  }, [tenantId]);

  const stockReady = !stockStatus || stockStatus === 'ready';
  const rows = useMemo(() => stockReady ? getInventoryStockQueryRows(masterData, stockData) : [], [masterData, stockData, stockReady]);
  const filteredRows = useMemo(() => queryInventoryStock(rows, {
    warehouseId,
    kind,
    query,
    status,
  }), [rows, warehouseId, kind, query, status]);
  const hasFilters = warehouseId !== '全部' || kind !== '全部' || query.trim() || status !== '全部';

  const resetFilters = () => {
    setKind('全部');
    setWarehouseId('全部');
    setQuery('');
    setStatus('全部');
  };

  if (!stockReady) return <div role={stockStatus === 'error' ? 'alert' : 'status'} className="border-y border-slate-200 bg-white px-6 py-10 text-center text-[13px] text-slate-600">
    {stockStatus === 'error' ? stockError || '库存加载失败，请重试' : '正在加载仓库库存…'}
    {stockStatus === 'error' && <button type="button" onClick={onRefreshStock} className="ml-3 font-bold text-blue-700">重新加载</button>}
  </div>;

  return (
    <section className="animate-in overflow-hidden rounded-lg border border-slate-200 bg-white fade-in duration-200">
      <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-blue-100 bg-blue-50 text-blue-700"><Database size={17} /></div>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-slate-900">库存查询</h2>
              <p className="mt-0.5 text-[11px] text-slate-500">按仓库查看全部库存，或跨仓库查询产品与物料</p>
            </div>
          </div>
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5" aria-label="库存对象类型">
            {(['全部', '产品', '物料'] as InventoryStockQueryKind[]).map((item) => (
              <button key={item} type="button" onClick={() => setKind(item)} className={`inline-flex h-8 items-center gap-1.5 rounded px-3 text-[12px] font-bold transition-colors ${kind === item ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                {item === '产品' ? <Package size={13} /> : item === '物料' ? <Box size={13} /> : <Database size={13} />}{item}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 px-5 py-4">
        <label className="block min-w-[210px] flex-1">
          <span className="mb-1.5 block text-[11px] font-bold text-slate-500">产品 / 物料</span>
          <span className="relative block"><Search className="absolute left-3 top-2.5 text-slate-400" size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编码、名称、规格或库位" className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-[12px] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></span>
        </label>
        <label className="block w-[220px]">
          <span className="mb-1.5 block text-[11px] font-bold text-slate-500">仓库</span>
          <select value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500">
            <option value="全部">全部仓库</option>
            {masterData.warehouses.filter((item) => item.status === '启用').map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} ({warehouse.id})</option>)}
          </select>
        </label>
        <label className="block w-[150px]">
          <span className="mb-1.5 block text-[11px] font-bold text-slate-500">库存健康度</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-700 outline-none focus:border-blue-500">
            <option value="全部">全部状态</option><option value="正常">正常</option><option value="低库存">低库存</option><option value="积压呆滞">积压呆滞</option><option value="去化中">去化中</option><option value="未入库">未入库</option>
          </select>
        </label>
        {hasFilters && <button type="button" onClick={resetFilters} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-bold text-slate-600 hover:bg-slate-50"><RotateCcw size={14} />重置</button>}
        {!stockStatus && <button type="button" onClick={onQuickInventory} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-[12px] font-bold text-blue-700 hover:bg-blue-100"><ScanLine size={14} />快速盘点</button>}
        {stockStatus && <button type="button" title="刷新库存" aria-label="刷新库存" onClick={onRefreshStock} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"><RotateCcw size={14} /></button>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-left text-[12px]">
          <thead className="border-b border-slate-200 bg-white text-slate-500"><tr><th className="px-5 py-3">类型</th><th className="px-5 py-3">编码 / 名称</th><th className="px-5 py-3">仓库 / 库位</th><th className="px-5 py-3">规格 / 分类</th><th className="px-5 py-3 text-right">现有量</th><th className="px-5 py-3 text-right">冻结 / 预留</th><th className="px-5 py-3 text-right">可用量</th><th className="px-5 py-3 text-right">安全库存</th><th className="px-5 py-3">状态</th><th className="px-5 py-3 text-right">操作</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.map((row) => <tr key={`${row.warehouseId}-${row.kind}-${row.id}`} className="hover:bg-slate-50">
              <td className="px-5 py-3"><span className={`inline-flex h-6 items-center gap-1 rounded-md border px-2 font-bold ${row.kind === '产品' ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>{row.kind === '产品' ? <Package size={12} /> : <Box size={12} />}{row.kind}</span></td>
              <td className="px-5 py-3"><div className="font-bold text-slate-900">{row.name}</div><div className="mt-0.5 font-mono text-[11px] text-slate-500">{row.id}</div></td>
              <td className="px-5 py-3"><div className="flex items-center gap-1.5 font-bold text-slate-700"><Warehouse size={12} className="text-blue-600" />{row.warehouse}</div><div className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-slate-500"><MapPin size={10} />{row.location}</div></td>
              <td className="px-5 py-3"><div className="max-w-[230px] truncate text-slate-700" title={row.specification}>{row.specification}</div><div className="mt-0.5 text-[11px] text-slate-500">{row.category}</div></td>
              <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-900">{row.hasStockFact ? row.stockQty : '-'} <span className="text-[10px] font-medium text-slate-400">{row.unit}</span></td>
              <td className="px-5 py-3 text-right font-bold tabular-nums text-rose-600">{row.hasStockFact ? row.lockQty : '-'}</td>
              <td className="px-5 py-3 text-right font-bold tabular-nums text-emerald-700">{row.hasStockFact ? row.availQty : '-'}</td>
              <td className="px-5 py-3 text-right font-bold tabular-nums text-slate-700">{row.safetyStock}</td>
              <td className="px-5 py-3"><span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-bold ${statusClasses[row.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>{row.status}</span></td>
              <td className="px-5 py-3"><div className="flex justify-end gap-2"><IconButton title="查看库存" onClick={() => onView(row)}><Eye size={14} /></IconButton>{row.kind === '产品' ? <IconButton title="补货申请" tone="blue" onClick={() => onCreateProductionRequest(row)}><Factory size={14} /></IconButton> : <IconButton title="补货申请" tone="amber" onClick={() => onCreatePurchaseRequest(row)}><FilePlus size={14} /></IconButton>}{row.hasStockFact && !stockStatus && <><IconButton title="编辑库存" tone="blue" onClick={() => onEdit(row)}><Edit2 size={14} /></IconButton><IconButton title="调拨库存" tone="amber" onClick={() => onTransfer(row)}><ArrowRightLeft size={14} /></IconButton><IconButton title="删除库存" tone="rose" onClick={() => onDelete(row)}><Trash2 size={14} /></IconButton></>}</div></td>
            </tr>)}
            {!filteredRows.length && <tr><td colSpan={10} className="px-5 py-14 text-center"><Search className="mx-auto text-slate-300" size={24} /><div className="mt-3 font-bold text-slate-700">没有符合条件的库存</div><div className="mt-1 text-[11px] text-slate-500">调整仓库、对象类型或搜索条件后重试</div>{hasFilters && <button type="button" onClick={resetFilters} className="mt-3 text-[12px] font-bold text-blue-700 hover:underline">清除筛选条件</button>}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500"><span>共 {filteredRows.length} 条库存记录</span><span>库存数据按仓库归集</span></div>
    </section>
  );
};
