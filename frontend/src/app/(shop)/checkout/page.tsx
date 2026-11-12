'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AddressForm } from '@/components/AddressForm';
import { RequireUser } from '@/components/guards';
import { Empty, ErrorNote, Loading, Money } from '@/components/ui';
import { optionsLabel, paymentMethodLabel } from '@/features/format';
import { useAddressMutations, useAddresses, usePlaceOrder, useQuote } from '@/features/shopping';
import { ApiError, type Schemas } from '@/lib/api/client';

type Method = Schemas['PaymentMethod'];

const METHODS: { value: Method; hint: string }[] = [
  { value: 'cod', hint: 'Pay each courier in cash when your parcel arrives.' },
  { value: 'card', hint: 'Debit or credit card. Paid once for the whole order.' },
  { value: 'wallet', hint: 'JazzCash or Easypaisa. Paid once for the whole order.' },
];

function Checkout() {
  const router = useRouter();
  const { data: addresses, isLoading } = useAddresses();
  const { add } = useAddressMutations();
  const [picked, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [method, setMethod] = useState<Method>('cod');
  // The default (first) address is chosen until the customer picks another.
  const addressId = picked ?? addresses?.items[0]?.id ?? null;
  const quote = useQuote(addressId);
  const place = usePlaceOrder();

  if (isLoading) return <Loading />;
  const list = addresses?.items ?? [];
  const q = quote.data;
  const quoteError = quote.error instanceof ApiError ? quote.error : null;
  const changed = place.error instanceof ApiError && place.error.code === 'prices_changed';

  const submit = () => {
    if (!addressId || !q) return;
    place.mutate(
      { addressId, paymentMethod: method, expectedTotal: q.total },
      {
        onSuccess: (r) => {
          if (r.payment) router.push(new URL(r.payment.redirectUrl, window.location.origin).pathname);
          else router.push(`/orders/${r.order.id}?placed=1`);
        },
        onError: () => quote.refetch(),
      },
    );
  };

  if (quoteError?.code === 'nothing_selected')
    return (
      <Empty title="Nothing to check out">
        <p>Tick at least one item in your cart.</p>
        <Link href="/cart" className="btn ghost">
          Back to cart
        </Link>
      </Empty>
    );

  return (
    <div className="cols-2">
      <div className="stack-lg">
        <section className="card stack">
          <h2>1 · Shipping address</h2>
          {list.map((a) => (
            <label key={a.id} className="radio-card">
              <input type="radio" name="address" checked={addressId === a.id} onChange={() => setAddressId(a.id)} />
              <span>
                <strong>{a.label}</strong> · {a.recipient}
                <br />
                <span className="small muted">
                  {[a.line1, a.area, a.city].filter(Boolean).join(', ')} · {a.phone}
                </span>
              </span>
            </label>
          ))}
          {adding || list.length === 0 ? (
            <AddressForm
              submitLabel="Save address"
              pending={add.isPending}
              error={add.error}
              onCancel={list.length ? () => setAdding(false) : undefined}
              onSubmit={(body) =>
                add.mutate(body, {
                  onSuccess: (r) => {
                    setAdding(false);
                    setAddressId(r.items[r.items.length - 1].id);
                  },
                })
              }
            />
          ) : (
            <button className="linkbtn" onClick={() => setAdding(true)}>
              + Add a new address
            </button>
          )}
        </section>

        <section className="card stack">
          <h2>2 · Payment</h2>
          {METHODS.map((m) => (
            <label key={m.value} className="radio-card">
              <input type="radio" name="method" checked={method === m.value} onChange={() => setMethod(m.value)} />
              <span>
                <strong>{paymentMethodLabel[m.value]}</strong>
                <br />
                <span className="small muted">{m.hint}</span>
              </span>
            </label>
          ))}
          {method !== 'cod' && (
            <p className="tiny muted">
              Payments run through a simulated gateway. Your items are held for 15 minutes while you pay.
            </p>
          )}
        </section>

        <section className="card stack">
          <h2>3 · Review: {q ? `${q.parcels.length} parcel${q.parcels.length > 1 ? 's' : ''}` : '…'}</h2>
          {quote.isLoading && <Loading />}
          {quoteError && quoteError.code !== 'nothing_selected' && <ErrorNote error={quoteError} />}
          {q?.parcels.map((p) => (
            <div key={p.seller.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, gap: 6 }}>
              <div className="row between">
                <strong>{p.seller.shopName}</strong>
                <span className="small muted">Separate parcel · Leopards Courier</span>
              </div>
              {p.lines.map((l) => (
                <div key={l.variantId} className="row between small">
                  <span>
                    {l.quantity} × {l.name}
                    {Object.keys(l.options).length > 0 && <span className="muted"> · {optionsLabel(l.options)}</span>}
                  </span>
                  <Money paisa={l.lineTotal} />
                </div>
              ))}
              <div className="row between small muted">
                <span>Shipping</span>
                <Money paisa={p.shippingFee} />
              </div>
            </div>
          ))}
        </section>
      </div>

      <aside className="card stack" style={{ position: 'sticky', top: 16 }}>
        <h2>Order total</h2>
        {q && (
          <>
            {q.parcels.map((p) => (
              <div key={p.seller.id} className="row between small">
                <span>{p.seller.shopName}</span>
                <Money paisa={p.itemsTotal} />
              </div>
            ))}
            <div className="row between small">
              <span>Shipping · {q.parcels.length} parcel{q.parcels.length > 1 ? 's' : ''}</span>
              <Money paisa={q.shippingTotal} />
            </div>
            <hr className="divider" />
            <div className="row between" style={{ fontSize: 20, fontWeight: 700 }}>
              <span>Total</span>
              <Money paisa={q.total} />
            </div>
          </>
        )}
        {changed ? (
          <div className="note warn">Prices or stock changed while you were here. Check the new total and place the order again.</div>
        ) : (
          <ErrorNote error={place.error} />
        )}
        <button className="btn gold block" disabled={!q || !addressId || place.isPending} onClick={submit}>
          {place.isPending ? 'Placing order…' : q ? `Place order · ${method === 'cod' ? 'pay on delivery' : 'pay now'}` : 'Place order'}
        </button>
        <p className="tiny muted">Pressing twice never creates a second order or a second charge.</p>
      </aside>
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <h1>Checkout</h1>
        <Link href="/cart">Back to cart</Link>
      </div>
      <RequireUser>{() => <Checkout />}</RequireUser>
    </div>
  );
}
