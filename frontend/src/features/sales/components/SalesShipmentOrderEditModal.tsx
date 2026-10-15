import { Check, ShoppingCart, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type ApiContext } from '../../../api/client';
import { inventoryApi } from '../../../api/fulfillment';

import { validateShipmentDeliveryDate } from '../model/salesRules';

export type SalesShipmentOrderDraft = {
  id: string;
  client: string;
  salesman: string;
  date: string;
  deliveryDate?: string;
  product?: string;
  productName?: string;
  spec?: string;
  unit?: string;
  qty?: number | string;
  unitPrice?: number | string;
  amount: string;
  originalAmount?: number | string;
  lines?: { productName?: string; spec?: string; unit?: string; quantity?: number; qty?: number; unitPrice?: number; warehouseId?: string; productId?: string }[];
  availableStock?: number | string;
  discountRate?: number | string;
  discountAmount?: number | string;
  [key: string]: unknown;
};

type Props = {
  order: SalesShipmentOrderDraft;
  mode?: 'confirm' | 'shipment';
  pending?: boolean;
  products?: Array<{ id: string; name?: string; warehouseId?: string; availQty?: number }>;
  apiContext?: ApiContext | null;
  onClose: () => void;
  onSubmit: (order: SalesShipmentOrderDraft) => void | Promise<void>;
};

