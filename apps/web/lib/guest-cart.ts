'use client';

import { api } from './api';

/**
 * A signed-out shopper's cart lives in this browser until they sign in, then merges into the
 * account cart. Storage can be unavailable (private mode), so every access is guarded.
 */
export interface GuestItem {
  productId: string;
  quantity: number;
  selected: boolean;
}

const KEY = 'mm_guest_cart';
export const GUEST_CART_EVENT = 'mm-guest-cart';

export function readGuestCart(): GuestItem[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as GuestItem[];
  } catch {
    return [];
  }
}

export function writeGuestCart(items: GuestItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(GUEST_CART_EVENT));
}

export function addToGuestCart(productId: string, quantity: number, selectOnly = false) {
  const items = readGuestCart().map((i) => (selectOnly ? { ...i, selected: false } : i));
  const hit = items.find((i) => i.productId === productId);
  if (hit) {
    hit.quantity = selectOnly ? quantity : Math.min(99, hit.quantity + quantity);
    if (selectOnly) hit.selected = true;
  } else items.push({ productId, quantity, selected: selectOnly });
  writeGuestCart(items);
}

/** Called right after sign-in or verification. Merges and clears the guest cart. */
export async function mergeGuestCart() {
  const items = readGuestCart();
  if (!items.length) return;
  const res = await api('/cart/merge', { body: { items } });
  if (res.ok || res.problem.status === 403) writeGuestCart([]); // sellers and admins have no cart
}
