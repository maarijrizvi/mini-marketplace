import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { OrderView } from '@mm/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { OrderStatusChip, shipmentLabels, shipmentSteps } from '../status';

const results = {
  placed: {
    tone: 'ok',
    title: 'Order placed — thank you',
    body: 'Every seller has been notified. A confirmation email is on its way and each shipment can be tracked separately.',
  },
  payment_failed: {
    tone: 'bad',
    title: 'Your payment didn’t go through',
    body: 'You have not been charged. The items we held for you have been released and they’re still in your cart. Try again.',
  },
  pending: {
    tone: 'warn',
    title: 'We’re waiting on the payment provider',
    body: 'Your items are held while the provider confirms. We’ll email you as soon as it clears; there’s no need to pay again.',
  },
  unknown: {
    tone: 'info',
    title: 'We couldn’t confirm your payment yet',
    body: 'The provider didn’t respond in time. We’re checking automatically and will never charge you twice. Please don’t resubmit.',
  },
} as const;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const [{ id }, { placed }] = await Promise.all([params, searchParams]);
  await requireUser(`/orders/${id}`, ['customer']);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const order = await serverGet<OrderView>(`/orders/${id}`);
  if (!order) notFound();

  const result =
    order.status === 'payment_failed'
      ? results.payment_failed
      : order.status === 'pending_payment'
        ? order.payment?.status === 'unknown'
          ? results.unknown
          : results.pending
        : results.placed;

  return (
    <>
      <SiteHeader />
      <main className="wrap stack">
        <nav className="crumbs">
          <Link href="/orders">← All orders</Link>
        </nav>
        {placed && (
          <div className={`note ${result.tone}`} role="status">
            <strong>{result.title}.</strong> {result.body} {order.status === 'payment_failed' && <Link href="/cart">Back to cart</Link>}
          </div>
        )}
        <div className="row">
          <h1>
            Order <span className="mono">{order.number}</span>
          </h1>
          <OrderStatusChip order={order} />
        </div>
        <section className="panel facts-row">
          <div>
            <span className="hint">Payment</span>
            <strong>{order.payment?.status ?? '—'}</strong>
          </div>
          <div>
            <span className="hint">Reference</span>
            <span className="mono">{order.payment?.reference ?? 'Awaiting provider'}</span>
          </div>
          <div>
            <span className="hint">Total</span>
            <strong>${order.total}</strong>
          </div>
          <div>
            <span className="hint">Ship to</span>
            <span>
              {order.shipTo.label} · {order.shipTo.line1}, {order.shipTo.city}
            </span>
          </div>
        </section>
        {order.shipments.map((s, i) => {
          const at = shipmentSteps.indexOf(s.status);
          return (
            <section key={s.id} className="panel">
              <div className="row">
                <h2>
                  Shipment {i + 1} · {s.seller.shopName}
                </h2>
                <span className={`chip ${s.status === 'cancelled' ? 'bad' : ''}`}>{shipmentLabels[s.status]}</span>
              </div>
              {s.status !== 'cancelled' && (
                <ol className="steps">
                  {shipmentSteps.map((step, n) => (
                    <li key={step} className={n <= at ? 'done' : ''}>
                      {shipmentLabels[step]}
                    </li>
                  ))}
                </ol>
              )}
              {s.items.map((item) => (
                <div key={item.productId} className="row">
                  <span>
                    {item.name} · Qty {item.quantity} · ${item.unitPrice} each
                  </span>
                  <strong>${item.lineTotal}</strong>
                </div>
              ))}
            </section>
          );
        })}
        <section className="panel">
          <div className="row">
            <span className="hint">Items</span>
            <span>${order.subtotal}</span>
          </div>
          {order.discount !== '0.00' && (
            <div className="row">
              <span className="hint">Discount</span>
              <span>−${order.discount}</span>
            </div>
          )}
          <div className="row">
            <span className="hint">Shipping</span>
            <span>${order.shipping}</span>
          </div>
          <div className="row total">
            <strong>Total</strong>
            <strong>${order.total}</strong>
          </div>
        </section>
        {order.payment?.status === 'succeeded' && (
          <p className="hint">Prices shown are what you paid. They won’t change if a seller updates their listing later.</p>
        )}
      </main>
    </>
  );
}