const formatMoney = (value: number | string | undefined) =>
  `¥${Number(value || 0).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const parseMoney = (value: string) => Number(value.replace(/[^\d.-]/g, '')) || 0;

const WAREHOUSE_NAMES: Record<string, string> = {
  'WH-FG-01': '成品主仓',
  'WH-FG-02': '成品副仓',
  'WH-RM-01': '一号原材料仓',
  'WH-RM-02': '二号原材料仓',
  'WH-WIP-01': '线边暂存仓',
  'WH-WIP-02': '组装线边仓',
  'WH-TR-01': '去化中转仓',
};

const normalizedDate = (value?: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value! : '';

export const SalesShipmentOrderEditModal = ({ order, mode = 'confirm', pending = false, products = [], apiContext, onClose, onSubmit }: Props) => {
  const [deliveryDate, setDeliveryDate] = useState(() => normalizedDate(order.deliveryDate));
  const [error, setError] = useState('');
  const deliveryDateRef = useRef<HTMLInputElement>(null);
  const quantity = Number(order.qty || 0);
  const unitPrice = Number(order.unitPrice || parseMoney(order.amount) / Math.max(1, quantity));
  const availableStock = (() => {
    const pn = (order.lines?.[0]?.productName || order.productName || '');
    const pid = (order.lines?.[0]?.productId || order.productId || '');
    const ext = !pid && pn ? (pn.split(/\s+/)[0] || '').trim() : '';
    const eff = pid || ext;
    let m = eff ? products.find(p => p.id === eff) : undefined;
    if (!m && pn) m = products.find(p => pn.indexOf(p.name || '') >= 0);
    return m ? Number(m.availQty ?? 0) : Number(order.availableStock || 0);
  })();
  const shortage = Math.max(0, quantity - availableStock);
  const productLines = order.lines && order.lines.length > 0
    ? order.lines
    : order.productName ? [{ productName: order.productName, spec: order.spec, unit: order.unit, qty: order.qty, unitPrice: order.unitPrice }] : [];
  const [formalStock, setFormalStock] = useState<Record<number, string>>({});
  const stockRequests = JSON.stringify(productLines.map(line => ({
    warehouseId: line.warehouseId || order.fulfillmentWarehouseId || order.warehouse || 'WH-FG-01',
    productId: line.productId || order.productId || products.find(product => product.name && line.productName?.includes(product.name))?.id
      || line.productName?.split(/\s+/)[0] || '',
  })));
  useEffect(() => {
    let cancelled = false;
    setFormalStock({});
    if (!apiContext) return;
    const requests: { warehouseId: string; productId: string }[] = JSON.parse(stockRequests);
    void Promise.all(requests.map(async ({ warehouseId, productId }, index) => {
      try {
        const facts = await inventoryApi.getAvailability(apiContext, warehouseId, [productId]);
        return [index, facts.find(fact => fact.productId === productId)?.fulfillableQty ?? '未提供'] as const;
      } catch { return [index, '读取失败'] as const; }
    })).then(entries => { if (!cancelled) setFormalStock(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [apiContext?.tenantId, apiContext?.accessToken, stockRequests]);
  const originalAmount = useMemo(
    () => formatMoney(order.originalAmount ?? (productLines.length > 0 ? productLines.reduce((sum, l) => sum + Number(l.qty || (l as any).quantity || 0) * Number(l.unitPrice || 0), 0) : quantity * unitPrice)),
    [order.originalAmount, quantity, unitPrice, productLines],
  );

  const submit = () => {
    const submittedDeliveryDate = deliveryDateRef.current?.value || deliveryDate;
    const validationError = validateShipmentDeliveryDate(order.date, submittedDeliveryDate);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setDeliveryDate(submittedDeliveryDate);
    void onSubmit({ ...order, deliveryDate: submittedDeliveryDate });
  };

  const updateDeliveryDate = (value: string) => {
    setDeliveryDate(value);
    if (error) setError('');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-sm sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-shipment-edit-title"
        className="flex max-h-[92vh] w-[1040px] max-w-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <ShoppingCart size={19} />
            </span>
            <div className="min-w-0">
              <h2 id="sales-shipment-edit-title" className="text-[17px] font-bold text-slate-800">{mode === 'confirm' ? '确认销售发货内容' : '编辑订单'}</h2>
              <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{order.id}</p>
            </div>
          </div>
          <button type="button" aria-label="关闭编辑订单" title="关闭" disabled={pending} onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 py-6 sm:px-7">
          <section aria-labelledby="shipment-basic-title">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-blue-500" />
              <h3 id="shipment-basic-title" className="text-[15px] font-bold text-slate-800">基本信息</h3>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-4 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 sm:p-5">
              <label className="block text-[12px] font-bold text-slate-600">
                客户 <span className="text-rose-500">*</span>
                <input value={order.client} readOnly className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none" />
              </label>
              <label className="block text-[12px] font-bold text-slate-600">
                销售人员
                <input value={order.salesman} readOnly className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-700 outline-none" />
              </label>
              <label className="block text-[12px] font-bold text-slate-600">
                订单日期 <span className="text-rose-500">*</span>
                <input type="date" value={normalizedDate(order.date)} readOnly className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 font-mono text-[13px] text-slate-700 outline-none" />
              </label>
              <label className="block text-[12px] font-bold text-slate-600">
                交期 <span className="text-rose-500">*</span>
                <input
                  ref={deliveryDateRef}
                  autoFocus
                  type="date"
                  min={normalizedDate(order.date) || undefined}
                  value={deliveryDate}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? 'shipment-delivery-error' : undefined}
                  onInput={(event) => updateDeliveryDate(event.currentTarget.value)}
                  onChange={(event) => updateDeliveryDate(event.target.value)}
                  className={`mt-2 h-10 w-full rounded-lg border bg-white px-3 font-mono text-[13px] text-slate-800 outline-none focus:ring-2 ${error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                />
                {error && <span id="shipment-delivery-error" role="alert" className="mt-1.5 block text-[11px] font-medium text-rose-600">{error}</span>}
              </label>
            </div>
          </section>

          <section aria-labelledby="shipment-product-title">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-blue-500" />
              <h3 id="shipment-product-title" className="text-[15px] font-bold text-slate-800">产品明细</h3>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[920px] text-left text-[12px]">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">仓库</th>
                    <th className="px-4 py-3 font-medium">产品</th>
                    <th className="px-4 py-3 font-medium">规格型号</th>
                    <th className="px-4 py-3 text-center font-medium">单位</th>
                    <th className="px-4 py-3 text-center font-medium">可用量</th>
                    <th className="px-4 py-3 text-center font-medium">数量</th>
                    <th className="px-4 py-3 text-right font-medium">单价</th>
                    <th className="px-4 py-3 text-right font-medium">金额</th>
                  </tr>
                </thead>
                <tbody>
                  {productLines.map((line, idx) => {
                    const lineQty = Number(line.qty || line.quantity || 0);
                    const linePrice = Number(line.unitPrice || 0);
                    const lineAmount = lineQty * linePrice;
                    const lineWarehouseId = (line as any).warehouseId || (order as any).warehouse || (order as any).fulfillmentWarehouseId || '';
                    const lineWarehouseName = WAREHOUSE_NAMES[lineWarehouseId] || lineWarehouseId || '成品主仓';
                    const lineProductName = line.productName || (order as any).productName || '';
                    const rawProductId = (line as any).productId || (order as any).productId || '';
                    const extractedProductId = !rawProductId && lineProductName ? (lineProductName.split(/\s+/)[0] || '').trim() : '';
                    const effectiveProductId = rawProductId || (extractedProductId && products.find((p) => p.id === extractedProductId) ? extractedProductId : '');
                    let matchedStock = effectiveProductId ? products.find((p) => p.id === effectiveProductId && (!lineWarehouseId || p.warehouseId === lineWarehouseId)) : undefined;
                    if (!matchedStock && effectiveProductId) matchedStock = products.find((p) => p.id === effectiveProductId);
                    if (!matchedStock && lineProductName) matchedStock = products.find((p) => lineProductName.indexOf(p.name || '') >= 0 || p.name === lineProductName);
                    const lineAvail = matchedStock ? Number(matchedStock.availQty ?? 0) : ((line as any).available != null ? Number((line as any).available) : (idx === 0 ? availableStock : ((line as any).availableStock != null ? Number((line as any).availableStock) : null)));
                    return (
                      <tr key={idx}>
                        <td className="px-4 py-4 text-slate-600">{lineWarehouseName}</td>
                        <td className="px-4 py-4 font-bold text-slate-800">{line.productName || '-'}</td>
                        <td className="px-4 py-4 text-slate-600">{line.spec || '-'}</td>
                        <td className="px-4 py-4 text-center text-slate-600">{line.unit || '件'}</td>
                        <td className={`px-4 py-4 text-center font-mono font-bold ${apiContext ? 'text-slate-700' : idx === 0 && shortage > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{apiContext ? formalStock[idx] ?? '读取中' : lineAvail != null ? lineAvail : '-'}</td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-slate-700">{lineQty}</td>
                        <td className="px-4 py-4 text-right font-mono text-slate-700">{formatMoney(linePrice)}</td>
                        <td className="px-4 py-4 text-right font-mono font-bold text-slate-800">{formatMoney(lineAmount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="shipment-discount-title">
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1.5 rounded-full bg-blue-500" />
              <h3 id="shipment-discount-title" className="text-[15px] font-bold text-slate-800">优惠设置</h3>
            </div>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
              {[
                ['原价', originalAmount],
                ['折扣率', `${order.discountRate ?? 100}%`],
                ['优惠金额', formatMoney(order.discountAmount || 0)],
                ['订单金额', order.amount],
              ].map(([label, value]) => (
                <div key={label} className="bg-white px-4 py-3.5">
                  <div className="text-[11px] text-slate-400">{label}</div>
                  <div className={`mt-1.5 font-mono text-[13px] font-bold ${label === '订单金额' ? 'text-blue-700' : 'text-slate-700'}`}>{value}</div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
          <button type="button" disabled={pending} onClick={onClose} className="h-10 rounded-lg border border-slate-200 bg-white px-5 text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">取消</button>
          <button type="button" disabled={pending} onClick={submit} className="inline-flex h-10 items-center gap-2 rounded-lg bg-blue-600 px-5 text-[13px] font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {pending ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <Check size={15} />}
            {pending ? (mode === 'confirm' ? '正在确认订单' : '正在发起发货') : (mode === 'confirm' ? '确认订单' : '保存并去发货')}
          </button>
        </div>
      </div>
    </div>
  );
};
