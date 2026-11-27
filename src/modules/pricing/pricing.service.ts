import type { Branch, Coupon } from '@prisma/client';
import type { Db } from '@/shared/db/prisma';
import { E } from '@/shared/errors/app-error';
import { cleanOptional } from '@/shared/security/sanitize';
import { formatINR } from '@/shared/utils/money';
import { computePricing, PricingError, type PricingOrderType, type PricingResult } from './pricing.engine';
import { pricingRepository as repo } from './pricing.repository';
import type { CartLineInput } from './pricing.schema';

export interface PricedLine {
  menuItemId: string;
  name: string;
  diet: 'VEG' | 'NON_VEG' | 'EGG';
  variantId: string | null;
  variantName: string | null;
  unitPricePaise: number;
  addons: { id: string; name: string; pricePaise: number }[];
  addonsTotalPaise: number;
  quantity: number;
  lineTotalPaise: number;
  instructions?: string;
  jain: boolean;
  gstRateBps: number | null;
}

export interface PricedCart {
  branch: Branch;
  lines: PricedLine[];
  pricing: PricingResult;
  delivery: { feePaise: number; etaMinutes: number } | null;
  coupon: Coupon | null;
  /** itemId -> total quantity, only for items with counted stock (decremented on order). */
  stockTracked: Map<string, number>;
}

export interface PriceCartArgs {
  db: Db;
  branchId: string;
  type: PricingOrderType;
  lines: CartLineInput[];
  pincode?: string;
  couponCode?: string;
  userId?: string;
}

/**
 * Single source of truth for prices. Re-reads everything from the database; the client's
 * idea of a price is never used. Works with the global client or inside a transaction.
 */
