/**
 * PURE pricing engine – no database, no network, no clock. Everything is integer paise.
 *
 *   subtotal  = Σ line totals
 *   discount  = coupon(subtotal)                 (FLAT | PERCENT with cap, min-order check)
 *   taxable   = subtotal − discount              (discount spread proportionally over lines)
 *   GST       = Σ per-rate-group round(taxable × rate)   → CGST = ⌊GST/2⌋, SGST = GST − CGST
 *   packaging = branch flat charge (DELIVERY / TAKEAWAY only)   – treated as non-taxable
 *   delivery  = zone fee (DELIVERY only), 0 above the free-delivery threshold – non-taxable
 *   total     = (taxable + GST + packaging + delivery) rounded to the nearest rupee
 */

export type PricingOrderType = 'DELIVERY' | 'TAKEAWAY' | 'DINE_IN';

export interface PricingLine {
  lineTotalPaise: number;
  /** Optional per-item GST override in basis points; falls back to the branch rate. */
  gstRateBps?: number | null;
}

export interface PricingCoupon {
  code: string;
  discountType: 'FLAT' | 'PERCENT';
  /** FLAT: paise. PERCENT: basis points (1000 = 10%). */
  value: number;
  maxDiscountPaise?: number | null;
  minOrderPaise: number;
}

export interface PricingInput {
  lines: PricingLine[];
  orderType: PricingOrderType;
  branch: {
    gstRateBps: number;
    packagingChargePaise: number;
    freeDeliveryAbovePaise?: number | null;
  };
  /** Delivery fee of the customer's PIN-code zone (ignored unless DELIVERY). */
  deliveryFeePaise?: number;
  coupon?: PricingCoupon | null;
}

export interface GstGroup {
  rateBps: number;
  taxablePaise: number;
  gstPaise: number;
}

export interface PricingResult {
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  gstPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  packagingPaise: number;
  deliveryFeePaise: number;
  roundOffPaise: number;
  totalPaise: number;
  couponCode: string | null;
  gstBreakup: GstGroup[];
}

export class PricingError extends Error {
  constructor(
    public readonly code: 'EMPTY_CART' | 'INVALID_LINE' | 'COUPON_MIN_ORDER',
    message: string,
  ) {
    super(message);
    this.name = 'PricingError';
  }
}

export function computeCouponDiscount(coupon: PricingCoupon, subtotalPaise: number): number {
  if (subtotalPaise < coupon.minOrderPaise) {
    const short = Math.ceil((coupon.minOrderPaise - subtotalPaise) / 100);
    throw new PricingError('COUPON_MIN_ORDER', `Add items worth ₹${short} more to use ${coupon.code}`);
  }
  let discount =
    coupon.discountType === 'FLAT' ? coupon.value : Math.floor((subtotalPaise * coupon.value) / 10_000);
  if (coupon.maxDiscountPaise != null) discount = Math.min(discount, coupon.maxDiscountPaise);
  return Math.max(0, Math.min(discount, subtotalPaise));
}

/** Spread `discount` over lines proportionally; result always sums to exactly `discount`. */
export function allocateDiscount(lineTotals: number[], discount: number): number[] {
  const subtotal = lineTotals.reduce((a, b) => a + b, 0);
  if (discount <= 0 || subtotal <= 0) return lineTotals.map(() => 0);
  const alloc = lineTotals.map((l) => Math.floor((discount * l) / subtotal));
  let remainder = discount - alloc.reduce((a, b) => a + b, 0);
  const order = lineTotals.map((_, i) => i).sort((a, b) => lineTotals[b]! - lineTotals[a]!);
  for (let k = 0; remainder > 0; k = (k + 1) % order.length) {
    const i = order[k]!;
    if (alloc[i]! < lineTotals[i]!) {
      alloc[i]!++;
      remainder--;
    }
  }
  return alloc;
}

export function computePricing(input: PricingInput): PricingResult {
  const { lines, orderType, branch, coupon } = input;
  if (lines.length === 0) throw new PricingError('EMPTY_CART', 'Your cart is empty');
  for (const l of lines) {
    if (!Number.isInteger(l.lineTotalPaise) || l.lineTotalPaise < 0) {
      throw new PricingError('INVALID_LINE', 'Invalid line amount');
    }
  }

  const lineTotals = lines.map((l) => l.lineTotalPaise);
  const subtotalPaise = lineTotals.reduce((a, b) => a + b, 0);
  const discountPaise = coupon ? computeCouponDiscount(coupon, subtotalPaise) : 0;
  const taxablePaise = subtotalPaise - discountPaise;

  // GST per rate group (usually just one: the branch rate, 5%).
  const alloc = allocateDiscount(lineTotals, discountPaise);
  const groups = new Map<number, number>();
  lines.forEach((l, i) => {
    const rate = l.gstRateBps ?? branch.gstRateBps;
    groups.set(rate, (groups.get(rate) ?? 0) + (lineTotals[i]! - alloc[i]!));
  });
  const gstBreakup: GstGroup[] = [...groups.entries()].map(([rateBps, taxable]) => ({
    rateBps,
    taxablePaise: taxable,
    gstPaise: Math.round((taxable * rateBps) / 10_000),
  }));
  const gstPaise = gstBreakup.reduce((a, g) => a + g.gstPaise, 0);
  const cgstPaise = Math.floor(gstPaise / 2);
  const sgstPaise = gstPaise - cgstPaise; // CGST + SGST always equals GST exactly

  const packagingPaise = orderType === 'DINE_IN' ? 0 : branch.packagingChargePaise;

  let deliveryFeePaise = 0;
  if (orderType === 'DELIVERY') {
    const free = branch.freeDeliveryAbovePaise != null && taxablePaise >= branch.freeDeliveryAbovePaise;
    deliveryFeePaise = free ? 0 : (input.deliveryFeePaise ?? 0);
  }

  const exact = taxablePaise + gstPaise + packagingPaise + deliveryFeePaise;
  const totalPaise = Math.round(exact / 100) * 100;

  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    gstPaise,
    cgstPaise,
    sgstPaise,
    packagingPaise,
    deliveryFeePaise,
    roundOffPaise: totalPaise - exact,
    totalPaise,
    couponCode: coupon ? coupon.code : null,
    gstBreakup,
  };
}
