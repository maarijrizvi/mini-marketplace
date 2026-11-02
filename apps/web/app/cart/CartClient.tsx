'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { CartLine, CartView, ProductDetail } from '@mm/shared';
import { api } from '@/lib/api';
import { readGuestCart, writeGuestCart, type GuestItem } from '@/lib/guest-cart';

const money = (cents: number) => (cents / 100).toFixed(2);
const cents = (s: string) => Math.round(Number(s) * 100);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Builds the same shape as the API's cart from the browser's guest cart. */
async function guestView(items: GuestItem[]): Promise<CartView> {
  const lines: CartLine[] = [];
  for (const item of items) {
    const res = await api<ProductDetail>(`/catalogue/products/${item.productId}`);
    if (!res.ok) continue; // no longer sold; dropped from the view
    const p = res.data;
    const unavailable = p.available === 0;
    lines.push({
      productId: p.id,
      name: p.name,
      sku: p.sku,
      seller: p.seller,
      quantity: item.quantity,
      unitPrice: p.price,
      previousPrice: null,
      lineTotal: money(cents(p.price) * item.quantity),
      available: p.available,
      unavailable,
      selected: item.selected && !unavailable,
    });
  }
  const selected = lines.filter((l) => l.selected);
  return {
    lines,
    itemCount: lines.filter((l) => !l.unavailable).reduce((a, l) => a + l.quantity, 0),
    selectedCount: selected.reduce((a, l) => a + l.quantity, 0),
    selectedSubtotal: money(selected.reduce((a, l) => a + cents(l.lineTotal), 0)),
  };
}

