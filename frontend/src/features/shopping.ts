'use client';
/** Catalogue, cart, checkout and the customer's orders. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import type { Schemas } from '@/lib/api/client';
import { cartApi, catalogApi, checkoutApi, meApi, ordersApi, type ProductQuery } from '@/lib/api/endpoints';

type S = Schemas;

// ── Catalogue ────────────────────────────────────────────────────────

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: catalogApi.categories, staleTime: 5 * 60_000 });
}

/** Categories as a tree, parents first. */
export function categoryTree(items: S['CategoryOut'][]) {
  const roots = items.filter((c) => !c.parentId);
  return roots.map((r) => ({ ...r, children: items.filter((c) => c.parentId === r.id) }));
}

export function useProducts(query: ProductQuery) {
  return useQuery({
    queryKey: ['products', query],
    queryFn: () => catalogApi.products(query),
    placeholderData: keepPreviousData,
  });
}

export function useProduct(id: string) {
  return useQuery({ queryKey: ['product', id], queryFn: () => catalogApi.product(id) });
}

/** Pick the variant matching the chosen options, or null while a choice is missing. */
export function matchVariant(product: S['ProductDetail'], chosen: Record<string, string>) {
  return (
    product.variants.find((v) => product.optionNames.every((name) => v.options[name] === chosen[name])) ?? null
  );
}

// ── Cart ─────────────────────────────────────────────────────────────

export function useCart(enabled = true) {
  return useQuery({ queryKey: ['cart'], queryFn: cartApi.get, enabled });
}

export function cartCount(cart: S['Cart'] | undefined): number {
  return cart?.groups.reduce((n, g) => n + g.lines.reduce((m, l) => m + l.quantity, 0), 0) ?? 0;
}

function useCartMutation<A>(fn: (a: A) => Promise<S['Cart']>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: (cart) => qc.setQueryData(['cart'], cart) });
}

export const useAddToCart = () =>
  useCartMutation(({ variantId, quantity }: { variantId: string; quantity: number }) => cartApi.add(variantId, quantity));
export const useUpdateCartLine = () =>
  useCartMutation(({ variantId, ...body }: { variantId: string } & S['CartItemUpdate']) =>
    cartApi.update(variantId, body),
  );
export const useRemoveCartLine = () => useCartMutation((variantId: string) => cartApi.remove(variantId));
export const useSelectCartLines = () =>
  useCartMutation(({ selected, variantIds }: { selected: boolean; variantIds?: string[] }) =>
    cartApi.select(selected, variantIds),
  );

/** "Buy now": put this variant in the cart and make it the only ticked line. */
export function useBuyNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ variantId, quantity }: { variantId: string; quantity: number }) => {
      await cartApi.add(variantId, quantity);
      await cartApi.select(false);
      return cartApi.select(true, [variantId]);
    },
    onSuccess: (cart) => qc.setQueryData(['cart'], cart),
  });
}

// ── Addresses ────────────────────────────────────────────────────────

export function useAddresses(enabled = true) {
  return useQuery({ queryKey: ['addresses'], queryFn: meApi.addresses, enabled });
}

export function useAddressMutations() {
  const qc = useQueryClient();
  const set = (list: S['AddressList']) => qc.setQueryData(['addresses'], list);
  return {
    add: useMutation({ mutationFn: meApi.addAddress, onSuccess: set }),
    update: useMutation({
      mutationFn: ({ id, body }: { id: string; body: S['AddressInput'] }) => meApi.updateAddress(id, body),
      onSuccess: set,
    }),
    remove: useMutation({ mutationFn: meApi.removeAddress, onSuccess: set }),
    makeDefault: useMutation({ mutationFn: meApi.makeDefault, onSuccess: set }),
  };
}

// ── Checkout ─────────────────────────────────────────────────────────

export function useQuote(addressId: string | null) {
  return useQuery({
    queryKey: ['quote', addressId],
    queryFn: () => checkoutApi.quote(addressId!),
    enabled: !!addressId,
    retry: false,
  });
}

const KEY_STORE = 'mm-checkout-key';

/** Random key; `crypto.randomUUID` needs HTTPS, and the server runs on plain HTTP, so use getRandomValues. */
function newKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `co-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Placing an order. One idempotency key per attempt: a retry after a network error or a double click reuses it, so
 * at most one order is ever created. The key is dropped once the server answers with a final result.
 */
export function usePlaceOrder() {
  const qc = useQueryClient();
  const [key, setKey] = useState<string>(() => {
    if (typeof window === 'undefined') return newKey();
    return sessionStorage.getItem(KEY_STORE) ?? newKey();
  });
  const fresh = useCallback(() => {
    const k = newKey();
    sessionStorage.setItem(KEY_STORE, k);
    setKey(k);
  }, []);
  const mutation = useMutation({
    mutationFn: (body: S['CheckoutRequest']) => {
      sessionStorage.setItem(KEY_STORE, key);
      return checkoutApi.place(body, key);
    },
    onSuccess: () => {
      sessionStorage.removeItem(KEY_STORE);
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
    onError: (e: { status?: number }) => {
      // The server gave a definite "no" (4xx): the next attempt is a new checkout with a new key.
      if (e.status && e.status >= 400 && e.status < 500) fresh();
    },
  });
  return { ...mutation, resetKey: fresh };
}

// ── Orders ───────────────────────────────────────────────────────────

export function useOrders(status?: S['OrderStatus']) {
  return useQuery({ queryKey: ['orders', status], queryFn: () => ordersApi.list({ status }) });
}

/** One order; polls while something is still in flight (payment pending, refund on its way). */
export function useOrder(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => ordersApi.get(id),
    refetchInterval: (q) => {
      const o = q.state.data;
      if (!o) return false;
      const waiting = o.status === 'pending_payment' || o.payments.some((p) => p.status === 'pending');
      return waiting ? 2000 : false;
    },
  });
}

export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => ordersApi.cancel(id, reason),
    onSuccess: (o) => {
      qc.setQueryData(['order', id], o);
      qc.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

/** A customer can cancel until the first parcel is picked up. */
export function canCancel(order: S['OrderOut']): boolean {
  return (
    (order.status === 'pending_payment' || order.status === 'placed') &&
    order.parcels.every((p) => p.status === 'pending' || p.status === 'cancelled')
  );
}
