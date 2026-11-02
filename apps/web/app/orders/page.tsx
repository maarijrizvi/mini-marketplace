import Link from 'next/link';
import type { OrderView } from '@mm/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { OrderStatusChip } from './status';

export default async function OrdersPage() {
  await requireUser('/orders', ['customer']);
  const orders = (await serverGet<OrderView[]>('/orders')) ?? [];
  return (
    <>
      <SiteHeader />
      <main className="wrap stack">
        <h1>My orders</h1>
        <p className="hint">Each order can have parcels from several sellers. Open one to track every parcel.</p>
        {!orders.length && (
          <div className="panel">
            <h2>No orders yet</h2>
            <Link href="/shop">Start shopping →</Link>
          </div>
        )}
        {orders.map((o) => (
          <Link key={o.id} href={`/orders/${o.id}`} className="panel order-row">
            <div>
              <strong className="mono">{o.number}</strong>
              <span className="hint">{new Date(o.createdAt).toLocaleDateString()}</span>
            </div>
            <span>
              {o.shipments.map((s) => s.seller.shopName).join(', ')} · {o.shipments.reduce((a, s) => a + s.items.length, 0)} items
            </span>
            <strong>${o.total}</strong>
            <OrderStatusChip order={o} />
          </Link>
        ))}
      </main>
    </>
  );
}
