'use client';
/** Seller Hub: products, variants, stock, parcels and money. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Schemas } from '@/lib/api/client';
import { meApi, sandboxApi, sellerApi } from '@/lib/api/endpoints';

type S = Schemas;

export function useApplyToSell() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: meApi.applyToSell, onSuccess: (r) => qc.setQueryData(['me'], r.user) });
}

// ── Products ─────────────────────────────────────────────────────────

export function useSellerProducts(status?: S['ProductStatus'], q?: string) {
  return useQuery({ queryKey: ['seller-products', status, q], queryFn: () => sellerApi.products({ status, q }) });
}

export function useSellerProduct(id: string) {
  return useQuery({ queryKey: ['seller-product', id], queryFn: () => sellerApi.product(id), enabled: !!id });
}

export function useProductMutations(id: string) {
  const qc = useQueryClient();
  const setProduct = (p: S['SellerProduct']) => {
    qc.setQueryData(['seller-product', id], p);
    qc.invalidateQueries({ queryKey: ['seller-products'] });
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['seller-product', id] });
    qc.invalidateQueries({ queryKey: ['seller-products'] });
  };
  return {
    update: useMutation({ mutationFn: (b: S['ProductUpdate']) => sellerApi.updateProduct(id, b), onSuccess: setProduct }),
    publish: useMutation({ mutationFn: () => sellerApi.publish(id), onSuccess: setProduct }),
    archive: useMutation({ mutationFn: () => sellerApi.archive(id), onSuccess: setProduct }),
    addVariant: useMutation({ mutationFn: (b: S['VariantInput']) => sellerApi.addVariant(id, b), onSuccess: refresh }),
    updateVariant: useMutation({
      mutationFn: ({ variantId, body }: { variantId: string; body: S['VariantUpdate'] }) =>
        sellerApi.updateVariant(variantId, body),
      onSuccess: refresh,
    }),
    adjustStock: useMutation({
      mutationFn: ({ variantId, body }: { variantId: string; body: S['StockAdjustment'] }) =>
        sellerApi.adjustStock(variantId, body),
      onSuccess: refresh,
    }),
  };
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: sellerApi.createProduct,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['seller-products'] }),
  });
}

export function useUpload() {
  return useMutation({ mutationFn: sellerApi.upload });
}

// ── Parcels ──────────────────────────────────────────────────────────

export function useParcels(status?: S['ParcelStatus'], late?: boolean) {
  return useQuery({ queryKey: ['parcels', status, late], queryFn: () => sellerApi.parcels({ status, late }) });
}

/** What a parcel looks like right now, to notice when a background job has changed it. */
export function parcelSnapshot(p: S['SellerParcel']): string {
  return `${p.status}|${p.trackingNo}`;
}

/** One parcel. While `waitFrom` is set (a pickup booking or courier event is on its way), poll until it changes. */
export function useParcel(id: string | null, waitFrom: string | null = null) {
  return useQuery({
    queryKey: ['parcel', id],
    queryFn: () => sellerApi.parcel(id!),
    enabled: !!id,
    refetchInterval: (q) => (waitFrom !== null && q.state.data && parcelSnapshot(q.state.data) === waitFrom ? 1500 : false),
  });
}

export function useParcelActions(id: string) {
  const qc = useQueryClient();
  const set = (p: S['SellerParcel']) => {
    qc.setQueryData(['parcel', id], p);
    qc.invalidateQueries({ queryKey: ['parcels'] });
  };
  return {
    drop: useMutation({
      mutationFn: ({ itemId, body }: { itemId: string; body: S['DropItemRequest'] }) =>
        sellerApi.dropItem(id, itemId, body),
      onSuccess: set,
    }),
    bookPickup: useMutation({ mutationFn: () => sellerApi.bookPickup(id), onSuccess: set }),
    courierEvent: useMutation({
      mutationFn: ({ trackingNo, event }: { trackingNo: string; event: 'picked_up' | 'delivered' | 'refused' | 'delivery_failed' }) =>
        sandboxApi.courierEvent(trackingNo, event),
      onSuccess: () => qc.invalidateQueries({ queryKey: ['parcels'] }),
    }),
  };
}

/** What the seller can do next with a parcel. */
export function nextStep(p: S['SellerParcel']): 'book' | 'awaiting-booking' | 'awaiting-pickup' | 'in-transit' | 'done' {
  if (p.status === 'pending') return p.trackingNo ? 'awaiting-pickup' : 'book';
  if (p.status === 'shipped') return 'in-transit';
  return 'done';
}

// ── Money ────────────────────────────────────────────────────────────

export function useLedger(entryType?: S['LedgerEntryType']) {
  return useQuery({ queryKey: ['ledger', entryType], queryFn: () => sellerApi.ledger({ entryType }) });
}

export function useBalance() {
  return useQuery({ queryKey: ['balance'], queryFn: sellerApi.balance });
}
