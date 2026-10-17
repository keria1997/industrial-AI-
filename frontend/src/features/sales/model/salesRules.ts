export const salesTabs = ['dashboard', 'quotes', 'orders', 'rma', 'receipts', 'customers', 'basic-data'] as const;

export type SalesTab = (typeof salesTabs)[number];

export const salesOrderStatuses = ['待发货', '已确认', '生产中', '部分发货', '已发货', '已完成', '已取消'] as const;

export type SalesOrderStatus = (typeof salesOrderStatuses)[number];

export type SalesOrderAction =
  | 'edit'
  | 'review'
  | 'confirm'
  | 'requestShipment'
  | 'outbound'
  | 'expedite'
  | 'complete'
  | 'duplicate'
  | 'cancel'
  | 'rollback';

export type SalesQuoteForConversion = {
  id: string;
  client: string;
  date?: string;
  product?: string;
  productName?: string;
  productId?: string;
  spec?: string;
  unit?: string;
  qty: number | string;
  unitPrice?: number | string;
  discountRate?: number | string;
  discountAmount?: number | string;
  amount: string;
  validUntil: string;
  remark?: string;
  lines?: SalesQuoteLineForConversion[];
  version?: number | string;
  status?: string;
  convertedOrderId?: string;
};

export type SalesQuoteLineForConversion = {
  warehouseId?: string;
  productId?: string;
  productName: string;
  spec?: string;
  unit?: string;
  available?: number | string | null;
  quantity?: number | string;
  qty?: number | string;
  unitPrice?: number | string;
};

export type QuoteConversionContext = {
  orderId: string;
  salesman: string;
  approvedAt: string;
};

export const resolveSalesTab = (search: string): SalesTab => {
  const requestedTab = new URLSearchParams(search).get('tab');
  return salesTabs.includes(requestedTab as SalesTab) ? requestedTab as SalesTab : 'dashboard';
};

export const createSalesTabUrl = (
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  tab: SalesTab,
) => {
  const searchParams = new URLSearchParams(location.search);
  searchParams.set('module', 'sales');
  if (tab === 'dashboard') searchParams.delete('tab');
  else searchParams.set('tab', tab);
  searchParams.delete('inventory');
  searchParams.delete('sourceOrder');
  searchParams.delete('platform');
  searchParams.delete('production');
  if (tab !== 'orders') searchParams.delete('focusOrder');
  const search = searchParams.toString();
  return `${location.pathname}${search ? `?${search}` : ''}${location.hash}`;
};

export const getQuoteStatus = (validUntil: string, now = new Date(), convertedOrderId = '') => {
  if (convertedOrderId) return '已转订单' as const;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) return '已过期' as const;
  const expiresAt = new Date(`${validUntil}T23:59:59`);
  return expiresAt.getTime() < now.getTime() ? '已过期' as const : '正常' as const;
};

export const isQuoteConvertible = (quote: SalesQuoteForConversion, now = new Date()) =>
  quote.status !== '已转订单'
  && !quote.convertedOrderId
  && getQuoteStatus(quote.validUntil, now) === '正常';

