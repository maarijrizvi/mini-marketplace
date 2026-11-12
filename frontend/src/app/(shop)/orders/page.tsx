'use client';

import Link from 'next/link';
import { RequireUser } from '@/components/guards';
import { Empty, ErrorNote, Loading, Money, StatusChip } from '@/components/ui';
import { dateTime, orderStatus } from '@/features/format';
import { useOrders } from '@/features/shopping';

function Orders() {
  const { data, isLoading, error } = useOrders();
  if (isLoading) return <Loading />;
  if (error) return <ErrorNote error={error} />;
  if (!data?.items.length)
    return (
      <Empty title="No orders yet">
        <Link href="/shop" className="btn gold">
          Start shopping
        </Link>
      </Empty>
    );
  return (
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
            <tr key={o.id}>
              <td>
                <Link href={`/orders/${o.id}`} style={{ fontWeight: 600 }}>
                  #{o.id}
                </Link>
              </td>
              <td>{dateTime(o.placedAt)}</td>
              <td>{o.parcelCount}</td>
              <td>{o.paymentMethod === 'cod' ? 'Cash on delivery' : 'Online'}</td>
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
  );
}

export default function OrdersPage() {
  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>My orders</h1>
          <p>Each seller ships their own parcel, so one order can arrive in several deliveries.</p>
        </div>
      </div>
      <RequireUser>{() => <Orders />}</RequireUser>
    </div>
  );
}
