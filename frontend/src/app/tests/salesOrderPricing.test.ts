import { describe, expect, it } from 'vitest';
import { salesOrderPricingInput } from '../../features/sales/model/salesOrderPricing';

describe('sales order pricing transfer', () => {
  it('preserves the quoted discounts and final amount when creating a formal order', () => {
    expect(salesOrderPricingInput({ amount: '¥9,133.00', discountRate: 95, discountAmount: 120 }))
      .toEqual({ discountRate: '95', discountAmount: '120', expectedTotalAmount: '9133.00' });
  });

  it('keeps zero discounts and decimal amounts without converting the total to a float', () => {
    expect(salesOrderPricingInput({ amount: '¥0.00', discountRate: 0, discountAmount: '0' }))
      .toEqual({ discountRate: '0', discountAmount: '0', expectedTotalAmount: '0.00' });
    expect(salesOrderPricingInput({ amount: '￥ 1,234.56' }))
      .toEqual({ discountRate: '100', discountAmount: '0', expectedTotalAmount: '1234.56' });
  });

  it('rejects missing or invalid totals instead of silently replacing them with the original price', () => {
    for (const amount of ['', '待生成', '-100', '1.2.3']) {
      expect(() => salesOrderPricingInput({ amount })).toThrow('订单金额无效');
    }
  });
});
