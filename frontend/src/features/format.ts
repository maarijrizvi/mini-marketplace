/** Display rules shared by every screen: money, dates and what each status means to a person. */
import type { Schemas } from '@/lib/api/client';

type S = Schemas;

/** Paisa → "Rs 1,299" (or "Rs 1,299.50"). */
export function rupees(paisa: number): string {
  const r = paisa / 100;
  return `Rs ${r.toLocaleString('en-PK', { minimumFractionDigits: paisa % 100 ? 2 : 0, maximumFractionDigits: 2 })}`;
}

/** "Rs 1,299" input → paisa. Returns null if it isn't a positive amount. */
export function parseRupees(text: string): number | null {
  const n = Number(text.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
}

export function date(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-PK', { dateStyle: 'medium' });
}

export function optionsLabel(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([k, v]) => `${k[0].toUpperCase()}${k.slice(1)}: ${v}`)
    .join(' · ');
}

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

export const orderStatus: Record<S['OrderStatus'], [string, Tone]> = {
  pending_payment: ['Awaiting payment', 'warn'],
  placed: ['In progress', 'info'],
  completed: ['Completed', 'ok'],
  cancelled: ['Cancelled', 'bad'],
};

export const parcelStatus: Record<S['ParcelStatus'], [string, Tone]> = {
  pending: ['Preparing', 'info'],
  shipped: ['With Leopards', 'info'],
  delivered: ['Delivered', 'ok'],
  refused: ['Refused at door', 'bad'],
  delivery_failed: ['Delivery failed', 'bad'],
  cancelled: ['Cancelled', 'bad'],
};

export const paymentStatus: Record<S['PaymentStatus'], [string, Tone]> = {
  pending: ['Pending', 'warn'],
  succeeded: ['Succeeded', 'ok'],
  failed: ['Failed', 'bad'],
};

export const sellerStatus: Record<S['SellerStatus'], [string, Tone]> = {
  pending: ['Awaiting review', 'warn'],
  approved: ['Approved', 'ok'],
  rejected: ['Rejected', 'bad'],
  suspended: ['Suspended', 'bad'],
};

export const productStatus: Record<S['ProductStatus'], [string, Tone]> = {
  draft: ['Draft', 'neutral'],
  active: ['Live', 'ok'],
  archived: ['Archived', 'bad'],
};

export const paymentMethodLabel: Record<S['PaymentMethod'], string> = {
  cod: 'Cash on delivery',
  card: 'Card',
  wallet: 'Mobile wallet',
};

export const dropReasons: { value: S['DropItemRequest']['reason']; label: string }[] = [
  { value: 'out_of_stock', label: 'Item out of stock' },
  { value: 'damaged', label: 'Item damaged' },
  { value: 'cannot_ship_to_address', label: "Can't ship to this address" },
  { value: 'other', label: 'Other' },
];

/** The steps a parcel goes through, for the tracking timeline. */
export const parcelSteps: { key: S['ParcelStatus']; label: string }[] = [
  { key: 'pending', label: 'Placed' },
  { key: 'shipped', label: 'Picked up' },
  { key: 'delivered', label: 'Delivered' },
];

export function initials(first: string, last = ''): string {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}
