import { z } from 'zod';

/** Money crosses the API as a string with two decimals ("42.50"), never as a float. */
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((v) => String(v).trim())
  .pipe(z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, 'Enter a price like 42.50.'))
  .transform((v) => Number(v).toFixed(2));

// ───────── Catalogue ─────────

export const productSorts = ['relevance', 'newest', 'price_asc', 'price_desc'] as const;

export const catalogueQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().optional(),
  seller: z.string().trim().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  inStock: z.enum(['true', 'false']).optional(),
  sort: z.enum(productSorts).default('relevance'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export type CatalogueQuery = z.input<typeof catalogueQuerySchema>;

export const productInputSchema = z.object({
  name: z.string().trim().min(2, 'Enter a product name.').max(120),
  sku: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9-]{1,39}$/, 'Use 2–40 letters, numbers or dashes.'),
  categoryId: z.string().uuid('Choose a category.'),
  price: moneySchema,
  description: z.string().trim().max(4000).default(''),
  isActive: z.boolean().default(true),
});
export const createProductSchema = productInputSchema.extend({
  initialStock: z.number().int().min(0).max(100_000).default(0),
});
export const productUpdateSchema = productInputSchema.partial();
export type ProductInput = z.input<typeof productInputSchema>;

export const stockAdjustSchema = z.object({
  delta: z
    .number()
    .int('Use a whole number.')
    .refine((n) => n !== 0, 'Enter a change other than zero.'),
  reason: z.enum(['restock', 'adjust']).default('restock'),
});

export type StockState = 'in_stock' | 'low' | 'out';

export interface ProductSummary {
  id: string;
  name: string;
  sku: string;
  price: string;
  category: { id: string; name: string; slug: string };
  seller: { id: string; shopName: string };
  available: number;
  stock: StockState;
}

export interface ProductDetail extends ProductSummary {
  description: string;
  images: { key: string; position: number }[];
}

export interface CataloguePage {
  items: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  facets: {
    categories: { slug: string; name: string; count: number }[];
    sellers: { id: string; shopName: string; count: number }[];
  };
}

// ───────── Cart ─────────

export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99).default(1),
  /** "Buy now" selects only this item. */
  selectOnly: z.boolean().default(false),
});

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1).max(99).optional(),
    selected: z.boolean().optional(),
  })
  .refine((v) => v.quantity !== undefined || v.selected !== undefined, 'Nothing to change.');

export const cartSelectionSchema = z.object({
  /** Omit to apply to every available item. */
  productIds: z.array(z.string().uuid()).optional(),
  selected: z.boolean(),
});

/** A signed-out shopper's cart, kept in the browser and merged at sign-in. */
export const mergeCartSchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), quantity: z.number().int().min(1).max(99), selected: z.boolean().default(false) }))
    .max(100),
});

export interface CartLine {
  productId: string;
  name: string;
  sku: string;
  seller: { id: string; shopName: string };
  quantity: number;
  unitPrice: string;
  /** Set when the price changed since the item was added. */
  previousPrice: string | null;
  lineTotal: string;
  available: number;
  /** Inactive, out of stock, or the shop isn't open: can't be bought now. */
  unavailable: boolean;
  selected: boolean;
}

export interface CartView {
  lines: CartLine[];
  itemCount: number;
  selectedCount: number;
  selectedSubtotal: string;
}

// ───────── Addresses ─────────

export const addressSchema = z.object({
  label: z.string().trim().min(1, 'Give this address a name, like Home.').max(40),
  line1: z.string().trim().min(3, 'Enter the street address.').max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2, 'Enter the city.').max(100),
  postcode: z.string().trim().max(20).optional(),
  country: z.string().trim().length(2).default('PK'),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.input<typeof addressSchema>;

export interface AddressView {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  postcode: string | null;
  country: string;
  isDefault: boolean;
}

// ───────── Checkout and orders ─────────

/** Sandbox outcomes for the simulated payment provider. Ignored in production. */
export const paymentOutcomes = ['success', 'failure', 'pending', 'unknown'] as const;
export type PaymentOutcome = (typeof paymentOutcomes)[number];

export const checkoutSchema = z.object({
  addressId: z.string().uuid('Choose a shipping address.'),
  /** Generated by the browser per checkout attempt; repeating it returns the same order. */
  idempotencyKey: z.string().min(16).max(80),
  promoCode: z.string().trim().toUpperCase().max(30).optional(),
  /** Total the shopper saw; if prices moved since, checkout stops and asks them to review. */
  expectedTotal: moneySchema.optional(),
  paymentOutcome: z.enum(paymentOutcomes).default('success'),
});
export type CheckoutInput = z.input<typeof checkoutSchema>;

export const quoteSchema = checkoutSchema.pick({ promoCode: true });

export interface CheckoutQuote {
  sellers: {
    sellerId: string;
    shopName: string;
    subtotal: string;
    shipping: string;
    lines: { name: string; quantity: number; lineTotal: string }[];
  }[];
  subtotal: string;
  shipping: string;
  discount: string;
  total: string;
  promo: { code: string; description: string } | null;
}

export type OrderStatusView = 'pending_payment' | 'placed' | 'payment_failed' | 'cancelled' | 'completed';
export type PaymentStatusView = 'pending' | 'succeeded' | 'failed' | 'unknown' | 'refunded';
export type SellerOrderStatusView = 'new' | 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderView {
  id: string;
  number: string;
  status: OrderStatusView;
  payment: { status: PaymentStatusView; reference: string | null } | null;
  createdAt: string;
  subtotal: string;
  shipping: string;
  discount: string;
  total: string;
  shipTo: { label: string; line1: string; line2?: string | null; city: string; postcode?: string | null; country: string };
  shipments: {
    id: string;
    seller: { id: string; shopName: string };
    status: SellerOrderStatusView;
    subtotal: string;
    shipping: string;
    items: { productId: string; name: string; sku: string; unitPrice: string; quantity: number; lineTotal: string }[];
  }[];
}
