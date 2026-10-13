type SalesOrderPricing = {
  amount: string;
  discountRate?: number | string;
  discountAmount?: number | string;
};

export const salesOrderPricingInput = (order: SalesOrderPricing) => {
  const expectedTotalAmount = order.amount.replace(/[¥￥,\s]/g, '');
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(expectedTotalAmount)) {
    throw new Error('订单金额无效，请核对金额后重试');
  }
  return {
    discountRate: String(order.discountRate ?? 100),
    discountAmount: String(order.discountAmount ?? 0),
    expectedTotalAmount,
  };
};
