'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role } from '@mm/shared';
import { api } from '@/lib/api';
import { addToGuestCart } from '@/lib/guest-cart';

/** Add to cart (and, on the product page, quantity and Buy now). Works signed in or not. */
export function AddToCart(props: { productId: string; available: number; role: Role | null; full?: boolean }) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (props.role && props.role !== 'customer') {
    return (
      <button className="btn" disabled>
        Customer accounts only
      </button>
    );
  }
  if (props.available <= 0) {
    return (
      <button className="btn" disabled>
        Out of stock
      </button>
    );
  }

  async function add(selectOnly: boolean) {
    setError('');
    setBusy(true);
    if (!props.role) {
      addToGuestCart(props.productId, qty, selectOnly);
    } else {
      const res = await api('/cart/items', { body: { productId: props.productId, quantity: qty, selectOnly } });
      if (!res.ok) {
        setBusy(false);
        return setError(res.problem.message);
      }
    }
    setBusy(false);
    if (selectOnly) {
      router.push(props.role ? '/checkout' : '/signin?next=/checkout');
    } else {
      setMessage('Added to your cart.');
      router.refresh();
    }
  }

  if (!props.full) {
    return (
      <div className="add-row">
        <button className="btn ghost" onClick={() => add(false)} disabled={busy}>
          {message ? 'In cart ✓ — add another' : 'Add to cart'}
        </button>
        {error && <p className="errmsg">{error}</p>}
      </div>
    );
  }
  return (
    <div className="buy-box">
      <div className="qty" role="group" aria-label="Quantity">
        <button type="button" aria-label="Decrease" onClick={() => setQty((q) => Math.max(1, q - 1))}>
          −
        </button>
        <output>{qty}</output>
        <button type="button" aria-label="Increase" onClick={() => setQty((q) => Math.min(props.available, q + 1))}>
          +
        </button>
      </div>
      <button className="btn" onClick={() => add(false)} disabled={busy}>
        Add to cart
      </button>
      <button className="btn ghost" onClick={() => add(true)} disabled={busy}>
        Buy now
      </button>
      {qty >= props.available && <p className="hint">You’ve reached the available stock for this item.</p>}
      {message && (
        <p className="note ok" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="errmsg" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
