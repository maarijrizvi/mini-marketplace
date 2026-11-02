import { allocate, fromCents, toCents } from '../common/money.js';
import { quote, UnknownPromoError } from './pricing.js';

const line = (sellerId: string, unitPrice: number, quantity = 1) => ({
  productId: `p-${sellerId}-${unitPrice}`,
  sellerId,
  shopName: `Shop ${sellerId}`,
  name: 'Thing',
  sku: 'SKU',
  quantity,
  unitPrice,
});

describe('money', () => {
  it('converts between strings and cents without floating-point drift', () => {
    expect(toCents('42.5')).toBe(4250);
    expect(toCents('0.07')).toBe(7);
    expect(toCents(19.99)).toBe(1999);
    expect(fromCents(4250)).toBe('42.50');
    expect(fromCents(5)).toBe('0.05');
  });

  it('allocates every cent', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocate(0, [500, 500])).toEqual([0, 0]);
  });
});

describe('quote', () => {
  it('charges one parcel of shipping per seller', () => {
    const q = quote([line('a', 4250), line('a', 3800), line('b', 6800)]);
    expect(q.sellers).toHaveLength(2);
    expect(q.subtotal).toBe(14850);
    expect(q.shipping).toBe(1000);
    expect(q.total).toBe(15850);
  });

  it('takes the promotion off goods only and records each line’s share', () => {
    const q = quote([line('a', 6800), line('b', 3333, 3)], 'welcome10');
    expect(q.discount).toBe(1680); // 10% of 16799, rounded
    expect(q.total).toBe(16799 - 1680 + 1000);
    const shares = q.sellers.flatMap((s) => s.lines.map((l) => l.discount));
    expect(shares.reduce((a, d) => a + d, 0)).toBe(1680);
  });

  it('rejects an unknown code', () => {
    expect(() => quote([line('a', 100)], 'NOPE')).toThrow(UnknownPromoError);
  });
});
