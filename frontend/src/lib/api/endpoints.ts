/** One function per API operation, grouped by area. No business rules live here. */
import { http, unwrap, type Schemas } from './client';

type S = Schemas;
const P = '/api/v1';

export type ProductQuery = {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  sort?: 'relevance' | 'newest' | 'price_asc' | 'price_desc';
  options?: Record<string, string>;
  limit?: number;
  cursor?: string;
};

const idem = (key: string) => ({ 'Idempotency-Key': key });

export const authApi = {
  signUp: (body: S['SignUpRequest']) => unwrap(http.POST(`${P}/auth/signup`, { body })),
  verifyEmail: (token: string) => unwrap(http.POST(`${P}/auth/verify-email`, { body: { token } })),
  resendVerification: (email: string) => unwrap(http.POST(`${P}/auth/resend-verification`, { body: { email } })),
  signIn: (body: S['SignInRequest']) => unwrap(http.POST(`${P}/auth/signin`, { body })),
  signOut: () => unwrap(http.POST(`${P}/auth/signout`)),
  forgotPassword: (email: string) => unwrap(http.POST(`${P}/auth/forgot-password`, { body: { email } })),
  resetPassword: (token: string, password: string) =>
    unwrap(http.POST(`${P}/auth/reset-password`, { body: { token, password } })),
  adminSignIn: (body: S['SignInRequest']) => unwrap(http.POST(`${P}/admin/auth/signin`, { body })),
  adminSignOut: () => unwrap(http.POST(`${P}/admin/auth/signout`)),
  adminMe: () => unwrap(http.GET(`${P}/admin/me`)),
};

export const meApi = {
  get: () => unwrap(http.GET(`${P}/me`)),
  update: (body: S['ProfileUpdate']) => unwrap(http.PATCH(`${P}/me`, { body })),
  changePassword: (body: S['ChangePasswordRequest']) => unwrap(http.POST(`${P}/me/password`, { body })),
  addresses: () => unwrap(http.GET(`${P}/me/addresses`)),
  addAddress: (body: S['AddressInput']) => unwrap(http.POST(`${P}/me/addresses`, { body })),
  updateAddress: (id: string, body: S['AddressInput']) =>
    unwrap(http.PATCH(`${P}/me/addresses/{address_id}`, { params: { path: { address_id: id } }, body })),
  removeAddress: (id: string) =>
    unwrap(http.DELETE(`${P}/me/addresses/{address_id}`, { params: { path: { address_id: id } } })),
  makeDefault: (id: string) =>
    unwrap(http.POST(`${P}/me/addresses/{address_id}/default`, { params: { path: { address_id: id } } })),
  applyToSell: (shopName: string) => unwrap(http.POST(`${P}/me/seller-application`, { body: { shopName } })),
};

export const catalogApi = {
  categories: () => unwrap(http.GET(`${P}/categories`)),
  products: ({ options, ...q }: ProductQuery) => {
    const query: Record<string, unknown> = { ...q };
    for (const [k, v] of Object.entries(options ?? {})) if (v) query[`options[${k}]`] = v;
    return unwrap(http.GET(`${P}/products`, { params: { query: query as never } }));
  },
  product: (id: string) => unwrap(http.GET(`${P}/products/{product_id}`, { params: { path: { product_id: id } } })),
};

export const cartApi = {
  get: () => unwrap(http.GET(`${P}/me/cart`)),
  add: (variantId: string, quantity: number) =>
    unwrap(http.POST(`${P}/me/cart/items`, { body: { variantId, quantity } })),
  update: (variantId: string, body: S['CartItemUpdate']) =>
    unwrap(http.PATCH(`${P}/me/cart/items/{variant_id}`, { params: { path: { variant_id: variantId } }, body })),
  remove: (variantId: string) =>
    unwrap(http.DELETE(`${P}/me/cart/items/{variant_id}`, { params: { path: { variant_id: variantId } } })),
  select: (selected: boolean, variantIds?: string[]) =>
    unwrap(http.POST(`${P}/me/cart/selection`, { body: { selected, variantIds } })),
};

export const checkoutApi = {
  quote: (addressId: string) => unwrap(http.POST(`${P}/checkout/quote`, { body: { addressId } })),
  place: (body: S['CheckoutRequest'], key: string) =>
    unwrap(http.POST(`${P}/checkout`, { body, params: { header: idem(key) as never } })),
};

