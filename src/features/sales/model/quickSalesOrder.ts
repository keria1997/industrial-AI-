import type { ApiContext, FulfillmentOrder } from '../../../api/fulfillment';
import { createFulfillmentOrder } from '../../../api/fulfillment';
import { canonicalInventoryUnit } from '../../../shared/inventoryUnits';
import { salesOrderPricingInput } from './salesOrderPricing';
import type { SalesQuoteForConversion } from './salesRules';

type Warehouse = { id: string; code?: string };
type Customer = { id: string; name: string; contact?: string; phone?: string; address?: string };

export const createQuickSalesOrder = async (
  context: ApiContext,
  draft: SalesQuoteForConversion,
  options: {
    warehouses: Warehouse[];
    customers: Customer[];
    ownerEmployeeId: string;
    factoryResourceId: string;
    idempotencyKey: string;
    today?: string;
  },
): Promise<FulfillmentOrder> => {
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
  const customer = options.customers.find(item => item.name === draft.client);
  if (!customer) throw new Error('请选择客户列表中的客户');
  const today = options.today || new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
  // The shipping confirmation step sets the final delivery date.
  const requestedDeliveryDate = draft.date && draft.date > today ? draft.date : today;
  return createFulfillmentOrder(context, {
    ...salesOrderPricingInput(draft),
    customerId: customer.id,
    customerName: customer.name,
    orderDate: draft.date,
    validUntil: draft.validUntil,
    remark: draft.remark || '',
    ownerEmployeeId: options.ownerEmployeeId,
    fulfillmentWarehouseId: warehouse.id,
    factoryResourceId: options.factoryResourceId,
    requestedDeliveryDate,
    allowPartialShipment: true,
    currency: 'CNY',
    recipient: {
      name: customer.contact || '待补充收货人',
      phone: customer.phone && customer.phone !== '-' ? customer.phone : '13800000000',
      country: '中国', province: '上海', city: '上海', address: customer.address || '待补充收货地址',
    },
    lines: lines.map((line, index) => ({
      lineNo: index + 1,
      productId: line.productId,
      productName: line.productName || '',
      specification: line.spec || '',
      orderedQty: String(line.quantity),
      uom: canonicalInventoryUnit(line.unit || 'PCS'),
      unitPrice: String(line.unitPrice),
      taxRate: '0',
      promisedDate: requestedDeliveryDate,
      allowPartialShipment: true,
    })),
  }, options.idempotencyKey);
};
