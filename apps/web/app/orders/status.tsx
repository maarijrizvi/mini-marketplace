import type { OrderView, SellerOrderStatusView } from '@mm/shared';

export function orderStatus(o: OrderView): { label: string; tone: '' | 'ok' | 'bad' } {
  if (o.status === 'payment_failed') return { label: 'Payment failed', tone: 'bad' };
  if (o.status === 'cancelled') return { label: 'Cancelled', tone: 'bad' };
  if (o.status === 'pending_payment') return { label: o.payment?.status === 'unknown' ? 'Checking payment' : 'Payment pending', tone: '' };
  if (o.shipments.every((s) => s.status === 'delivered' || s.status === 'cancelled')) return { label: 'Delivered', tone: 'ok' };
  return { label: 'In progress', tone: 'ok' };
}

export function OrderStatusChip({ order }: { order: OrderView }) {
  const s = orderStatus(order);
  return <span className={`chip ${s.tone}`}>{s.label}</span>;
}

export const shipmentSteps: SellerOrderStatusView[] = ['new', 'confirmed', 'packed', 'shipped', 'delivered'];
export const shipmentLabels: Record<SellerOrderStatusView, string> = {
  new: 'Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};
