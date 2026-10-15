import { useState } from "react";
import { X, Save } from "lucide-react";
import type { WorkOrderDto, ReportQuantities } from "../../../api/production/operations";

export function ProductionReportModal({ order, onClose, onSubmit }: {
  order: WorkOrderDto; onClose: () => void; onSubmit: (quantities: ReportQuantities) => Promise<boolean>;
}) {
  const remaining = Number(order.plannedQty) - Number(order.reportedGoodQty) - Number(order.reportedDefectQty) - Number(order.reportedScrapQty);
  const [values, setValues] = useState<ReportQuantities>({ goodQty: String(remaining), defectQty: "0", scrapQty: "0", inputQty: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (![values.goodQty, values.defectQty, values.scrapQty, values.inputQty].every(value => /^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value))) {
      setError("数量必须为非负数，最多六位小数"); return;
    }
    const total = Number(values.goodQty) + Number(values.defectQty) + Number(values.scrapQty);
    if (total <= 0 || total > remaining) { setError(`本次报工合计必须大于 0 且不超过 ${remaining}`); return; }
    setBusy(true);
    try { if (await onSubmit(values)) onClose(); } finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="production-report-title" className="bg-white rounded-lg w-full max-w-md p-5 shadow-xl">
      <div className="flex items-center justify-between mb-4"><h3 id="production-report-title" className="font-bold text-slate-800">登记报工 · {order.code}</h3>
        <button title="关闭" onClick={onClose} disabled={busy}><X size={18}/></button></div>
      <p className="text-sm text-slate-500 mb-4">剩余可报 {remaining} {order.uom}</p>
      <div className="grid grid-cols-2 gap-4">{([
        ["goodQty", "良品数量"], ["defectQty", "不良品数量"], ["scrapQty", "报废数量"], ["inputQty", "新增投入数量"],
      ] as const).map(([key, label]) => <label key={key} className="text-sm text-slate-700">{label}<input aria-label={label}
        inputMode="decimal" value={values[key]} disabled={busy} onChange={event => setValues({...values, [key]: event.target.value})}
        className="block mt-1 border rounded-lg p-2 w-full" /></label>)}</div>
      {error && <p role="alert" className="text-sm text-rose-600 mt-3">{error}</p>}
      <button disabled={busy} onClick={submit} className="mt-5 bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">
        <Save size={16}/>{busy ? "提交中" : "确认报工"}</button>
    </section>
  </div>;
}
