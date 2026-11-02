'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { paymentOutcomes, type AddressView, type CheckoutQuote, type OrderView, type PaymentOutcome } from '@mm/shared';
import { api } from '@/lib/api';

const outcomeLabels: Record<PaymentOutcome, string> = {
  success: 'Success',
  failure: 'Failure',
  pending: 'Pending',
  unknown: 'Unknown / timeout',
};

export function CheckoutClient({ addresses: initialAddresses, initialQuote }: { addresses: AddressView[]; initialQuote: CheckoutQuote }) {
  const router = useRouter();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [addressId, setAddressId] = useState(initialAddresses.find((a) => a.isDefault)?.id ?? initialAddresses[0]?.id ?? '');
  const [quote, setQuote] = useState(initialQuote);
  const [promo, setPromo] = useState('');
  const [promoMsg, setPromoMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [outcome, setOutcome] = useState<PaymentOutcome>('success');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [newAddress, setNewAddress] = useState({ label: '', line1: '', city: '', postcode: '' });
  const [addressErrors, setAddressErrors] = useState<Record<string, string[]>>({});
  // One key per checkout attempt: pressing twice (or a retry after a timeout) can't create two orders.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);

  async function applyPromo() {
    const res = await api<CheckoutQuote>('/checkout/quote', { body: { promoCode: promo } });
    if (!res.ok) return setPromoMsg({ ok: false, text: res.problem.fieldErrors.promoCode?.[0] ?? res.problem.message });
    setQuote(res.data);
    setPromoMsg({ ok: true, text: res.data.promo ? `${res.data.promo.description} applied.` : 'Code removed.' });
  }

  async function saveAddress() {
    const res = await api<AddressView>('/addresses', {
      body: { ...newAddress, postcode: newAddress.postcode || undefined, isDefault: !addresses.length },
    });
    if (!res.ok) return setAddressErrors(res.problem.fieldErrors);
    setAddresses((a) => [...a, res.data]);
    setAddressId(res.data.id);
    setNewAddress({ label: '', line1: '', city: '', postcode: '' });
    setAddressErrors({});
  }

  async function place() {
    setError('');
    setBusy(true);
    const res = await api<{ order: OrderView }>('/checkout', {
      body: { addressId, idempotencyKey, promoCode: quote.promo?.code, expectedTotal: quote.total, paymentOutcome: outcome },
    });
    setBusy(false);
    if (!res.ok) {
      if (res.problem.code === 'prices_changed') {
        const fresh = await api<CheckoutQuote>('/checkout/quote', { body: { promoCode: quote.promo?.code } });
        if (fresh.ok) setQuote(fresh.data);
      }
      return setError(res.problem.message);
    }
    router.push(`/orders/${res.data.order.id}?placed=1`);
    router.refresh();
  }

  return (
    <div className="cart-layout">
      <div className="stack">
        <section className="panel">
          <h2>1 · Shipping address</h2>
          <div className="options">
            {addresses.map((a) => (
              <label key={a.id} className={`option${a.id === addressId ? ' on' : ''}`}>
                <input type="radio" name="address" checked={a.id === addressId} onChange={() => setAddressId(a.id)} />
                <span>
                  <strong>{a.label}</strong>
                  <span className="hint">
                    {a.line1}
                    {a.line2 ? `, ${a.line2}` : ''}, {a.city} {a.postcode ?? ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {!addresses.length && <p className="errmsg">Add a shipping address to place this order.</p>}
          <details open={!addresses.length}>
            <summary className="link-btn">+ Add a new address</summary>
            <div className="address-form">
              {(
                [
                  ['label', 'Label', 'e.g. Home'],
                  ['line1', 'Street address', ''],
                  ['city', 'City', ''],
                  ['postcode', 'Postcode (optional)', ''],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div className="field" key={key}>
                  <label className="lbl" htmlFor={`addr-${key}`}>
                    {label}
                  </label>
                  <input
                    id={`addr-${key}`}
                    className={`input${addressErrors[key] ? ' err' : ''}`}
                    placeholder={placeholder}
                    value={newAddress[key]}
                    onChange={(e) => setNewAddress((a) => ({ ...a, [key]: e.target.value }))}
                  />
                  {addressErrors[key] && <p className="errmsg">{addressErrors[key][0]}</p>}
                </div>
              ))}
              <button className="btn navy small" type="button" onClick={saveAddress}>
                Save and use this address
              </button>
            </div>
          </details>
        </section>
        <section className="panel">
          <h2>2 · Payment</h2>
          <p className="hint">Payments run through a simulated provider. No card details are stored, only the provider’s reference.</p>
          <fieldset className="options">
            <legend className="lbl">Sandbox outcome (testing only)</legend>
            {paymentOutcomes.map((o) => (
              <label key={o} className={`option${o === outcome ? ' on' : ''}`}>
                <input type="radio" name="outcome" checked={o === outcome} onChange={() => setOutcome(o)} />
                <span>{outcomeLabels[o]}</span>
              </label>
            ))}
          </fieldset>
        </section>
        <section className="panel">
          <h2>
            3 · Review: {quote.sellers.length} {quote.sellers.length === 1 ? 'shipment' : 'shipments'}
          </h2>
          {quote.sellers.map((s) => (
            <div key={s.sellerId} className="shipment">
              <div className="row">
                <strong>{s.shopName}</strong>
                <span className="hint">Separate parcel · delivered by our shipping partner</span>
              </div>
              {s.lines.map((l) => (
                <div key={l.name} className="row">
                  <span>
                    {l.name} × {l.quantity}
                  </span>
                  <span>${l.lineTotal}</span>
                </div>
              ))}
            </div>
          ))}
          <Link href="/cart">Change items</Link>
        </section>
      </div>
      <aside className="panel summary" aria-label="Order total">
        <h2>Order total</h2>
        <div className="field">
          <label className="lbl" htmlFor="promo">
            Promo code
          </label>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input id="promo" className="input" placeholder="WELCOME10" value={promo} onChange={(e) => setPromo(e.target.value)} />
            <button className="btn ghost small" type="button" onClick={applyPromo} style={{ width: 'auto' }}>
              Apply
            </button>
          </div>
          {promoMsg && <p className={promoMsg.ok ? 'hint ok-text' : 'errmsg'}>{promoMsg.text}</p>}
        </div>
        {quote.sellers.map((s) => (
          <div key={s.sellerId} className="row">
            <span className="hint">{s.shopName}</span>
            <span>${s.subtotal}</span>
          </div>
        ))}
        <div className="row">
          <span className="hint">
            Shipping · {quote.sellers.length} {quote.sellers.length === 1 ? 'parcel' : 'parcels'}
          </span>
          <span>${quote.shipping}</span>
        </div>
        {quote.promo && (
          <div className="row">
            <span className="hint ok-text">Discount · {quote.promo.code}</span>
            <span className="ok-text">−${quote.discount}</span>
          </div>
        )}
        <div className="row total">
          <strong>Total</strong>
          <strong>${quote.total}</strong>
        </div>
        {error && (
          <div className="note bad" role="alert">
            {error}
          </div>
        )}
        <button className="btn" onClick={place} disabled={busy || !addressId}>
          {busy ? 'Placing your order…' : `Place order · $${quote.total}`}
        </button>
        <p className="hint">Prices were checked just now. Pressing twice won’t create a second order or charge.</p>
      </aside>
    </div>
  );
}
