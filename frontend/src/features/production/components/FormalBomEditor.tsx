import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
import { productionOperationsApi, type BomSnapshot } from '../../../api/production/operations';
import { hasPermission } from '../../../app/permissions';
import { useApiResource } from '../../../hooks/useApiResource';
import { businessCommandScope, useBusinessCommand } from '../../../hooks/useBusinessCommand';
import { buildBomInput, type BomLineDraft, type BomOperationDraft } from '../model/bomDraft';
import { bomMasterData } from '../model/bomMasterData';
import { productionError } from '../model/productionError';
import type { BomDemandTarget } from './FormalBomPanel';

const fieldClass = 'mt-1 w-full min-w-0 rounded border border-slate-200 px-2 py-2 text-xs text-slate-800 disabled:bg-slate-50';
type Props = {
  context: ApiContext; permissions: readonly string[]; bom?: BomSnapshot; target?: BomDemandTarget;
  onClose: () => void; onPublished: (bom: BomSnapshot) => void;
};
const enabled = (item: { status: string }) => item.status === 'active';

/** Browser -> business API only. Unknown publication results retain the original command. */
export function FormalBomEditor({ context, permissions, bom, target, onClose, onPublished }: Props) {
  const products = useApiResource(hasPermission(permissions, 'inventory.product.read') ? context : null, bomMasterData.products);
  const materials = useApiResource(hasPermission(permissions, 'inventory.material.read') ? context : null, bomMasterData.materials);
  const warehouses = useApiResource(hasPermission(permissions, 'inventory.warehouse.read') ? context : null, bomMasterData.warehouses);
  const centers = useApiResource(hasPermission(permissions, 'platform.org.view') ? context : null, bomMasterData.workCenters);
  const [productId, setProductId] = useState(target?.productId || bom?.productId || '');
  const [lines, setLines] = useState<BomLineDraft[]>(() => bom?.lines.map(line => ({ ...line, key: crypto.randomUUID() })) || []);
  const [operations, setOperations] = useState<BomOperationDraft[]>(() => bom?.routingSnapshot.operations.map(operation => ({ ...operation, sequence: String(operation.sequence), key: crypto.randomUUID() })) || []);
  const [version, setVersion] = useState(bom?.version);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [conflictResolved, setConflictResolved] = useState(false);
  const nonce = useRef(crypto.randomUUID());
  const routingId = useRef(`ROUTE-${crypto.randomUUID()}`);
  const submitted = useRef<ReturnType<typeof buildBomInput>['input']>();
  const inRead = useRef(false);
  const mounted = useRef(true);
  const form = useRef<HTMLFormElement>(null);
  const closeAllowed = useRef(true);
  const command = useBusinessCommand(businessCommandScope(context, nonce.current, 'bom-publish'));
  const conflicted = [409, 412].includes(command.apiError?.status) && !conflictResolved;
  const locked = command.pending || command.uncertain || checking;
  closeAllowed.current = !locked;
  const fixedProduct = Boolean(target || bom);
  const product = products.data?.find(item => item.id === productId);
  const productName = product?.name || target?.productName || bom?.productName || '';
  const choicesReady = !!materials.data && !!warehouses.data && !!centers.data && (fixedProduct || !!products.data);
  useEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeAllowed.current) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...(form.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled])') || [])]
        .filter(element => element.offsetParent !== null && !element.closest('fieldset[disabled]'));
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1]?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      mounted.current = false;
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const field = (name: string, title: string, control: ReactNode) => <label className="min-w-0 text-xs text-slate-600">
    {title}{control}{errors[name] && <span role="alert" className="mt-1 block text-rose-600">{errors[name]}</span>}
  </label>;
  const select = (name: string, value: string, items: Array<{ id: string; code?: string; name: string }>, change: (id: string) => void) =>
    <select aria-label={name} title={items.find(item => item.id === value)?.name || value} className={fieldClass} value={value} onChange={event => change(event.target.value)}>
      <option value="">请选择</option>
      {value && !items.some(item => item.id === value) && <option value={value} disabled>原记录：{value}（当前不可选）</option>}
      {items.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
    </select>;
  const publish = async () => {
    if (locked || conflicted || !choicesReady || !hasPermission(permissions, 'production.bom.manage')) return;
    const draft = buildBomInput(productId, productName, lines, operations, routingId.current);
    lines.forEach((line, index) => {
      if (!materials.data?.some(item => item.id === line.materialId && enabled(item))) draft.errors[`materialId-${index}`] = '请选择可用的正式物料';
      if (!warehouses.data?.some(item => item.id === line.warehouseId && enabled(item))) draft.errors[`warehouseId-${index}`] = '请选择可用的库存仓库';
    });
    operations.forEach((operation, index) => {
      if (!centers.data?.some(item => item.id === operation.workCenterResourceId)) draft.errors[`workCenterResourceId-${index}`] = '请选择可用的工作中心';
    });
    if ((!fixedProduct && !products.data?.some(item => item.id === productId && enabled(item))) || (product && !enabled(product))) draft.errors.productId = '请选择可用的正式产品';
    setErrors(draft.errors); setNotice(''); setConflictResolved(false); setChecked(false);
    if (Object.keys(draft.errors).length) return;
    submitted.current = draft.input;
    const result = await command.execute(key => productionOperationsApi.publishBom(context, draft.input, version, key));
    if (mounted.current && result) onPublished(result);
  };
  const readBack = async () => {
    if (inRead.current || command.pending) return;
    inRead.current = true; setChecking(true); setNotice('');
    try {
      const boms = await productionOperationsApi.listBoms(context);
      if (!Array.isArray(boms)) throw new Error('BOM 列表响应不符合契约');
      if (!mounted.current) return;
      const current = boms.find(item => item.productId === productId);
      if (command.uncertain) {
        if (current?.status === 'EFFECTIVE' && current.routingSnapshotId === submitted.current?.routingSnapshotId) {
          onPublished(current);
          return;
        }
        setChecked(true);
        setNotice('尚未确认本次发布结果。请重试同一次发布请求，输入与版本将保持不变。');
      } else {
        setVersion(current?.version); setConflictResolved(true);
        setNotice(`已读取服务端${current ? ` v${current.version}（${current.lines.length} 项物料、${current.routingSnapshot?.operations?.length || 0} 道工序）` : '当前无 BOM'}，已保留输入，请核对后再确认发布。`);
      }
    } catch (cause) {
      if (mounted.current) { setChecked(false); setNotice(`核对失败：${productionError(cause)}`); }
    } finally {
      inRead.current = false;
      if (mounted.current) setChecking(false);
    }
  };
  const retry = async () => {
    if (!checked || checking) return;
    const result = await command.retry<BomSnapshot>();
    if (mounted.current && result) onPublished(result);
  };
  const resources = [
    { label: '产品', permission: 'inventory.product.read', resource: products },
    { label: '物料', permission: 'inventory.material.read', resource: materials },
    { label: '库存仓库', permission: 'inventory.warehouse.read', resource: warehouses },
    { label: '工作中心', permission: 'platform.org.view', resource: centers },
  ];
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
    <form ref={form} role="dialog" aria-modal="true" aria-labelledby="formal-bom-title" onSubmit={event => { event.preventDefault(); void publish(); }}
      className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <header className="flex shrink-0 items-center justify-between border-b p-4">
        <h3 id="formal-bom-title" className="text-sm font-bold">发布生效 BOM</h3>
        <button type="button" title="关闭" aria-label="关闭 BOM 编辑" disabled={locked} onClick={onClose}><X size={18}/></button>
      </header>
      <div className="overflow-y-auto p-4">
        <div className="mb-4 space-y-2 text-xs">
          {resources.map(({ label, permission, resource }) => !hasPermission(permissions, permission)
            ? <p key={label} className="text-amber-700">无{label}查询权限{label === '产品' && fixedProduct ? '，保留来源提供的产品 ID。' : '，请联系管理员授权。'}</p>
            : resource.loading ? <p key={label} role="status">正在读取{label}</p>
            : resource.error ? <p key={label} role="alert" className="text-rose-600">{label}读取失败：{resource.error} <button type="button" onClick={resource.reload} className="text-blue-600">重试读取{label}</button></p>
            : !resource.data?.length ? <p key={label} className="text-amber-700">暂无可用{label}</p> : null)}
        </div>
        <fieldset disabled={locked} className="min-w-0 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {field('productId', '产品', fixedProduct
              ? <input aria-label="产品 ID" readOnly className={fieldClass} value={productId}/>
              : select('产品', productId, products.data?.filter(enabled) || [], setProductId))}
            <label className="min-w-0 text-xs text-slate-600">产品名称<input aria-label="产品名称" readOnly className={fieldClass} value={productName}/></label>
          </div>
          <div className="flex items-center justify-between"><h4 className="text-xs font-bold">单位产品物料用量</h4>
            <button type="button" title="添加物料" aria-label="添加物料" onClick={() => setLines(previous => [...previous, { key: crypto.randomUUID(), materialId: '', warehouseId: '', qtyPer: '', uom: '' }])}><Plus size={16}/></button></div>
          {errors.lines && <p role="alert" className="text-xs text-rose-600">{errors.lines}</p>}
          {lines.map((line, index) => {
            const change = (values: Partial<BomLineDraft>) => setLines(previous => previous.map(item => item.key === line.key ? { ...item, ...values } : item));
            return <div key={line.key} className="grid grid-cols-2 items-start gap-3 border-b pb-4 lg:grid-cols-[2fr_2fr_1fr_1fr_24px]">
              {field(`materialId-${index}`, '物料', select(`materialId-${index}`, line.materialId, materials.data?.filter(enabled) || [], id => {
                const material = materials.data?.find(item => item.id === id);
                change({ materialId: id, materialName: material?.name || '', uom: material?.uom || '' });
              }))}
              {field(`warehouseId-${index}`, '库存仓库', select(`warehouseId-${index}`, line.warehouseId, warehouses.data?.filter(enabled) || [], warehouseId => change({ warehouseId })))}
              {field(`qtyPer-${index}`, '用量', <input aria-label={`qtyPer-${index}`} inputMode="decimal" className={fieldClass} value={line.qtyPer} onChange={event => change({ qtyPer: event.target.value })}/>)}
              {field(`uom-${index}`, '单位', <input aria-label={`uom-${index}`} className={fieldClass} value={line.uom} onChange={event => change({ uom: event.target.value })}/>)}
              <button type="button" title="删除物料" aria-label={`删除物料 ${index + 1}`} onClick={() => setLines(previous => previous.filter(item => item.key !== line.key))} className="py-2 text-rose-600"><Trash2 size={14}/></button>
            </div>;
          })}
          <div className="flex items-center justify-between"><h4 className="text-xs font-bold">关联工艺工序</h4>
            <button type="button" title="添加工序" aria-label="添加工序" onClick={() => setOperations(previous => [...previous, { key: crypto.randomUUID(), sequence: '', code: '', name: '', workCenterResourceId: '', standardMinutes: '' }])}><Plus size={16}/></button></div>
          {errors.operations && <p role="alert" className="text-xs text-rose-600">{errors.operations}</p>}
          {operations.map((operation, index) => {
            const change = (values: Partial<BomOperationDraft>) => setOperations(previous => previous.map(item => item.key === operation.key ? { ...item, ...values } : item));
            return <div key={operation.key} className="grid grid-cols-2 items-start gap-3 border-b pb-4 lg:grid-cols-[80px_1fr_1fr_2fr_100px_24px]">
              {field(`sequence-${index}`, '顺序', <input aria-label={`sequence-${index}`} inputMode="numeric" className={fieldClass} value={operation.sequence} onChange={event => change({ sequence: event.target.value })}/>)}
              {field(`code-${index}`, '工序编码', <input aria-label={`code-${index}`} className={fieldClass} value={operation.code} onChange={event => change({ code: event.target.value })}/>)}
              {field(`name-${index}`, '工序名称', <input aria-label={`name-${index}`} className={fieldClass} value={operation.name} onChange={event => change({ name: event.target.value })}/>)}
              {field(`workCenterResourceId-${index}`, '工作中心', select(`workCenterResourceId-${index}`, operation.workCenterResourceId, centers.data || [], workCenterResourceId => change({ workCenterResourceId })))}
              {field(`standardMinutes-${index}`, '分钟/件', <input aria-label={`standardMinutes-${index}`} inputMode="decimal" className={fieldClass} value={operation.standardMinutes} onChange={event => change({ standardMinutes: event.target.value })}/>)}
              <button type="button" title="删除工序" aria-label={`删除工序 ${index + 1}`} onClick={() => setOperations(previous => previous.filter(item => item.key !== operation.key))} className="py-2 text-rose-600"><Trash2 size={14}/></button>
            </div>;
          })}
        </fieldset>
        {command.error && <p role="alert" className="mt-3 whitespace-pre-wrap break-words text-xs text-rose-600">{command.apiError ? productionError(command.apiError) : command.error}</p>}
        {notice && <p role="status" className="mt-3 break-words text-xs text-amber-700">{notice}</p>}
        {command.uncertain && !command.pending && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          <p>发布结果待确认，请先核对服务端结果。</p>
          <button type="button" disabled={checking} onClick={() => void readBack()} className="text-blue-600">核对发布结果</button>
          <button type="button" disabled={!checked || checking} onClick={() => void retry()} className="text-blue-600 disabled:opacity-40">重试同一次发布</button>
        </div>}
        {conflicted && <button type="button" disabled={checking} onClick={() => void readBack()} className="mt-3 text-xs text-blue-600">读取最新版本并核对</button>}
      </div>
      <footer className="flex shrink-0 flex-wrap justify-end gap-3 border-t p-4">
        <button type="button" disabled={locked} onClick={onClose} className="rounded border px-3 py-2 text-xs disabled:opacity-40">取消</button>
        <button type="submit" disabled={locked || conflicted || !choicesReady || !hasPermission(permissions, 'production.bom.manage')} className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">
          <Check size={16}/>{command.pending ? '发布中' : '确认发布'}
        </button>
      </footer>
    </form>
  </div>;
}