export function CartClient({ signedIn, initial }: { signedIn: boolean; initial: CartView | null }) {
  const router = useRouter();
  const [cart, setCart] = useState<CartView | null>(initial);
  const [error, setError] = useState('');

  const loadGuest = useCallback(async () => setCart(await guestView(readGuestCart())), []);
  useEffect(() => {
    if (!signedIn) void loadGuest();
  }, [signedIn, loadGuest]);

  /** Runs an API change (signed in) or a local change (guest), then refreshes the view. */
  async function change(
    apiCall: () => Promise<{ ok: boolean; data?: unknown; problem?: { message: string } }>,
    local: (items: GuestItem[]) => GuestItem[],
  ) {
    setError('');
    if (signedIn) {
      const res = await apiCall();
      if (!res.ok) return setError(res.problem!.message);
      setCart(res.data as CartView);
      router.refresh();
    } else {
      writeGuestCart(local(readGuestCart()));
      await loadGuest();
    }
  }

  if (!cart) return <p className="hint">Loading your cart…</p>;

  if (!cart.lines.length) {
    return (
      <div className="panel" style={{ textAlign: 'center' }}>
        <h2>Your cart is empty</h2>
        <p className="hint">Add something from any seller.</p>
        <div>
          <Link href="/shop" className="btn" style={{ width: 'auto' }}>
            Browse products
          </Link>
        </div>
      </div>
    );
  }

  const live = cart.lines.filter((l) => !l.unavailable);
  const picked = live.filter((l) => l.selected);
  const allSelected = live.length > 0 && picked.length === live.length;
  const sellers = [...new Map(cart.lines.map((l) => [l.seller.id, l.seller])).values()];
  const changed = cart.lines.some((l) => l.previousPrice);
  const gone = cart.lines.some((l) => l.unavailable);

  const select = (productIds: string[] | undefined, selected: boolean) =>
    change(
      () => api('/cart/selection', { body: { productIds, selected } }),
      (items) => items.map((i) => (!productIds || productIds.includes(i.productId) ? { ...i, selected } : i)),
    );
  const setQty = (productId: string, quantity: number) =>
    change(
      () => api(`/cart/items/${productId}`, { method: 'PATCH', body: { quantity } }),
      (items) => items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    );
  const remove = (productId: string) =>
    change(
      () => api(`/cart/items/${productId}`, { method: 'DELETE' }),
      (items) => items.filter((i) => i.productId !== productId),
    );
  const removeSelected = () =>
    change(
      () => api('/cart/remove-selected', { method: 'POST' }),
      (items) => items.filter((i) => !i.selected),
    );

  return (
    <div className="cart-layout">
      <div className="stack">
        <p className="hint">
          {plural(cart.itemCount, 'item')} from {plural(new Set(live.map((l) => l.seller.id)).size, 'seller')} · tick the items you want to
          buy now
        </p>
        {(changed || gone) && (
          <div className="note warn" role="alert">
            <strong>Some items changed since you added them.</strong> {changed && 'A price changed. '}
            {gone && 'An item is no longer available. '}Review them before checking out.
          </div>
        )}
        {error && (
          <div className="note bad" role="alert">
            {error}
          </div>
        )}
        <div className="panel row">
          <label className="check strong">
            <input type="checkbox" checked={allSelected} disabled={!live.length} onChange={() => select(undefined, !allSelected)} />
            <span>Select all ({live.length})</span>
          </label>
          {picked.length > 0 && (
            <button className="link-btn" onClick={removeSelected}>
              Remove selected ({picked.length})
            </button>
          )}
        </div>
        {sellers.map((seller) => {
          const lines = cart.lines.filter((l) => l.seller.id === seller.id);
          const liveHere = lines.filter((l) => !l.unavailable);
          const allHere = liveHere.length > 0 && liveHere.every((l) => l.selected);
          return (
            <section key={seller.id} className="seller-group" aria-label={`Items from ${seller.shopName}`}>
              <header className="row">
                <label className="check strong">
                  <input
                    type="checkbox"
                    checked={allHere}
                    disabled={!liveHere.length}
                    onChange={() =>
                      select(
                        liveHere.map((l) => l.productId),
                        !allHere,
                      )
                    }
                    aria-label={`Select all items from ${seller.shopName}`}
                  />
                  <span>Sold by {seller.shopName}</span>
                </label>
                <span className="hint">
                  {liveHere.length ? `${liveHere.filter((l) => l.selected).length} of ${liveHere.length} selected` : 'Unavailable'}
                </span>
              </header>
              {lines.map((l) => (
                <div key={l.productId} className="cart-line">
                  <input
                    type="checkbox"
                    checked={l.selected}
                    disabled={l.unavailable}
                    onChange={() =>
                      change(
                        () => api(`/cart/items/${l.productId}`, { method: 'PATCH', body: { selected: !l.selected } }),
                        (items) => items.map((i) => (i.productId === l.productId ? { ...i, selected: !l.selected } : i)),
                      )
                    }
                    aria-label={`Select ${l.name}`}
                  />
                  <div className="thumb" aria-hidden="true" />
                  <div className="info">
                    <Link href={`/products/${l.productId}`}>{l.name}</Link>
                    <span className="mono hint">{l.sku}</span>
                    {l.previousPrice && <span className="chip">Price changed: was ${l.previousPrice}</span>}
                    {l.unavailable && <span className="chip bad">No longer available</span>}
                  </div>
                  {!l.unavailable && (
                    <div className="qty" role="group" aria-label={`Quantity for ${l.name}`}>
                      <button aria-label="Decrease" onClick={() => setQty(l.productId, l.quantity - 1)} disabled={l.quantity <= 1}>
                        −
                      </button>
                      <output>{l.quantity}</output>
                      <button
                        aria-label="Increase"
                        onClick={() => setQty(l.productId, l.quantity + 1)}
                        disabled={l.quantity >= l.available}
                      >
                        +
                      </button>
                    </div>
                  )}
                  <div className="amount">
                    <strong>{l.unavailable ? '—' : `$${l.lineTotal}`}</strong>
                    <span className="hint">${l.unitPrice} each</span>
                  </div>
                  <button className="link-btn" onClick={() => remove(l.productId)} aria-label={`Remove ${l.name}`}>
                    Remove
                  </button>
                </div>
              ))}
            </section>
          );
        })}
        <Link href="/shop">← Continue shopping</Link>
      </div>
      <aside className="panel summary" aria-label="Order summary">
        <h2>Summary</h2>
        <div className="row">
          <span className="hint">Subtotal ({plural(cart.selectedCount, 'item')})</span>
          <strong>${cart.selectedSubtotal}</strong>
        </div>
        <div className="row">
          <span className="hint">Shipping</span>
          <span>At checkout</span>
        </div>
        {picked.length ? (
          <Link href={signedIn ? '/checkout' : '/signin?next=/checkout'} className="btn">
            {signedIn ? 'Proceed to checkout' : 'Sign in to check out'} ({cart.selectedCount})
          </Link>
        ) : (
          <button className="btn" disabled>
            Select items to check out
          </button>
        )}
        <p className="hint">Prices and stock are checked again when you place the order.</p>
      </aside>
    </div>
  );
}
