'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ParcelTimeline } from '@/components/ParcelTimeline';
import { Dialog, Empty, ErrorNote, Loading, Money, StatusChip } from '@/components/ui';
import { useAdminCancelOrder, useAdminOrder, useAdminOrders, useAdminPayments } from '@/features/admin';
import { dateTime, optionsLabel, orderStatus, parcelStatus, paymentMethodLabel, paymentStatus } from '@/features/format';
import { canCancel } from '@/features/shopping';
import type { Schemas } from '@/lib/api/client';

function OrderPanel({ id }: { id: string }) {
  const { data: o, isLoading } = useAdminOrder(id);
  const cancel = useAdminCancelOrder();
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  if (isLoading || !o) return <Loading />;
  return (
    <section className="card stack">
      <div className="row between">
        <h2>Order #{o.id}</h2>
        <StatusChip map={orderStatus} value={o.status} />
      </div>
      <dl className="kv">
        <dt>Placed</dt>
        <dd>{dateTime(o.placedAt)}</dd>
        <dt>Total</dt>
        <dd>
          <Money paisa={o.total} /> {o.refunded > 0 && <span className="muted">(refunded <Money paisa={o.refunded} />)</span>}
        </dd>
        {o.cancelReason && (
          <>
            <dt>Cancelled</dt>
            <dd>{o.cancelReason}</dd>
          </>
        )}
        <dt>Ship to</dt>
        <dd>
          {o.shippingAddress.recipient}, {o.shippingAddress.city}
        </dd>
      </dl>
      <h3>Parcels</h3>
      {o.parcels.map((p) => (
        <div key={p.id} className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 10, gap: 6 }}>
          <div className="row between">
            <strong>{p.seller.shopName}</strong>
            <StatusChip map={parcelStatus} value={p.status} />
          </div>
          <ParcelTimeline status={p.status} />
          {p.items.map((it) => (
            <div key={it.id} className="row between small">
              <span>
                {it.quantity} × {it.productName} <span className="muted">{optionsLabel(it.options)}</span>
                {it.status === 'dropped' && <span className="chip bad"> dropped</span>}
              </span>
              <span className="muted">{it.reservation}</span>
            </div>
          ))}
          {p.trackingNo && <span className="tiny mono">{p.trackingNo}</span>}
        </div>
      ))}
      <h3>Payment events</h3>
      {o.payments.length === 0 ? (
        <p className="small muted">None yet{o.paymentMethod === 'cod' ? ' — COD is recorded when the courier collects.' : '.'}</p>
      ) : (
        o.payments.map((p) => (
          <div key={p.id} className="row between small">
            <span>
              {p.kind === 'refund' ? 'Refund' : 'Charge'} · {paymentMethodLabel[p.method]} <StatusChip map={paymentStatus} value={p.status} />
              <div className="tiny mono muted">{p.providerRef}</div>
            </span>
            <Money paisa={p.amount} />
          </div>
        ))
      )}
      {canCancel(o) && (
        <>
          <button className="btn danger" onClick={() => setAsking(true)}>
            Cancel order &amp; refund
          </button>
          <p className="tiny muted">Only possible while nothing has been picked up. Stock goes back to the sellers.</p>
        </>
      )}
      {asking && (
        <Dialog title={`Cancel order #${o.id}?`} onClose={() => setAsking(false)}>
          <div className="field">
            <label htmlFor="creason">Reason (shown to the customer)</label>
            <input id="creason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <ErrorNote error={cancel.error} />
          <button className="btn danger" disabled={!reason.trim() || cancel.isPending} onClick={() => cancel.mutate({ id: o.id, reason }, { onSuccess: () => setAsking(false) })}>
            Cancel order
          </button>
        </Dialog>
      )}
    </section>
  );
}

function Payments() {
  const [status, setStatus] = useState<Schemas['PaymentStatus'] | undefined>();
  const { data, isLoading } = useAdminPayments({ status });
  return (
    <div className="stack">
      <div className="tabs">
        {([undefined, 'pending', 'succeeded', 'failed'] as const).map((s) => (
          <button key={s ?? 'all'} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
            {s ? paymentStatus[s][0] : 'All'}
          </button>
        ))}
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Kind</th>
                <th>Method</th>
                <th>Reference</th>
                <th>Amount</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((p) => (
                <tr key={p.id}>
                  <td>#{p.orderId}</td>
                  <td>{p.kind}</td>
                  <td>{paymentMethodLabel[p.method]}</td>
                  <td className="mono">{p.providerRef}</td>
                  <td>
                    <Money paisa={p.amount} />
                  </td>
                  <td>
                    <StatusChip map={paymentStatus} value={p.status} />
                  </td>
                  <td>{dateTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab = params.get('tab') ?? 'orders';
  const [status, setStatus] = useState<Schemas['OrderStatus'] | undefined>();
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useAdminOrders({ status, q: q || undefined });
  const [selected, setSelected] = useState<string | null>(params.get('order'));

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Orders &amp; payments</h1>
          <p>Inspect any checkout, its payments and each seller&apos;s parcel.</p>
        </div>
        <div className="tabs">
          <button className={`tab ${tab === 'orders' ? 'on' : ''}`} onClick={() => router.push(path)}>
            Orders
          </button>
          <button className={`tab ${tab === 'payments' ? 'on' : ''}`} onClick={() => router.push(`${path}?tab=payments`)}>
            Payments
          </button>
        </div>
      </div>
      {tab === 'payments' ? (
        <Payments />
      ) : (
        <>
          <div className="row between">
            <div className="tabs">
              {([undefined, 'pending_payment', 'placed', 'completed', 'cancelled'] as const).map((s) => (
                <button key={s ?? 'all'} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
                  {s ? orderStatus[s][0] : 'All'}
                </button>
              ))}
            </div>
            <input className="input" style={{ maxWidth: 280 }} placeholder="Order #, email or tracking no." aria-label="Search orders" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ErrorNote error={error} />
          {isLoading ? (
            <Loading />
          ) : !data?.items.length ? (
            <Empty title="No orders match" />
          ) : (
            <div className="split">
              <div className="card flush scroll-x">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Placed</th>
                      <th>Parcels</th>
                      <th>Payment</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((o) => (
                      <tr key={o.id} className={`clickable ${selected === o.id ? 'on' : ''}`} onClick={() => setSelected(o.id)}>
                        <td>
                          <button className="linkbtn">#{o.id}</button>
                        </td>
                        <td>{dateTime(o.placedAt)}</td>
                        <td>{o.parcelCount}</td>
                        <td>{o.paymentMethod === 'cod' ? 'COD' : 'Online'}</td>
                        <td>
                          <Money paisa={o.total} />
                        </td>
                        <td>
                          <StatusChip map={orderStatus} value={o.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected ? <OrderPanel key={selected} id={selected} /> : <div className="card muted small">Pick an order to see its parcels and payments.</div>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Orders />
    </Suspense>
  );
}
