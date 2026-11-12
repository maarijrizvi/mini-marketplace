'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, Loading, ProductImage, Qty } from '@/components/ui';
import { rupees } from '@/features/format';
import { useMe } from '@/features/session';
import { matchVariant, useAddToCart, useBuyNow, useProduct } from '@/features/shopping';

export default function ProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data: product, isLoading, error } = useProduct(id);
  const { data: me } = useMe();
  const router = useRouter();
  const add = useAddToCart();
  const buyNow = useBuyNow();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [image, setImage] = useState(0);

  if (isLoading) return <div className="wrap page"><Loading /></div>;
  if (error || !product) return <div className="wrap page"><ErrorNote error={error ?? new Error('Not found')} /></div>;

  // With a single variant (or no options) nothing needs choosing.
  const effective =
    product.variants.length === 1 && product.optionNames.length === 0 ? {} : chosen;
  const variant = product.optionNames.length === 0 ? product.variants[0] : matchVariant(product, effective);
  const images = variant?.images.length ? variant.images : product.images;
  const prices = product.variants.map((v) => v.price);
  const price = variant ? rupees(variant.price) : Math.min(...prices) === Math.max(...prices) ? rupees(prices[0]) : `${rupees(Math.min(...prices))} – ${rupees(Math.max(...prices))}`;
  const available = variant?.available ?? 0;

  const needSignIn = () => router.push(`/signin?next=/products/${id}`);
  const go = (fn: typeof add | typeof buyNow, after?: () => void) => {
    if (!me) return needSignIn();
    if (!variant) return;
    fn.mutate({ variantId: variant.id, quantity: qty }, { onSuccess: after });
  };

  return (
    <div className="wrap page">
      <p className="small" style={{ marginBottom: 16 }}>
        <Link href="/shop">Shop</Link> / <Link href={`/shop?category=${product.category.slug}`}>{product.category.name}</Link>
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>
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
            return (
              <fieldset key={name} style={{ border: 0, padding: 0, margin: 0 }} className="stack">
                <legend className="label" style={{ textTransform: 'capitalize', marginBottom: 8 }}>
                  {name}
                </legend>
                <div className="row">
                  {values.map((v) => {
                    const on = chosen[name] === v;
                    const exists = product.variants.some((x) => x.options[name] === v && x.available > 0);
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`btn small ${on ? '' : 'ghost'}`}
                        aria-pressed={on}
                        style={exists ? undefined : { textDecoration: 'line-through' }}
                        onClick={() => {
                          setChosen((c) => ({ ...c, [name]: v }));
                          setAdded(false);
                          setImage(0);
                        }}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
          <div className="row">
            <Qty value={qty} max={Math.max(1, Math.min(available, 99))} onChange={setQty} disabled={!variant} label="Quantity" />
            {variant ? (
              available > 0 ? (
                <span className={`chip ${available <= 3 ? 'warn' : 'ok'}`}>{available <= 3 ? `Only ${available} left` : 'In stock'}</span>
              ) : (
                <span className="chip bad">Out of stock</span>
              )
            ) : (
              <span className="muted small">Choose {product.optionNames.filter((n) => !chosen[n]).join(' and ')}</span>
            )}
          </div>
          <ErrorNote error={add.error ?? buyNow.error} />
          {added && (
            <div className="note ok" role="status">
              Added to your cart. <Link href="/cart">View cart</Link>
            </div>
          )}
          <div className="row">
            <button className="btn gold" disabled={!variant || available < qty || add.isPending} onClick={() => go(add, () => setAdded(true))}>
              {add.isPending ? 'Adding…' : 'Add to cart'}
            </button>
            <button className="btn" disabled={!variant || available < qty || buyNow.isPending} onClick={() => go(buyNow, () => router.push('/checkout'))}>
              Buy now
            </button>
          </div>
          {product.description && (
            <section className="stack" style={{ gap: 6 }}>
              <h3>About this item</h3>
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