export const ordersApi = {
  list: (query: { status?: S['OrderStatus']; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/me/orders`, { params: { query } })),
  get: (id: string) => unwrap(http.GET(`${P}/me/orders/{order_id}`, { params: { path: { order_id: id } } })),
  cancel: (id: string, reason?: string) =>
    unwrap(http.POST(`${P}/me/orders/{order_id}/cancel`, { params: { path: { order_id: id } }, body: { reason } })),
};

export const sellerApi = {
  products: (query: { status?: S['ProductStatus']; q?: string; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/seller/products`, { params: { query } })),
  product: (id: string) =>
    unwrap(http.GET(`${P}/seller/products/{product_id}`, { params: { path: { product_id: id } } })),
  createProduct: (body: S['ProductInput']) => unwrap(http.POST(`${P}/seller/products`, { body })),
  updateProduct: (id: string, body: S['ProductUpdate']) =>
    unwrap(http.PATCH(`${P}/seller/products/{product_id}`, { params: { path: { product_id: id } }, body })),
  publish: (id: string) =>
    unwrap(http.POST(`${P}/seller/products/{product_id}/publish`, { params: { path: { product_id: id } } })),
  archive: (id: string) =>
    unwrap(http.POST(`${P}/seller/products/{product_id}/archive`, { params: { path: { product_id: id } } })),
  addVariant: (productId: string, body: S['VariantInput']) =>
    unwrap(
      http.POST(`${P}/seller/products/{product_id}/variants`, { params: { path: { product_id: productId } }, body }),
    ),
  updateVariant: (id: string, body: S['VariantUpdate']) =>
    unwrap(http.PATCH(`${P}/seller/variants/{variant_id}`, { params: { path: { variant_id: id } }, body })),
  adjustStock: (id: string, body: S['StockAdjustment']) =>
    unwrap(http.POST(`${P}/seller/variants/{variant_id}/stock`, { params: { path: { variant_id: id } }, body })),
  upload: async (file: File): Promise<S['UploadOut']> => {
    const form = new FormData();
    form.append('file', file);
    return unwrap(http.POST(`${P}/seller/uploads`, { body: form as never, bodySerializer: (b) => b as unknown as FormData }));
  },
  parcels: (query: { status?: S['ParcelStatus']; late?: boolean; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/seller/orders`, { params: { query } })),
  parcel: (id: string) =>
    unwrap(http.GET(`${P}/seller/orders/{seller_order_id}`, { params: { path: { seller_order_id: id } } })),
  dropItem: (parcelId: string, itemId: string, body: S['DropItemRequest']) =>
    unwrap(
      http.POST(`${P}/seller/orders/{seller_order_id}/items/{item_id}/drop`, {
        params: { path: { seller_order_id: parcelId, item_id: itemId } },
        body,
      }),
    ),
  bookPickup: (parcelId: string) =>
    unwrap(
      http.POST(`${P}/seller/orders/{seller_order_id}/book-pickup`, { params: { path: { seller_order_id: parcelId } } }),
    ),
  ledger: (query: { entryType?: S['LedgerEntryType']; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/seller/ledger`, { params: { query } })),
  balance: () => unwrap(http.GET(`${P}/seller/balance`)),
};

export const adminApi = {
  users: (query: { q?: string; sellerStatus?: S['SellerStatus']; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/admin/users`, { params: { query } })),
  user: (id: string) => unwrap(http.GET(`${P}/admin/users/{user_id}`, { params: { path: { user_id: id } } })),
  reviewSeller: (id: string, action: 'approve' | 'reject' | 'suspend' | 'reinstate', reason?: string) =>
    unwrap(
      http.POST(`${P}/admin/sellers/{user_id}/${action}` as `${typeof P}/admin/sellers/{user_id}/approve`, {
        params: { path: { user_id: id } },
        body: (reason ? { reason } : undefined) as never,
      }),
    ),
  payout: (id: string, body: S['PayoutRequest'], key: string) =>
    unwrap(
      http.POST(`${P}/admin/sellers/{user_id}/payouts`, {
        params: { path: { user_id: id }, header: idem(key) as never },
        body,
      }),
    ),
  createCategory: (body: S['CategoryInput']) => unwrap(http.POST(`${P}/admin/categories`, { body })),
  updateCategory: (id: string, body: S['CategoryUpdate']) =>
    unwrap(http.PATCH(`${P}/admin/categories/{category_id}`, { params: { path: { category_id: id } }, body })),
  deleteCategory: (id: string) =>
    unwrap(http.DELETE(`${P}/admin/categories/{category_id}`, { params: { path: { category_id: id } } })),
  orders: (query: { status?: S['OrderStatus']; paymentMethod?: 'cod' | 'online'; q?: string; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/admin/orders`, { params: { query } })),
  order: (id: string) => unwrap(http.GET(`${P}/admin/orders/{order_id}`, { params: { path: { order_id: id } } })),
  cancelOrder: (id: string, reason: string) =>
    unwrap(http.POST(`${P}/admin/orders/{order_id}/cancel`, { params: { path: { order_id: id } }, body: { reason } })),
  payments: (query: { status?: S['PaymentStatus']; kind?: S['PaymentKind']; method?: S['PaymentMethod']; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/admin/payments`, { params: { query } })),
  audit: (query: { entityType?: string; entityId?: string; actorType?: S['ActorType']; actorId?: string; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/admin/audit-log`, { params: { query } })),
  jobs: (query: { state?: 'queued' | 'running' | 'failed'; cursor?: string } = {}) =>
    unwrap(http.GET(`${P}/admin/jobs`, { params: { query } })),
  jobCounts: () => unwrap(http.GET(`${P}/admin/jobs/counts`)),
  retryJob: (id: string) => unwrap(http.POST(`${P}/admin/jobs/{job_id}/retry`, { params: { path: { job_id: id } } })),
  removeJob: (id: string) => unwrap(http.DELETE(`${P}/admin/jobs/{job_id}`, { params: { path: { job_id: id } } })),
};

export const sandboxApi = {
  payment: (id: string) =>
    unwrap(http.GET(`${P}/sandbox/payments/{payment_id}`, { params: { path: { payment_id: id } } })),
  completePayment: (id: string, outcome: 'succeeded' | 'failed' | 'no_answer') =>
    unwrap(
      http.POST(`${P}/sandbox/payments/{payment_id}/complete`, { params: { path: { payment_id: id } }, body: { outcome } }),
    ),
  courierEvent: (trackingNo: string, event: 'picked_up' | 'delivered' | 'refused' | 'delivery_failed') =>
    unwrap(
      http.POST(`${P}/sandbox/leopards/{tracking_no}/events`, {
        params: { path: { tracking_no: trackingNo } },
        body: { event },
      }),
    ),
};
