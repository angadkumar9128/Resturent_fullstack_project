import { describe, expect, it } from 'vitest';
import { allocateDiscount, computeCouponDiscount, computePricing, PricingError } from '../src/modules/pricing/pricing.engine';

describe('Indian restaurant pricing engine', () => {
  const branch = { gstRateBps: 500, packagingChargePaise: 1000, freeDeliveryAbovePaise: 100000 };

  it('calculates GST, splits CGST/SGST and rounds the payable total to a rupee', () => {
    const result = computePricing({ lines: [{ lineTotalPaise: 10000 }], orderType: 'TAKEAWAY', branch });
    expect(result.subtotalPaise).toBe(10000);
    expect(result.gstPaise).toBe(500);
    expect(result.cgstPaise + result.sgstPaise).toBe(500);
    expect(result.totalPaise % 100).toBe(0);
    expect(result.packagingPaise).toBe(1000);
  });

  it('allocates coupon discounts exactly across multiple lines', () => {
    expect(allocateDiscount([1000, 2000, 3000], 1000).reduce((a, b) => a + b, 0)).toBe(1000);
    const result = computePricing({
      lines: [{ lineTotalPaise: 10000 }, { lineTotalPaise: 5000 }],
      orderType: 'DINE_IN',
      branch,
      coupon: { code: 'SAVE10', discountType: 'PERCENT', value: 1000, minOrderPaise: 0, maxDiscountPaise: 1000 },
    });
    expect(result.discountPaise).toBe(1000);
    expect(result.taxablePaise).toBe(14000);
    expect(result.packagingPaise).toBe(0);
  });

  it('waives delivery above the configured threshold', () => {
    const result = computePricing({ lines: [{ lineTotalPaise: 120000 }], orderType: 'DELIVERY', branch, deliveryFeePaise: 5000 });
    expect(result.deliveryFeePaise).toBe(0);
  });

  it('rejects coupons below their minimum order', () => {
    expect(() => computeCouponDiscount({ code: 'MIN', discountType: 'FLAT', value: 100, minOrderPaise: 5000 }, 1000)).toThrow(PricingError);
  });
});
