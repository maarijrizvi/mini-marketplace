import { allocate, type Cents } from '../common/money.js';

/** Flat carrier rate per seller parcel, until the shipping provider quotes real rates. */
export const SHIPPING_PER_SELLER: Cents = 500;

/** Promotions are code-defined for now; an admin-managed table can replace this map. */
export const PROMOTIONS: Record<string, { description: string; percentOff: number }> = {
  WELCOME10: { description: '10% off your items', percentOff: 10 },
};

export interface PricedLine {
  productId: string;
  sellerId: string;
  shopName: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: Cents;
}

export interface Quote {
  sellers: {
    sellerId: string;
    shopName: string;
    subtotal: Cents;
    shipping: Cents;
    lines: (PricedLine & { gross: Cents; discount: Cents; lineTotal: Cents })[];
  }[];
  subtotal: Cents;
  shipping: Cents;
  discount: Cents;
  total: Cents;
  promo: { code: string; description: string } | null;
}

export class UnknownPromoError extends Error {}

/**
 * Prices a set of lines: groups them by seller (one parcel each), applies the promotion to goods
 * only, and spreads the discount across lines so every order item records its share.
 */
export function quote(lines: PricedLine[], promoCode?: string): Quote {
  let promo: Quote['promo'] = null;
  let percentOff = 0;
  if (promoCode) {
    const found = PROMOTIONS[promoCode.toUpperCase()];
    if (!found) throw new UnknownPromoError(promoCode);
    promo = { code: promoCode.toUpperCase(), description: found.description };
    percentOff = found.percentOff;
  }

  const gross = lines.map((l) => l.unitPrice * l.quantity);
  const subtotal = gross.reduce((a, g) => a + g, 0);
  const discount = Math.round((subtotal * percentOff) / 100);
  const lineDiscounts = allocate(discount, gross);

  const bySeller = new Map<string, Quote['sellers'][number]>();
  lines.forEach((line, i) => {
    const group = bySeller.get(line.sellerId) ?? {
      sellerId: line.sellerId,
      shopName: line.shopName,
      subtotal: 0,
      shipping: SHIPPING_PER_SELLER,
      lines: [],
    };
    group.lines.push({ ...line, gross: gross[i], discount: lineDiscounts[i], lineTotal: gross[i] - lineDiscounts[i] });
    group.subtotal += gross[i] - lineDiscounts[i];
    bySeller.set(line.sellerId, group);
  });
  const sellers = [...bySeller.values()];
  const shipping = sellers.length * SHIPPING_PER_SELLER;
  return { sellers, subtotal, shipping, discount, total: subtotal - discount + shipping, promo };
}
