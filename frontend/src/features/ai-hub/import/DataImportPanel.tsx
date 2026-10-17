import { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import { ApiError, apiContextScope, type ApiContext } from '../../../api/client';
import { inventoryApi } from '../../../api/fulfillment';
import { aiApi } from '../../../api/ai';
import { parseCsvText, readFileAsText, type ParsedCsv } from './csvParser';
import { allImportConfigs, suggestMapping, validateRow, type ImportEntityType } from './importConfig';

type Props = {
  file: File;
  apiContext: ApiContext | null;
  allowedEntities?: string[];
  onClose: () => void;
  onComplete: (summary: string) => void;
};

type ImportResult = {
  total: number;
  success: number;
  failed: number;
  uncertain: number;
  errors: Array<{ row: number; message: string }>;
};

export const DataImportPanel = ({ file, apiContext, allowedEntities, onClose, onComplete }: Props) => {
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [entityType, setEntityType] = useState<ImportEntityType>('warehouse');
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [mappingSource, setMappingSource] = useState<'llm' | 'rule' | ''>('');
  const [started, setStarted] = useState(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const active = useRef(true);
  const attempts = useRef(new Map<number, { key: string; eventId: string; done: boolean }>());
  const scope = apiContextScope(apiContext);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const mappingRevision = useRef(0);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; generation.current += 1; };
  }, []);

  const activeConfig = useMemo(() => allImportConfigs.find(c => c.entityType === entityType)!, [entityType]);
  const availableConfigs = useMemo(() => {
    return allImportConfigs.filter(c => allowedEntities?.includes(c.entityType));
  }, [allowedEntities]);
  const authorizedTypes = availableConfigs.map(config => config.entityType).join(',');

  useEffect(() => {
    const revision = ++generation.current;
    let cancelled = false;
    const current = () => !cancelled && active.current && generation.current === revision && scopeRef.current === scope;
    setParseError('');
    setCsv(null);
    setResult(null);
    setMapping({});
    setMappingSource('');
    setStarted(false);
    setImporting(false);
    pending.current = false;
    attempts.current.clear();
    if (!availableConfigs.length) { setParseError('无可用的导入权限'); return; }
    if (!/\.csv$/i.test(file.name)) { setParseError('当前仅支持 UTF-8 CSV 文件'); return; }
    const loadFile = async () => {
     try {
      const text = await readFileAsText(file);
      if (!current()) return;
      const parsed = parseCsvText(text, file.name);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError('文件为空或格式不正确，请检查后重试。');
        return;
      }
      setCsv(parsed);
      let matchedConfig = availableConfigs[0];
      for (const config of availableConfigs) {
        const suggested = suggestMapping(parsed.headers, config);
        const matchedRequired = config.fields.filter(f => f.required && suggested[f.field]).length;
        if (matchedRequired === config.fields.filter(f => f.required).length) {
          matchedConfig = config; break;
        }
      }
      setEntityType(matchedConfig.entityType);
      setMapping(suggestMapping(parsed.headers, matchedConfig));
      setMappingSource('rule');
      const requestedMapping = mappingRevision.current;
      // Browser -> business API -> AI service. Late mapping suggestions cannot replace manual edits.
      if (apiContext) {
        try {
          const response = await aiApi.mapColumns(apiContext, {
            fields: matchedConfig.fields.map(f => ({ field: f.field, label: f.label, required: f.required })),
            csvHeaders: parsed.headers,
            sampleRows: parsed.rows.slice(0, 3),
            entityType: matchedConfig.entityType,
          });
          if (!current() || mappingRevision.current !== requestedMapping) return;
          if (response.source === 'llm' && response.mapping && Object.keys(response.mapping).length > 0) {
            const safeMapping = Object.fromEntries(Object.entries(response.mapping).filter(([field, header]) =>
              matchedConfig.fields.some(item => item.field === field) && parsed.headers.includes(header)));
            setMapping(prev => ({ ...prev, ...safeMapping }));
            setMappingSource('llm');
            return;
          }
        } catch { /* fall through to rule-based */ }
      }
    } catch {
      if (current()) setParseError('文件读取失败，请确认文件格式为 UTF-8 编码的 CSV。');
    }
    };
    void loadFile();
    return () => { cancelled = true; };
  }, [file, scope, authorizedTypes]);

  const handleEntityTypeChange = (newType: ImportEntityType) => {
      if (started || !availableConfigs.some(config => config.entityType === newType)) return;
      mappingRevision.current += 1;
      setEntityType(newType as ImportEntityType);
      setMappingSource('rule');
      if (csv) setMapping(suggestMapping(csv.headers, availableConfigs.find(c => c.entityType === newType)!));
  };

  const handleImport = async () => {
    if (!csv || !apiContext || pending.current || !availableConfigs.some(config => config.entityType === entityType)) return;
    const requestScope = scope;
    const revision = generation.current;
    const current = () => active.current && scopeRef.current === requestScope && generation.current === revision;
    mappingRevision.current += 1;
    pending.current = true;
    setImporting(true);
    setStarted(true);
    setResult(null);
    const importResult: ImportResult = { total: csv.rows.length, success: 0, failed: 0, uncertain: 0, errors: [] };
    for (let index = 0; index < csv.rows.length; index++) {
      if (!current()) return;
      if (attempts.current.get(index)?.done) { importResult.success++; continue; }
      const row = csv.rows[index];
      const rowErrors = validateRow(row, mapping, activeConfig);
      if (rowErrors.length > 0) {
        importResult.failed++;
        importResult.errors.push({ row: index + 2, message: rowErrors.map(e => e.message).join('；') });
        continue;
      }
      let attempt = attempts.current.get(index);
      if (!attempt) {
        attempt = { key: crypto.randomUUID(), eventId: crypto.randomUUID(), done: false };
        attempts.current.set(index, attempt);
      }
      try {
        const payload: Record<string, string> = {};
        for (const fieldDef of activeConfig.fields) {
          const column = mapping[fieldDef.field];
          if (column && row[column]?.trim()) payload[fieldDef.field] = row[column].trim();
        }
        if (payload.defaultWarehouseId) {
          const warehouses = await inventoryApi.listWarehouses(apiContext);
          if (!current()) return;
          if (!warehouses.items.some(item => item.id === payload.defaultWarehouseId && item.status === 'active')) {
            throw new ApiError('库存仓库ID不在当前授权的启用仓库中', 422, 'INVALID_WAREHOUSE');
          }
        }
        if (entityType === 'warehouse') {
          await inventoryApi.createWarehouse(apiContext, payload as Parameters<typeof inventoryApi.createWarehouse>[1], attempt.key);
        } else if (entityType === 'product') {
          await inventoryApi.createProduct(apiContext, payload as Parameters<typeof inventoryApi.createProduct>[1], attempt.key);
        } else if (entityType === 'inventoryFact') {
          const quantity = (field: string) => payload[field]?.trim() || '0';
          await inventoryApi.importAvailability(apiContext, {
            eventId: attempt.eventId,
            warehouseId: payload.warehouseId,
            productId: payload.productId,
            qualifiedOnHandQty: quantity('qualifiedOnHandQty'),
            allocatedReservedQty: quantity('allocatedReservedQty'),
            frozenQty: quantity('frozenQty'),
            safetyStockQty: quantity('safetyStockQty'),
            inTransitQty: quantity('inTransitQty'),
            fulfillableQty: quantity('fulfillableQty'),
            uom: payload.uom,
            formulaVersion: 'FULFILLABLE-V1',
            factVersion: Number(payload.factVersion),
            asOf: payload.asOf,
            sourceSystem: payload.sourceSystem || 'CUSTOMER_WMS',
          }, attempt.key);
        } else {
          await inventoryApi.createMaterial(apiContext, payload as Parameters<typeof inventoryApi.createMaterial>[1], attempt.key);
        }
        if (!current()) return;
        attempt.done = true;
        importResult.success++;
      } catch (error) {
        if (!current()) return;
        const unknown = !(error instanceof ApiError) || error.status >= 500 || [408, 429].includes(error.status);
        if (unknown) importResult.uncertain++; else importResult.failed++;
        importResult.errors.push({ row: index + 2, message: `${unknown ? '结果待核实：' : ''}${error instanceof Error ? error.message : '导入失败'}` });
      }
    }
    if (!current()) return;
    pending.current = false;
    setResult(importResult);
    setImporting(false);
    const summary = `导入结果：${activeConfig.label} 共 ${importResult.total} 条，成功 ${importResult.success} 条，失败 ${importResult.failed} 条，待核实 ${importResult.uncertain} 条${importResult.errors.length > 0 ? `（首条错误：第 ${importResult.errors[0].row} 行 ${importResult.errors[0].message}）` : ''}`;
    onComplete(summary);
  };

  const requiredMissing = activeConfig.fields.filter(f => f.required && !mapping[f.field]);
  const canImport = csv && apiContext && availableConfigs.some(config => config.entityType === entityType)
    && !importing && requiredMissing.length === 0 && (!result || result.success < result.total);

  return (
    <div className="border border-blue-200 rounded-xl bg-blue-50/50 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-blue-100">
        <div className="flex items-center gap-2 text-[12px] font-bold text-blue-700">
          <FileSpreadsheet size={14} />
          数据导入 - {file.name}
        </div>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={14}/></button>
      </div>
      <div className="px-4 py-3 space-y-3">
        {parseError && (
          <div className="flex items-center gap-2 text-[11px] text-rose-600 bg-rose-50 rounded-lg px-3 py-2">
            <AlertTriangle size={13}/> {parseError}
          </div>
        )}
        {csv && (
          <>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">导入类型</label>
              <select
                value={entityType}
                onChange={(e) => handleEntityTypeChange(e.target.value as ImportEntityType)}
                disabled={importing || started}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] text-slate-700"
              >
                {availableConfigs.map(c => <option key={c.entityType} value={c.entityType}>{c.label}</option>)}
              </select>
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1.5">列映射</div>
              <div className="space-y-1">
                {activeConfig.fields.map(fieldDef => (
                  <div key={fieldDef.field} className="flex items-center gap-2 text-[11px]">
                    <span className="w-20 text-slate-600 shrink-0">{fieldDef.label}{fieldDef.required && <span className="text-rose-500"> *</span>}</span>
                    <select
                      value={mapping[fieldDef.field] ?? ''}
                      onChange={(e) => { mappingRevision.current += 1; setMapping(prev => ({ ...prev, [fieldDef.field]: e.target.value })); }}
                      disabled={importing || started}
                      className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                    >
                      <option value="">（不导入）</option>
                      {csv.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              {requiredMissing.length > 0 && (
                <div className="mt-2 text-[10px] text-amber-600">
                  必填列未映射：{requiredMissing.map(f => f.label).join('、')}
                </div>
              )}
            </div>

            <div>
              <div className="text-[11px] font-bold text-slate-500 mb-1">
                数据预览（共 {csv.rows.length} 条，显示前 3 条）
              </div>
              <div className="border border-slate-200 rounded-lg overflow-x-auto max-h-[120px] overflow-y-auto">
                <table className="w-full text-left text-[10px]">
                  <thead className="bg-slate-50 text-slate-400 border-b border-slate-100">
                    <tr>{csv.headers.map(h => <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {csv.rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="border-b border-slate-50 last:border-0">
                        {csv.headers.map(h => <td key={h} className="px-2 py-1 text-slate-600 whitespace-nowrap max-w-[100px] truncate">{row[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {result && (
              <div className={`rounded-lg px-3 py-2 text-[11px] ${result.failed === 0 && result.uncertain === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {result.failed === 0 && result.uncertain === 0 ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>}
                  成功 {result.success} / 共 {result.total} · 失败 {result.failed} · 待核实 {result.uncertain}
                </div>
                {result.errors.slice(0, 3).map((e, i) => (
                  <div key={i} className="mt-1 text-[10px]">第 {e.row} 行：{e.message}</div>
                ))}
              </div>
            )}

            {(!result || result.success < result.total) && (
              <button
                type="button"
                onClick={handleImport}
                disabled={!canImport}
                className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <><Loader2 size={13} className="animate-spin"/> 正在导入...</> : result ? '按原请求重试未成功行' : <>确认导入 {csv.rows.length} 条{activeConfig.label}</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
