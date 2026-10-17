import { useEffect, useRef, useState } from "react";
import { Check, Plus, RefreshCw, Trash2, Upload, X } from "lucide-react";
import type { ApiContext } from "../../../api/client";
import { productionOperationsApi, type BomSnapshot } from "../../../api/production/operations";
import { parseNumericDraft } from "../../../shared/numericDraft";

const initialLines: BomSnapshot["lines"] = [];
type OperationDraft = Omit<BomSnapshot["routingSnapshot"]["operations"][number], "sequence"> & { sequence: string };
const initialOperations: OperationDraft[] = [];
const fieldClass = "w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-800";

export function FormalBomPanel({ context }: { context: ApiContext }) {
  const [boms, setBoms] = useState<BomSnapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [productId, setProductId] = useState("");
  const [productName, setProductName] = useState("");
  const [lines, setLines] = useState(initialLines);
  const [operations, setOperations] = useState(initialOperations);
  const key = useRef("");
  const scope = useRef("");
  const currentScope = `${context.tenantId}:${context.accessToken}`;
  scope.current = currentScope;
  const refresh = async () => {
    const requestedScope = currentScope;
    setLoaded(false);
    try {
      const result = await productionOperationsApi.listBoms(context);
      if (scope.current === requestedScope) { setBoms(result); setError(""); setLoaded(true); }
    } catch (cause) {
      if (scope.current === requestedScope) { setBoms([]); setError(cause instanceof Error ? cause.message : "生效版本加载失败"); }
    }
  };
  useEffect(() => { setBoms([]); setOpen(false); setMessage(""); void refresh(); }, [currentScope]);
  const edit = (bom?: BomSnapshot) => {
    setProductId(bom?.productId || "");
    setProductName(bom?.productName || "");
    setLines(bom?.lines.map(line => ({ ...line })) || initialLines.map(line => ({ ...line })));
    setOperations(bom?.routingSnapshot?.operations.map(operation => ({ ...operation, sequence: String(operation.sequence) })) || []);
    key.current = crypto.randomUUID();
    setError(""); setMessage(""); setOpen(true);
  };
  const publish = async () => {
    if (busy) return;
    if (!lines.length || !operations.length) { setError("请填写物料和工序后再发布"); return; }
    const sequences = operations.map(operation => parseNumericDraft(operation.sequence, { integer: true, min: 1 }));
    if (sequences.some(sequence => sequence === null)) { setError("工序顺序须为大于 0 的安全整数"); return; }
    setBusy(true); setError("");
    const requestedScope = currentScope;
    const current = boms.find(bom => bom.productId === productId.trim());
    const routingId = `ROUTE-${key.current}`;
    try {
      const result = await productionOperationsApi.publishBom(context, {
        productId: productId.trim(), productName: productName.trim(),
        lines, routingSnapshotId: routingId,
        routingSnapshot: { id: routingId, productId: productId.trim(), operations: operations.map((operation, index) => ({ ...operation, sequence: sequences[index]! })) },
      }, current?.version, `bom-publish:${context.tenantId}:${key.current}`);
      if (scope.current !== requestedScope) return;
      setBoms(previous => [...previous.filter(bom => bom.productId !== result.productId), result]);
      setOpen(false); setMessage(`${result.productId} BOM v${result.version} 及关联工艺已生效`);
    } catch (cause) {
      if (scope.current === requestedScope) setError(cause instanceof Error ? cause.message : "发布失败");
    } finally { setBusy(false); }
  };
  return <section className="shrink-0 border-b border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h4 className="text-sm font-bold text-slate-800">生效 BOM 与工艺版本</h4>
      <div className="flex items-center gap-2">
        <button title="刷新生效版本" onClick={() => void refresh()} disabled={busy} className="p-2 text-slate-500"><RefreshCw size={16}/></button>
        <button onClick={() => edit()} disabled={!loaded || busy} className="flex items-center gap-2 rounded bg-blue-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Upload size={15}/>发布生效 BOM</button>
      </div>
    </div>
    {message && <p role="status" className="mt-2 text-xs text-emerald-700">{message}</p>}
    {error && !open && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-xs">
        <thead className="text-slate-500"><tr><th className="py-2">产品</th><th>版本</th><th>物料行</th><th>工序</th><th>状态</th><th>发布人</th><th className="text-right">操作</th></tr></thead>
        <tbody>{boms.map(bom => <tr key={bom.id} className="border-t border-slate-100">
          <td className="py-2 font-medium text-slate-800">{bom.productId} {bom.productName}</td><td>v{bom.version}</td><td>{bom.lines.length}</td>
          <td>{bom.routingSnapshot?.operations.length || 0}</td>
          <td className={bom.routingSnapshot ? "text-emerald-700" : "text-amber-700"}>{bom.routingSnapshot ? "已生效" : "待补齐工艺"}</td>
          <td>{bom.publishedBy || "—"}</td>
          <td className="text-right"><button onClick={() => edit(bom)} disabled={!loaded || busy} className="text-blue-600">修订发布</button></td>
        </tr>)}</tbody>
      </table>
      {!boms.length && <p className="py-3 text-xs text-slate-500">{loaded ? "暂无生效版本" : "正在加载生效版本"}</p>}
    </div>
    {open && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/40 p-4">
      <form role="dialog" aria-modal="true" aria-labelledby="formal-bom-title" onSubmit={event => { event.preventDefault(); void publish(); }}
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex shrink-0 items-center justify-between border-b p-4"><h3 id="formal-bom-title" className="text-sm font-bold">发布生效 BOM</h3>
          <button type="button" title="关闭" disabled={busy} onClick={() => setOpen(false)}><X size={18}/></button></header>
        <div className="overflow-y-auto p-4">
          <fieldset disabled={busy} className="min-w-0 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <label className="text-xs text-slate-600">产品编码<input aria-label="产品编码" required className={fieldClass} value={productId} onChange={event => { setProductId(event.target.value); key.current = crypto.randomUUID(); }}/></label>
              <label className="text-xs text-slate-600">产品名称<input aria-label="产品名称" required className={fieldClass} value={productName} onChange={event => { setProductName(event.target.value); key.current = crypto.randomUUID(); }}/></label>
            </div>
            <div className="flex items-center justify-between"><h4 className="text-xs font-bold">单位产品物料用量</h4>
              <button type="button" title="添加物料" onClick={() => { setLines([...lines, { materialId: "", qtyPer: "1", warehouseId: "", uom: "" }]); key.current = crypto.randomUUID(); }}><Plus size={16}/></button></div>
            {lines.map((line, index) => <div key={index} className="grid grid-cols-[1fr_1fr_1fr_90px_70px_24px] items-end gap-2">
              {(["materialId", "materialName", "warehouseId", "qtyPer", "uom"] as const).map((field, fieldIndex) => <label key={field} className="text-[11px] text-slate-500">
                {["物料编码", "物料名称", "仓库", "用量", "单位"][fieldIndex]}
                <input aria-label={`${field}-${index}`} required={field !== "materialName"} className={fieldClass} value={line[field] || ""} onChange={event => {
                  setLines(lines.map((item, row) => row === index ? { ...item, [field]: event.target.value } : item)); key.current = crypto.randomUUID();
                }}/></label>)}
              <button type="button" title="删除物料" disabled={lines.length === 1} onClick={() => { setLines(lines.filter((_, row) => row !== index)); key.current = crypto.randomUUID(); }} className="py-2 text-rose-600"><Trash2 size={14}/></button>
            </div>)}
            <div className="flex items-center justify-between"><h4 className="text-xs font-bold">关联工艺工序</h4>
              <button type="button" title="添加工序" onClick={() => { setOperations([...operations, { sequence: String((parseNumericDraft(operations[operations.length - 1]?.sequence, { integer: true }) ?? 0) + 10), code: "", name: "", workCenterResourceId: "", standardMinutes: "1" }]); key.current = crypto.randomUUID(); }}><Plus size={16}/></button></div>
            {operations.map((operation, index) => <div key={index} className="grid grid-cols-[60px_1fr_1fr_1fr_90px_24px] items-end gap-2">
              {(["sequence", "code", "name", "workCenterResourceId", "standardMinutes"] as const).map((field, fieldIndex) => <label key={field} className="text-[11px] text-slate-500">
                {["顺序", "工序编码", "工序名称", "工作中心", "分钟/件"][fieldIndex]}
                <input aria-label={`${field}-${index}`} required type={field === "sequence" ? "number" : "text"} min={field === "sequence" ? 1 : undefined} className={fieldClass} value={operation[field]} onChange={event => {
                  setOperations(operations.map((item, row) => row === index ? { ...item, [field]: event.target.value } : item)); key.current = crypto.randomUUID();
                }}/></label>)}
              <button type="button" title="删除工序" disabled={operations.length === 1} onClick={() => { setOperations(operations.filter((_, row) => row !== index)); key.current = crypto.randomUUID(); }} className="py-2 text-rose-600"><Trash2 size={14}/></button>
            </div>)}
          </fieldset>
          {error && <p role="alert" className="mt-3 text-xs text-rose-600">{error}</p>}
        </div>
        <footer className="flex shrink-0 justify-end gap-3 border-t p-4">
          <button type="button" disabled={busy} onClick={() => setOpen(false)} className="rounded border px-3 py-2 text-xs">取消</button>
          <button type="submit" disabled={busy} className="flex items-center gap-2 rounded bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><Check size={16}/>{busy ? "发布中" : "确认发布"}</button>
        </footer>
      </form>
    </div>}
  </section>;
}