export const createPendingSalesOrderFromQuote = (
  quote: SalesQuoteForConversion,
  context: QuoteConversionContext,
) => {
  const approvedAt = new Date(context.approvedAt);
  if (!isQuoteConvertible(quote, approvedAt)) {
    throw new Error('只有正常、未过期且未转单的报价可以审批确认');
  }
  const lines: SalesQuoteLineForConversion[] = quote.lines?.length
    ? quote.lines.map((line) => ({
        warehouseId: line.warehouseId || '',
        productId: line.productId || '',
        productName: line.productName.trim(),
        spec: line.spec || '',
        unit: line.unit || '件',
        available: line.available ?? null,
        quantity: Number(line.quantity ?? line.qty ?? 0),
        unitPrice: Number(line.unitPrice || 0),
      }))
    : [{
        warehouseId: '',
        productId: quote.productId || '',
        productName: quote.productName?.trim() || '',
        spec: quote.spec || '',
        unit: quote.unit || '件',
        available: null,
        quantity: Number(quote.qty),
        unitPrice: Number(quote.unitPrice || 0),
      }];
  const invalidLine = lines.find((line) => !line.productName.trim()
    || !Number.isFinite(Number(line.quantity))
    || Number(line.quantity) <= 0
    || !Number.isFinite(Number(line.unitPrice))
    || Number(line.unitPrice) < 0);
  if (!quote.id || !quote.client.trim() || invalidLine || !quote.amount) {
    throw new Error('报价的客户、产品、数量或金额不完整');
  }
  const firstLine = lines[0];
  const quantity = lines.reduce((total, line) => total + Number(line.quantity), 0);
  const product = lines.length === 1
    ? `${firstLine.productName}${firstLine.spec ? ` / ${firstLine.spec}` : ''} × ${firstLine.quantity} ${firstLine.unit}`
    : `${firstLine.productName} 等 ${lines.length} 项产品`;
  const quoteDate = quote.date || context.approvedAt.slice(0, 10);
  const sourceQuoteVersion = Number(quote.version || 1);
  const quoteSnapshot = {
    id: quote.id,
    version: sourceQuoteVersion,
    client: quote.client,
    date: quoteDate,
    validUntil: quote.validUntil,
    lines: lines.map((line) => ({ ...line })),
    discountRate: Number(quote.discountRate ?? 100),
    discountAmount: Number(quote.discountAmount || 0),
    amount: quote.amount,
    remark: quote.remark || '',
  };

  return {
    id: context.orderId,
    sourceQuoteId: quote.id,
    sourceQuoteVersion,
    sourceQuoteDate: quoteDate,
    sourceQuoteValidUntil: quote.validUntil,
    quoteSnapshot,
    quoteApprovedAt: context.approvedAt,
    quoteApprovedBy: context.salesman,
    quoteApprovalStatus: '已审批',
    confirmationStatus: '待发货',
    client: quote.client,
    salesman: context.salesman,
    productId: firstLine.productId || '',
    product,
    productName: firstLine.productName,
    spec: firstLine.spec || '',
    unit: firstLine.unit || '件',
    qty: quantity,
    unitPrice: Number(firstLine.unitPrice || 0),
    lines: lines.map((line) => ({ ...line })),
    discountRate: Number(quote.discountRate ?? 100),
    discountAmount: Number(quote.discountAmount || 0),
    amount: quote.amount,
    remark: quote.remark || '',
    receivable: '待生成',
    date: quoteDate,
    deliveryDate: '待确认',
    outStatus: '未发货',
    status: '待发货',
    createdAt: context.approvedAt,
    updatedAt: context.approvedAt,
  } as const;
};

export const isSalesOrderEditable = (status: string, outboundStatus: string) =>
  status === '待发货' && outboundStatus === '未发货';

export const validateShipmentDeliveryDate = (orderDate: string, deliveryDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate)) return '请选择交期';
  if (/^\d{4}-\d{2}-\d{2}$/.test(orderDate) && deliveryDate < orderDate) {
    return '交期不能早于订单日期';
  }
  return '';
};

export const getSalesOrderActions = (
  status: string,
  outboundStatus = '',
  reviewStatus = '',
  isFormalOrder = false,
): SalesOrderAction[] => {
  switch (status) {
    case '待发货':
      if (isFormalOrder) {
        if (outboundStatus === '已移交仓库') return ['outbound', 'duplicate'];
        if (reviewStatus === 'PENDING') return ['review', 'duplicate', 'cancel'];
        if (['APPROVED', 'NOT_REQUIRED'].includes(reviewStatus)) {
          return ['confirm', 'duplicate', 'cancel'];
        }
        return ['duplicate'];
      }
      return [
        ...(isSalesOrderEditable(status, outboundStatus) ? ['edit' as const] : []),
        ...(outboundStatus === '未发货' ? ['confirm' as const] : []),
        'duplicate',
        'cancel',
      ];
    case '已确认':
      if (outboundStatus === '未发货') return ['outbound', 'rollback', 'cancel'];
      if (outboundStatus === '库存不足') return ['outbound', 'rollback', 'cancel'];
      return ['outbound'];
    case '部分发货':
      return ['outbound'];
    case '生产中':
    case '生产补货中':
      return ['expedite'];
    case '已发货':
      return ['complete'];
    case '已完成':
    case '已取消':
    default:
      return [];
  }
};
