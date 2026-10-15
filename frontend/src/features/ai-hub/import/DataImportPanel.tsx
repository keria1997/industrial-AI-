import { useMemo, useState, useCallback } from 'react';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, X, Loader2 } from 'lucide-react';
import type { ApiContext } from '../../../api/client';
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

  const activeConfig = useMemo(() => allImportConfigs.find(c => c.entityType === entityType)!, [entityType]);
  const availableConfigs = useMemo(() => {
    if (!allowedEntities || allowedEntities.length === 0) return allImportConfigs;
    return allImportConfigs.filter(c => allowedEntities.includes(c.entityType));
  }, [allowedEntities]);

  const loadFile = useCallback(async (selectedFile: File) => {
    setParseError('');
    setCsv(null);
    setResult(null);
    try {
      const text = await readFileAsText(selectedFile);
      const parsed = parseCsvText(text, selectedFile.name);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setParseError('文件为空或格式不正确，请检查后重试。');
        return;
      }
      setCsv(parsed);
      // Try auto-detect entity type from headers (rule-based first for quick match)
      let matchedConfig = availableConfigs[0];
      for (const config of availableConfigs) {
        const suggested = suggestMapping(parsed.headers, config);
        const matchedRequired = config.fields.filter(f => f.required && suggested[f.field]).length;
        if (matchedRequired === config.fields.filter(f => f.required).length) {
          matchedConfig = config;
      setEntityType(config.entityType as ImportEntityType);
          setMapping(suggested);
          break;
        }
      }
      // Try LLM for smarter mapping
      if (apiContext) {
        try {
          const response = await aiApi.mapColumns(apiContext, {
            fields: matchedConfig.fields.map(f => ({ field: f.field, label: f.label, required: f.required })),
            csvHeaders: parsed.headers,
            sampleRows: parsed.rows.slice(0, 3),
            entityType: matchedConfig.entityType,
          });
          if (response.source === 'llm' && Object.keys(response.mapping).length > 0) {
            setMapping(prev => ({ ...prev, ...response.mapping }));
            setMappingSource('llm');
            return;
          }
        } catch { /* fall through to rule-based */ }
      }
      setMappingSource('rule');
      if (Object.keys(suggestMapping(parsed.headers, matchedConfig)).length === 0) {
        setMapping(suggestMapping(parsed.headers, availableConfigs[0]));
      }
    } catch {
      setParseError('文件读取失败，请确认文件格式为 UTF-8 编码的 CSV。');
    }
  }, [apiContext, availableConfigs]);

  useMemo(() => { void loadFile(file); }, [file, loadFile]);

  const handleEntityTypeChange = (newType: ImportEntityType) => {
      setEntityType(newType as ImportEntityType);
      if (csv) setMapping(suggestMapping(csv.headers, availableConfigs.find(c => c.entityType === newType) ?? allImportConfigs[0]));
  };

  const handleImport = async () => {
    if (!csv || !apiContext || importing) return;
    setImporting(true);
    setResult(null);
    const importResult: ImportResult = { total: csv.rows.length, success: 0, failed: 0, errors: [] };
    for (let index = 0; index < csv.rows.length; index++) {
      const row = csv.rows[index];
      const rowErrors = validateRow(row, mapping, activeConfig);
      if (rowErrors.length > 0) {
        importResult.failed++;
        importResult.errors.push({ row: index + 2, message: rowErrors.map(e => e.message).join('；') });
        continue;
      }
      try {
        const payload: Record<string, string> = {};
        for (const fieldDef of activeConfig.fields) {
          const column = mapping[fieldDef.field];
          if (column && row[column]?.trim()) payload[fieldDef.field] = row[column].trim();
        }
        if (entityType === 'warehouse') {
          await inventoryApi.createWarehouse(apiContext, payload as Parameters<typeof inventoryApi.createWarehouse>[1]);
        } else if (entityType === 'product') {
          await inventoryApi.createProduct(apiContext, payload as Parameters<typeof inventoryApi.createProduct>[1]);
        } else if (entityType === 'inventoryFact') {
          const quantity = (field: string) => payload[field]?.trim() || '0';
          await inventoryApi.importAvailability(apiContext, {
            eventId: crypto.randomUUID(),
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
          });
        } else {
          await inventoryApi.createMaterial(apiContext, payload as Parameters<typeof inventoryApi.createMaterial>[1]);
        }
        importResult.success++;
      } catch (error) {
        importResult.failed++;
        importResult.errors.push({ row: index + 2, message: error instanceof Error ? error.message : '导入失败' });
      }
    }
    setResult(importResult);
    setImporting(false);
    const summary = `导入完成：${activeConfig.label} 共 ${importResult.total} 条，成功 ${importResult.success} 条，失败 ${importResult.failed} 条${importResult.errors.length > 0 ? `（首条错误：第 ${importResult.errors[0].row} 行 ${importResult.errors[0].message}）` : ''}`;
    onComplete(summary);
  };

  const requiredMissing = activeConfig.fields.filter(f => f.required && !mapping[f.field]);
  const canImport = csv && !importing && requiredMissing.length === 0 && !result;

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
                disabled={importing}
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
                      onChange={(e) => setMapping(prev => ({ ...prev, [fieldDef.field]: e.target.value }))}
                      disabled={importing}
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
              <div className={`rounded-lg px-3 py-2 text-[11px] ${result.failed === 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                <div className="flex items-center gap-1.5 font-bold">
                  {result.failed === 0 ? <CheckCircle2 size={13}/> : <AlertTriangle size={13}/>}
                  成功 {result.success} / 共 {result.total}
                </div>
                {result.errors.slice(0, 3).map((e, i) => (
                  <div key={i} className="mt-1 text-[10px]">第 {e.row} 行：{e.message}</div>
                ))}
              </div>
            )}

            {!result && (
              <button
                type="button"
                onClick={handleImport}
                disabled={!canImport}
                className="w-full h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? <><Loader2 size={13} className="animate-spin"/> 正在导入...</> : <>确认导入 {csv.rows.length} 条{activeConfig.label}</>}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
