import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, RefreshCw, Upload } from 'lucide-react';
import { apiContextScope, type ApiContext } from '../../../api/client';
import { productionOperationsApi, type BomSnapshot } from '../../../api/production/operations';
import { hasPermission } from '../../../app/permissions';
import { productionError } from '../model/productionError';
import { FormalBomEditor } from './FormalBomEditor';

export type BomDemandTarget = { id: string; code: string; productId: string; productName?: string };
type Props = {
  key?: string;
  context: ApiContext;
  permissions?: readonly string[];
  target?: BomDemandTarget;
  onReturn?: () => void | Promise<void>;
  onPublished?: (bom: BomSnapshot) => void;
};

/** Tenant-scoped formal BOMs. Publication never changes a demand's validation status. */
export function FormalBomPanel(props: Props) {
  return <BomPanel key={`${apiContextScope(props.context)}:${props.permissions?.join(',')}`} {...props} />;
}

function BomPanel({ context, permissions = [], target, onReturn, onPublished }: Props) {
  const [boms, setBoms] = useState<BomSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editor, setEditor] = useState<{ bom?: BomSnapshot } | null>(null);
  const [returning, setReturning] = useState(false);
  const returnInFlight = useRef(false);
  const mounted = useRef(true);
  const request = useRef(0);
  const canManage = hasPermission(permissions, 'production.bom.manage');
  const canRead = canManage || hasPermission(permissions, 'production.demand.review');
  const refresh = async () => {
    const revision = ++request.current;
    if (!canRead) { setLoading(false); setError('无 BOM 查询权限'); return; }
    setLoading(true);
    try {
      const result = await productionOperationsApi.listBoms(context);
      if (!Array.isArray(result)) throw new Error('BOM 列表响应不符合契约');
      if (!mounted.current || revision !== request.current) return;
      setBoms(result); setError(''); setLoaded(true);
    } catch (cause) {
      if (mounted.current && revision === request.current) setError(productionError(cause));
    } finally {
      if (mounted.current && revision === request.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; ++request.current; };
  }, []);
  const published = (bom: BomSnapshot) => {
    if (!mounted.current) return;
    setEditor(null);
    setBoms(previous => [...previous.filter(item => item.productId !== bom.productId), bom]);
    setMessage(`${bom.productName || bom.productId} BOM v${bom.version} 及关联工艺已生效。请返回需求后重新校验。`);
    onPublished?.(bom);
    // Command success and readback failure are separate outcomes.
    void refresh();
  };
  const visible = target ? boms.filter(bom => bom.productId === target.productId) : boms;
  const returnToDemand = async () => {
    if (returnInFlight.current) return;
    returnInFlight.current = true; setReturning(true);
    try { await onReturn?.(); }
    finally { if (mounted.current) setReturning(false); returnInFlight.current = false; }
  };
  return <section className="shrink-0 border-b border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-bold text-slate-800">生效 BOM 与工艺版本</h4>
      <div className="flex flex-wrap items-center gap-2">
        {onReturn && <button onClick={() => void returnToDemand()} disabled={returning || !!editor} className="flex items-center gap-1 rounded border px-3 py-2 text-xs disabled:opacity-40"><ArrowLeft size={15}/>{returning ? '正在读取需求' : '返回原需求'}</button>}
        <button title="刷新生效版本" aria-label="刷新生效版本" onClick={() => void refresh()} disabled={loading || !!editor} className="p-2 text-slate-500 disabled:opacity-40"><RefreshCw size={16}/></button>
        <button onClick={() => setEditor({ bom: target ? visible[0] : undefined })} disabled={!canManage || !loaded || loading || !!error || !!editor}
          className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Upload size={15}/>发布生效 BOM</button>
      </div>
    </div>
    {target && <p className="mt-3 break-words text-xs text-slate-600">需求 {target.code} · {target.productName || target.productId} · 产品 ID：{target.productId}</p>}
    {!canManage && <p className="mt-2 text-xs text-amber-700">无 BOM 维护权限，请由具备 BOM 管理权限的人员维护。</p>}
    {message && <p role="status" className="mt-2 break-words text-xs text-emerald-700">{message}</p>}
    {error && <p role="alert" className="mt-2 break-words text-xs text-rose-600">{message ? '发布已成功，回读失败：' : '读取失败：'}{error}。请重试刷新。</p>}
    {loading && <p role="status" className="py-3 text-xs text-slate-500">正在加载生效版本</p>}
    {!loading && !error && !visible.length && <p className="py-3 text-xs text-slate-500">暂无生效版本</p>}
    {!!visible.length && <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead className="text-slate-500"><tr><th className="py-2">产品</th><th>版本</th><th>物料行</th><th>工序</th><th>状态</th><th>发布人</th><th className="text-right">操作</th></tr></thead>
        <tbody>{visible.map(bom => <tr key={bom.id} className="border-t border-slate-100">
          <td className="py-2 font-medium text-slate-800">{bom.productName || bom.productId}<span className="ml-2 text-slate-500">{bom.productId}</span></td>
          <td>v{bom.version}</td><td>{bom.lines.length}</td><td>{bom.routingSnapshot?.operations?.length ?? '-'}</td>
          <td>{bom.status === 'EFFECTIVE' ? '已生效' : '状态待核实'}</td><td>{bom.publishedBy || '-'}</td>
          <td className="text-right"><button onClick={() => setEditor({ bom })} disabled={!canManage || loading || !!error || !!editor} className="text-blue-600 disabled:opacity-40">修订发布</button></td>
        </tr>)}</tbody>
      </table>
    </div>}
    {editor && <FormalBomEditor context={context} permissions={permissions} bom={editor.bom} target={target}
      onClose={() => setEditor(null)} onPublished={published}/>}
  </section>;
}