export async function priceCart(args: PriceCartArgs): Promise<PricedCart> {
  const { db, branchId, type, pincode, userId } = args;

  const branch = await repo.branch(db, branchId);
  if (!branch || !branch.isActive) throw E.notFound('This branch is not available');
  const accepts = { DELIVERY: branch.acceptsDelivery, TAKEAWAY: branch.acceptsTakeaway, DINE_IN: branch.acceptsDineIn };
  if (!accepts[type]) throw E.unprocessable(`This branch does not accept ${type.replace('_', '-').toLowerCase()} orders`);

  const ids = [...new Set(args.lines.map((l) => l.menuItemId))];
  const items = await repo.items(db, ids, branchId);
  const byId = new Map(items.map((i) => [i.id, i]));

  // Aggregate quantity per item for stock validation.
  const qtyPerItem = new Map<string, number>();
  for (const l of args.lines) qtyPerItem.set(l.menuItemId, (qtyPerItem.get(l.menuItemId) ?? 0) + l.quantity);

  const stockTracked = new Map<string, number>();
  const lines: PricedLine[] = [];

  for (const l of args.lines) {
    const item = byId.get(l.menuItemId);
    if (!item) throw E.unprocessable('An item in your cart is no longer available. Please refresh your cart.');

    const avail = item.availability[0];
    if (avail && !avail.isAvailable) throw E.unprocessable(`${item.name} is currently out of stock`);
    if (avail?.stockQty != null) {
      const wanted = qtyPerItem.get(item.id)!;
      if (wanted > avail.stockQty) {
        throw E.unprocessable(avail.stockQty <= 0 ? `${item.name} is currently out of stock` : `Only ${avail.stockQty} of ${item.name} left`);
      }
      stockTracked.set(item.id, wanted);
    }

    // Variant (Half / Full …)
    let unit = item.basePricePaise;
    let variantId: string | null = null;
    let variantName: string | null = null;
    if (item.variants.length > 0) {
      const v = l.variantId
        ? item.variants.find((x) => x.id === l.variantId)
        : (item.variants.find((x) => x.isDefault) ?? item.variants[0]);
      if (!v) throw E.unprocessable(`Invalid portion selected for ${item.name}`);
      unit = v.pricePaise;
      variantId = v.id;
      variantName = v.name;
    } else if (l.variantId) {
      throw E.unprocessable(`Invalid portion selected for ${item.name}`);
    }

    // Add-ons, validated against each group's min/max
    const chosen = [...new Set(l.addonIds)];
    const addons: PricedLine['addons'] = [];
    for (const group of item.addonGroups) {
      const picked = group.addons.filter((a) => a.isActive && chosen.includes(a.id));
      if (picked.length > group.maxSelect) throw E.unprocessable(`Choose at most ${group.maxSelect} option(s) for ${group.name}`);
      if (picked.length < group.minSelect) throw E.unprocessable(`Choose at least ${group.minSelect} option(s) for ${group.name}`);
      picked.forEach((a) => addons.push({ id: a.id, name: a.name, pricePaise: a.pricePaise }));
    }
    if (addons.length !== chosen.length) throw E.unprocessable(`An add-on for ${item.name} is no longer available`);

    if (l.jain && !item.jainAvailable) throw E.unprocessable(`${item.name} is not available as a Jain preparation`);

    const addonsTotalPaise = addons.reduce((s, a) => s + a.pricePaise, 0);
    lines.push({
      menuItemId: item.id,
      name: item.name,
      diet: item.diet,
      variantId,
      variantName,
      unitPricePaise: unit,
      addons,
      addonsTotalPaise,
      quantity: l.quantity,
      lineTotalPaise: (unit + addonsTotalPaise) * l.quantity,
      instructions: cleanOptional(l.instructions, 200),
      jain: Boolean(l.jain),
      gstRateBps: item.gstRateBps,
    });
  }

  // Delivery zone
  let delivery: PricedCart['delivery'] = null;
  if (type === 'DELIVERY') {
    if (!pincode) throw E.unprocessable('Enter your delivery PIN code');
    const zone = await repo.zone(db, branchId, pincode);
    if (!zone || !zone.isActive) throw E.unprocessable("Sorry, we don't deliver to this PIN code yet");
    delivery = { feePaise: zone.feePaise, etaMinutes: zone.etaMinutes };
    const subtotal = lines.reduce((s, l) => s + l.lineTotalPaise, 0);
    if (subtotal < branch.minOrderPaise) {
      throw E.unprocessable(`Minimum order for delivery is ${formatINR(branch.minOrderPaise)}`);
    }
  }

  // Coupon
  let coupon: Coupon | null = null;
  if (args.couponCode) {
    if (!userId) throw E.unauthorized('Please sign in to use a coupon');
    coupon = await repo.coupon(db, args.couponCode.trim().toUpperCase());
    const now = new Date();
    if (!coupon || !coupon.isActive) throw E.unprocessable('Invalid coupon code');
    if (now < coupon.validFrom) throw E.unprocessable('This coupon is not active yet');
    if (now > coupon.validUntil) throw E.unprocessable('This coupon has expired');
    if (coupon.orderTypes.length > 0 && !coupon.orderTypes.includes(type)) {
      throw E.unprocessable('This coupon is not valid for this order type');
    }
    if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) {
      throw E.unprocessable('This coupon has been fully redeemed');
    }
    if ((await repo.userRedemptions(db, coupon.id, userId)) >= coupon.perUserLimit) {
      throw E.unprocessable('You have already used this coupon');
    }
  }

  let pricing: PricingResult;
  try {
    pricing = computePricing({
      lines,
      orderType: type,
      branch,
      deliveryFeePaise: delivery?.feePaise,
      coupon: coupon
        ? {
            code: coupon.code,
            discountType: coupon.discountType,
            value: coupon.value,
            maxDiscountPaise: coupon.maxDiscountPaise,
            minOrderPaise: coupon.minOrderPaise,
          }
        : null,
    });
  } catch (e) {
    if (e instanceof PricingError) throw E.unprocessable(e.message);
    throw e;
  }

  return { branch, lines, pricing, delivery, coupon, stockTracked };
}
