'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, Loading, ProductImage, Qty } from '@/components/ui';
import { rupees } from '@/features/format';
import { useMe } from '@/features/session';
import {
  chooseOption,
  matchVariant,
  optionState,
  quantityInCart,
  useAddToCart,
  useBuyNow,
  useCart,
  useProduct,
} from '@/features/shopping';

export function ProductView() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, error } = useProduct(id);
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me);
  const router = useRouter();
  const add = useAddToCart();
  const buyNow = useBuyNow();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [image, setImage] = useState(0);
  const [askSignIn, setAskSignIn] = useState(false);

  if (isLoading) return <div className="wrap page"><Loading /></div>;
  if (error || !product) return <div className="wrap page"><ErrorNote error={error ?? new Error('That product doesn’t exist.')} /></div>;

  // An option with a single value (e.g. the only colour) counts as chosen from the start.
  const singles = Object.fromEntries(
    product.optionNames
      .map((n) => [n, [...new Set(product.variants.map((v) => v.options[n]))]] as const)
      .filter(([, values]) => values.length === 1)
      .map(([n, values]) => [n, values[0]]),
  );
  const picked: Record<string, string> = { ...singles, ...chosen };
  const variant = product.optionNames.length === 0 ? product.variants[0] : matchVariant(product, picked);
  const images = variant?.images.length ? variant.images : product.images;
  const prices = product.variants.map((v) => v.price);
  const price = variant
    ? rupees(variant.price)
    : Math.min(...prices) === Math.max(...prices)
      ? rupees(prices[0])
      : `${rupees(Math.min(...prices))} – ${rupees(Math.max(...prices))}`;
  const available = variant?.available ?? 0;
  const inCart = quantityInCart(cart, variant?.id);
  const canAdd = Math.max(available - inCart, 0);
  // The quantity never exceeds what can still be added (it shrinks as the cart fills up).
  const quantity = Math.min(qty, Math.max(canAdd, 1));
  const missing = product.optionNames.filter((n) => !picked[n]);

  // One message at a time: a new attempt clears whatever the last one said.
  const go = (fn: typeof add | typeof buyNow, after?: () => void) => {
    if (!me) return setAskSignIn(true);
    if (!variant) return;
    add.reset();
    buyNow.reset();
    setAdded(false);
    fn.mutate({ variantId: variant.id, quantity }, { onSuccess: after });
  };
  const pick = (name: string, value: string) => {
    setChosen(chooseOption(product, picked, name, value));
    setAdded(false);
    add.reset();
    setQty(1);
    setImage(0);
  };

  let stock: React.ReactNode;
  if (!variant) {
    stock = <span className="muted small">Choose {missing.join(' and ')}</span>;
  } else if (available === 0) {
    stock = <span className="chip bad">Out of stock</span>;
  } else if (inCart > 0) {
    stock = (
      <span className={`chip ${canAdd ? 'info' : 'warn'}`}>
        {canAdd ? `${inCart} in your cart · ${canAdd} more available` : `All ${available} in stock are in your cart`}
      </span>
    );
  } else {
    stock = <span className={`chip ${available <= 3 ? 'warn' : 'ok'}`}>{available <= 3 ? `Only ${available} left` : 'In stock'}</span>;
  }

  return (
    <div className="wrap page">
      <p className="small" style={{ marginBottom: 16 }}>
        <Link href="/shop">Shop</Link> / <Link href={`/shop?category=${product.category.slug}`}>{product.category.name}</Link>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
        <div className="stack">
          <ProductImage src={images[image] ?? images[0]} name={product.name} className="hero-img" />
          {images.length > 1 && (
            <div className="row">
              {images.map((src, i) => (
                <button key={src} onClick={() => setImage(i)} aria-label={`Image ${i + 1}`} style={{ border: i === image ? '2px solid var(--navy)' : '1px solid var(--line)', borderRadius: 12, padding: 0, background: 'none', cursor: 'pointer' }}>
                  <ProductImage src={src} name={product.name} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="stack-lg">
          <div className="stack" style={{ gap: 6 }}>
            <span className="muted small">
              Sold by <strong>{product.seller.shopName}</strong>
            </span>
            <h1>{product.name}</h1>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{price}</span>
          </div>
          {product.optionNames.map((name) => {
            const values = [...new Set(product.variants.map((v) => v.options[name]))];
            const others = Object.entries(picked)
              .filter(([k]) => k !== name)
              .map(([, v]) => v)
              .join(' · ');
            const unavailable = values.filter((v) => optionState(product, picked, name, v) === 'unavailable');
            return (
              <fieldset key={name} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
                <legend className="label" style={{ textTransform: 'capitalize', marginBottom: 8 }}>
                  {name}
                  {picked[name] && <span className="muted" style={{ fontWeight: 500, textTransform: 'none' }}>: {picked[name]}</span>}
                </legend>
                <div className="row">
                  {values.map((v) => {
                    const on = picked[name] === v;
                    const state = optionState(product, picked, name, v);
                    const note = state === 'unavailable' ? `not available in ${others}` : state === 'sold-out' ? 'sold out' : '';
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`btn small ${on ? '' : 'ghost'} opt-${state}`}
                        aria-pressed={on}
                        aria-label={note ? `${v}, ${note}` : v}
                        title={note ? `${v} is ${note}` : undefined}
                        onClick={() => pick(name, v)}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
                {unavailable.length > 0 && others && (
                  <span className="hint">
                    {unavailable.join(', ')} {unavailable.length > 1 ? 'aren’t' : 'isn’t'} available in {others}. Choosing it clears that.
                  </span>
                )}
              </fieldset>
            );
          })}
          <div className="row">
            <Qty value={quantity} max={Math.max(1, Math.min(canAdd, 99))} onChange={setQty} disabled={!variant || canAdd === 0} label="Quantity" />
            {stock}
          </div>
          {askSignIn && !me && (
            <div className="note stack" role="status" style={{ gap: 8 }}>
              Sign in to add items to your cart — your cart is saved to your account so it follows you between devices.
              <div className="row">
                <Link href={`/signin?next=/products/${id}`} className="btn small">
                  Sign in
                </Link>
                <Link href={`/signup`} className="btn ghost small">
                  Create an account
                </Link>
              </div>
            </div>
          )}
          <ErrorNote error={add.error ?? buyNow.error} />
          {added && !add.error && (
            <div className="note ok" role="status">
              Added to your cart. <Link href="/cart">View cart</Link>
            </div>
          )}
          <div className="row">
            <button
              className="btn gold"
              disabled={!variant || canAdd === 0 || add.isPending}
              onClick={() =>
                go(add, () => {
                  setAdded(true);
                  setQty(1);
                })
              }
            >
              {add.isPending ? 'Adding…' : 'Add to cart'}
            </button>
            <button className="btn" disabled={!variant || available < 1 || buyNow.isPending} onClick={() => go(buyNow, () => router.push('/checkout'))}>
              Buy now
            </button>
          </div>
          {product.description && (
            <section className="stack" style={{ gap: 6 }}>
              <h2 style={{ fontSize: 17 }}>About this item</h2>
              <p className="muted" style={{ whiteSpace: 'pre-line' }}>
                {product.description}
              </p>
            </section>
          )}
          <div className="note small">Shipped by {product.seller.shopName} with Leopards Courier. Pay online or cash on delivery.</div>
        </div>
      </div>
    </div>
  );
}
