'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ParcelTimeline } from '@/components/ParcelTimeline';
import { RequireUser } from '@/components/guards';
import { Dialog, ErrorNote, Loading, Money, StatusChip } from '@/components/ui';
import { dateTime, optionsLabel, orderStatus, parcelStatus, paymentMethodLabel, paymentStatus } from '@/features/format';
import { canCancel, useCancelOrder, useOrder } from '@/features/shopping';

function OrderView({ id }: { id: string }) {
  const params = useSearchParams();
  const { data: o, isLoading, error } = useOrder(id);
  const cancel = useCancelOrder(id);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');

  if (isLoading) return <Loading />;
  if (error || !o) return <ErrorNote error={error} />;

  const charge = o.payments.find((p) => p.kind === 'charge' && p.method !== 'cod');
  const banner =
    o.status === 'pending_payment'
      ? ['warn', `Waiting for your payment. Your items are held until ${dateTime(o.reservedUntil)}.`]
      : o.status === 'cancelled'
        ? ['bad', `This order was cancelled${o.cancelReason ? `: ${o.cancelReason}` : ''}.${o.payments.some((p) => p.kind === 'refund') ? ' Refunds are listed under Payments.' : ''}`]
        : params.get('placed')
          ? ['ok', 'Order placed — thank you. Every seller has been told, and a confirmation email is on its way.']
          : null;

  return (
    <div className="stack-lg">
      {banner && (
        <div className={`note ${banner[0]}`} role="status">
          {banner[1]}
          {o.status === 'pending_payment' && charge && (
            <>
              {' '}
              <Link href={`/sandbox/pay/${charge.id}`}>Go to payment</Link>
            </>
          )}
        </div>
      )}
      <div className="cols-2">
        <div className="stack">
          {o.parcels.map((p, i) => (
            <section key={p.id} className="card stack">
              <div className="row between">
                <h3>
                  Parcel {i + 1} · {p.seller.shopName}
                </h3>
                <StatusChip map={parcelStatus} value={p.status} />
              </div>
              <ParcelTimeline status={p.status} />
              {p.trackingNo && (
                <span className="small">
                  Leopards tracking <span className="mono">{p.trackingNo}</span>
                </span>
              )}
              {p.items.map((it) => (
                <div key={it.id} className="row between small" style={{ opacity: it.status === 'dropped' ? 0.6 : 1 }}>
                  <span>
                    {it.quantity} × {it.productName}
                    {Object.keys(it.options).length > 0 && <span className="muted"> · {optionsLabel(it.options)}</span>}
                    {it.status === 'dropped' && <span className="chip bad" style={{ marginLeft: 8 }}>Not sent</span>}
                  </span>
                  <Money paisa={it.lineTotal} />
                </div>
              ))}
              <div className="row between small muted">
                <span>Shipping</span>
                <Money paisa={p.shippingFee} />
              </div>
              {p.codAmount !== null && p.status !== 'cancelled' && (
                <div className="row between small">
                  <span>Pay the courier</span>
                  <strong>
                    <Money paisa={p.codAmount} />
                  </strong>
                </div>
              )}
            </section>
          ))}
        </div>
        <aside className="stack">
          <section className="card stack">
            <div className="row between">
              <h2>Order #{o.id}</h2>
              <StatusChip map={orderStatus} value={o.status} />
            </div>
            <dl className="kv">
              <dt>Placed</dt>
              <dd>{dateTime(o.placedAt)}</dd>
              <dt>Payment</dt>
              <dd>{o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online'}</dd>
              <dt>Total</dt>
              <dd>
                <strong>
                  <Money paisa={o.total} />
                </strong>
              </dd>
              {o.refunded > 0 && (
                <>
                  <dt>Refunded</dt>
                  <dd>
                    <Money paisa={o.refunded} />
                  </dd>
                </>
              )}
              {o.cancelReason && (
                <>
                  <dt>Cancelled</dt>
                  <dd>{o.cancelReason}</dd>
                </>
              )}
              <dt>Ship to</dt>
              <dd>
                {o.shippingAddress.recipient}, {[o.shippingAddress.line1, o.shippingAddress.area, o.shippingAddress.city].filter(Boolean).join(', ')}
              </dd>
            </dl>
          </section>
          {o.payments.length > 0 && (
            <section className="card stack">
              <h3>Payments</h3>
              {o.payments.map((p) => (
                <div key={p.id} className="row between small">
                  <span>
                    {p.kind === 'refund' ? 'Refund' : paymentMethodLabel[p.method]} <StatusChip map={paymentStatus} value={p.status} />
                  </span>
                  <Money paisa={p.amount} />
                </div>
              ))}
            </section>
          )}
          {canCancel(o) && (
            <>
              <button className="btn danger" onClick={() => setConfirm(true)}>
                Cancel order
              </button>
              <p className="tiny muted">You can cancel until the first parcel is picked up by the courier.</p>
            </>
          )}
        </aside>
      </div>
      {confirm && (
        <Dialog title={`Cancel order #${o.id}?`} onClose={() => setConfirm(false)}>
          <p className="muted">
            Every parcel is cancelled and your items go back on sale.
            {o.paymentMethod === 'online' && o.status === 'placed' ? ' Your payment is refunded in full.' : ''}
          </p>
          <div className="field">
            <label htmlFor="reason">Reason (optional)</label>
            <input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <ErrorNote error={cancel.error} />
          <div className="row">
            <button className="btn danger" disabled={cancel.isPending} onClick={() => cancel.mutate(reason || undefined, { onSuccess: () => setConfirm(false) })}>
              {cancel.isPending ? 'Cancelling…' : 'Yes, cancel it'}
            </button>
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Keep order
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

export default function OrderPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="wrap page">
      <div className="page-head">
        <h1>Order tracking</h1>
        <Link href="/orders">← All orders</Link>
      </div>
      <RequireUser>
        {() => (
          <Suspense fallback={<Loading />}>
            <OrderView id={id} />
          </Suspense>
        )}
      </RequireUser>
    </div>
  );
}
