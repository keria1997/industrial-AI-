import type { ApiContext, FulfillmentOrder } from '../../../api/fulfillment';
import { createFulfillmentOrder } from '../../../api/fulfillment';
import { salesOrderPricingInput } from './salesOrderPricing';
import type { SalesQuoteForConversion } from './salesRules';

type Warehouse = { id: string; code?: string };
type Customer = { id: string; name: string; contact?: string; phone?: string; address?: string };

type QuickSalesOrderOptions = {
  warehouses: Warehouse[];
  customers: Customer[];
  ownerEmployeeId?: string;
  factoryResourceId?: string;
  idempotencyKey: string;
  today?: string;
};

/** Validate the complete draft before starting an idempotent network attempt. */
export const quickSalesOrderInput = (
  draft: SalesQuoteForConversion,
  options: QuickSalesOrderOptions,
) => {
  const lines = draft.lines || [];
  if (!lines.length) throw new Error('请至少添加一个产品');
  const warehouse = lines[0].warehouseId && options.warehouses.find(item =>
    item.id === lines[0].warehouseId || item.code === lines[0].warehouseId);
  if (!warehouse) throw new Error('所选发货仓库不可用，请重新选择仓库');
  if (lines.some(line => !line.warehouseId
    || (line.warehouseId !== warehouse.id && line.warehouseId !== warehouse.code))) {
    throw new Error('同一销售订单请选择同一个发货仓库');
  }
  const invalidLine = lines.some(line => !line.productId
    || !Number.isFinite(Number(line.quantity))
    || Number(line.quantity) <= 0
    || !Number.isFinite(Number(line.unitPrice))
    || Number(line.unitPrice) <= 0);
  if (invalidLine) throw new Error('每个产品需选择仓库、产品并填写有效数量和单价');
  const matchingCustomers = options.customers.filter(item => item.name === draft.client);
  if (matchingCustomers.length !== 1) throw new Error('请选择客户列表中唯一匹配的客户');
  const customer = matchingCustomers[0];
  const ownerEmployeeId = draft.ownerEmployeeId || options.ownerEmployeeId;
  const factoryResourceId = draft.factoryResourceId || options.factoryResourceId;
  if (!ownerEmployeeId || !factoryResourceId) throw new Error('请选择真实的销售负责人和履约工厂');
  const recipient = draft.recipient;
  if (!recipient || ['name', 'phone', 'country', 'province', 'city', 'address'].some(field => !recipient[field]?.trim())) {
    throw new Error('请完整填写收货人、联系电话、国家、省份、城市和详细地址');
  }
  if (!/^\+?[\d ()-]{6,40}$/.test(recipient.phone.trim())) throw new Error('请填写有效的收货联系电话');
  if (lines.some(line => !line.unit?.trim())) throw new Error('产品基本单位未提供，请完善产品资料');
  const today = options.today || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  // The shipping confirmation step sets the final delivery date.
  const requestedDeliveryDate = draft.date && draft.date > today ? draft.date : today;
  return {
    ...salesOrderPricingInput(draft),
    customerId: customer.id,
    customerName: customer.name,
    orderDate: draft.date,
    validUntil: draft.validUntil,
    remark: draft.remark || '',
    ownerEmployeeId,
    fulfillmentWarehouseId: warehouse.id,
    factoryResourceId,
    requestedDeliveryDate,
    allowPartialShipment: draft.allowPartialShipment ?? true,
    currency: 'CNY',
    recipient: Object.fromEntries(Object.entries(recipient).map(([field, value]) => [field, value.trim()])),
    lines: lines.map((line, index) => ({
      lineNo: index + 1,
      productId: line.productId,
      productName: line.productName || '',
      specification: line.spec || '',
      orderedQty: String(line.quantity),
      uom: line.unit,
      unitPrice: String(line.unitPrice),
      taxRate: '0',
      promisedDate: requestedDeliveryDate,
      allowPartialShipment: draft.allowPartialShipment ?? true,
    })),
  };
};

export const createQuickSalesOrder = async (
  context: ApiContext,
  draft: SalesQuoteForConversion,
  options: QuickSalesOrderOptions,
): Promise<FulfillmentOrder> =>
  createFulfillmentOrder(context, quickSalesOrderInput(draft, options), options.idempotencyKey);
