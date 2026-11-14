'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMe } from '@/features/session';
import { Empty, ErrorNote, Loading, Money, ProductImage, Qty } from '@/components/ui';
import { optionsLabel, plural } from '@/features/format';
import { useCart, useRemoveCartLine, useSelectCartLines, useUpdateCartLine } from '@/features/shopping';

function CartView() {
  const router = useRouter();
  const { data: cart, isLoading, error } = useCart();
  const update = useUpdateCartLine();
  const remove = useRemoveCartLine();
  const select = useSelectCartLines();
  const busy = update.isPending || remove.isPending || select.isPending;

  if (isLoading) return <Loading />;
  if (!cart || cart.groups.length === 0)
    return (
      <Empty title="Your cart is empty">
        <Link href="/shop" className="btn gold">
          Start shopping
        </Link>
      </Empty>
    );

  const lines = cart.groups.flatMap((g) => g.lines);
  const allTicked = lines.every((l) => l.selected);
  const blocked = lines.some((l) => l.selected && !l.purchasable);
  // Items are counted in units everywhere, the same as the header's cart badge.
  const selectedUnits = lines.filter((l) => l.selected).reduce((n, l) => n + l.quantity, 0);

  return (
    <div className="cols-2">
      <div className="stack">
        <ErrorNote error={error ?? update.error ?? remove.error ?? select.error} />
        <div className="card tight row between">
          <label className="check">
            <input type="checkbox" checked={allTicked} disabled={busy} onChange={(e) => select.mutate({ selected: e.target.checked })} />
            Select all
          </label>
          <span className="small muted">Ticked items are bought now; the rest stay in your cart.</span>
        </div>
        {cart.groups.map((g) => {
          const ids = g.lines.map((l) => l.variantId);
          const groupTicked = g.lines.every((l) => l.selected);
          return (
            <section key={g.seller.id} className="card stack" aria-label={`Sold by ${g.seller.shopName}`}>
              <div className="row between">
                <label className="check" style={{ fontWeight: 600 }}>
                  <input
                    type="checkbox"
                    checked={groupTicked}
                    disabled={busy}
                    onChange={(e) => select.mutate({ selected: e.target.checked, variantIds: ids })}
                  />
                  Sold by {g.seller.shopName}
                </label>
                <span className="small muted">Ships as its own parcel</span>
              </div>
              {g.lines.map((l) => (
                <div key={l.variantId} className="row" style={{ alignItems: 'flex-start', borderTop: '1px solid var(--line)', paddingTop: 12, flexWrap: 'nowrap' }}>
                  <input
                    type="checkbox"
                    aria-label={`Select ${l.name}`}
                    checked={l.selected}
                    disabled={busy}
                    onChange={(e) => update.mutate({ variantId: l.variantId, selected: e.target.checked })}
                    style={{ width: 18, height: 18, marginTop: 18, accentColor: 'var(--link)' }}
                  />
                  <ProductImage src={l.image} name={l.name} />
                  <div className="stack" style={{ gap: 4, flex: 1, minWidth: 0 }}>
                    <Link href={`/products/${l.productId}`} style={{ fontWeight: 600, color: 'var(--ink)' }}>
                      {l.name}
                    </Link>
                    {Object.keys(l.options).length > 0 && <span className="small muted">{optionsLabel(l.options)}</span>}
                    {!l.purchasable && (
                      <span className="chip bad">{l.available === 0 ? 'Sold out' : l.available < l.quantity ? `Only ${l.available} left` : 'No longer for sale'}</span>
                    )}
                    <div className="row">
                      <Qty
                        value={l.quantity}
                        max={Math.max(l.quantity, Math.min(l.available, 99))}
                        disabled={busy}
                        label={`Quantity of ${l.name}`}
                        onChange={(q) => update.mutate({ variantId: l.variantId, quantity: q })}
                      />
                      <button className="linkbtn danger" disabled={busy} onClick={() => remove.mutate(l.variantId)}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong>
                      <Money paisa={l.lineTotal} />
                    </strong>
                    <div className="tiny muted">
                      <Money paisa={l.unitPrice} /> each
                    </div>
                  </div>
                </div>
              ))}
            </section>
          );
        })}
      </div>
      <aside className="card stack" style={{ position: 'sticky', top: 16 }}>
        <h2>Summary</h2>
        <div className="row between">
          <span>Items ({selectedUnits})</span>
          <strong>
            <Money paisa={cart.selectedSubtotal} />
          </strong>
        </div>
        <div className="row between small muted">
          <span>Shipping</span>
          <span>Per seller, at checkout</span>
        </div>
        {blocked && <div className="note warn">Untick or fix the items marked in red to continue.</div>}
        <button className="btn gold block" disabled={selectedUnits === 0 || blocked} onClick={() => router.push('/checkout')}>
          Checkout ({plural(selectedUnits, 'item')})
        </button>
        <p className="tiny muted">Prices and stock are checked again when you place the order.</p>
      </aside>
    </div>
  );
}

/** Guests see why the cart needs an account instead of being bounced to sign-in. */
function GuestOrCart() {
  const { data: me, isLoading } = useMe();
  if (isLoading) return <Loading />;
  if (!me)
    return (
      <Empty title="Sign in to see your cart">
        <p>Your cart is saved to your account, so it follows you between devices.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/signin?next=/cart" className="btn gold">
            Sign in
          </Link>
          <Link href="/signup" className="btn ghost">
            Create an account
          </Link>
        </div>
      </Empty>
    );
  return <CartView />;
}

export default function CartPage() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <h1>Your cart</h1>
      </div>
      <GuestOrCart />
    </div>
  );
}
