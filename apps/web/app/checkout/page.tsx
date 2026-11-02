import Link from 'next/link';
import { cookies } from 'next/headers';
import type { AddressView, CheckoutQuote } from '@mm/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { CheckoutClient } from './CheckoutClient';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export default async function CheckoutPage() {
  await requireUser('/checkout', ['customer']);
  const cookie = (await cookies()).toString();
  const quoteRes = await fetch(`${API}/api/checkout/quote`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: '{}',
    cache: 'no-store',
  });
  const addresses = (await serverGet<AddressView[]>('/addresses')) ?? [];
  return (
    <>
      <SiteHeader />
      <main className="wrap stack">
        <div className="row">
          <h1>Checkout</h1>
          <Link href="/cart">Back to cart</Link>
        </div>
        {quoteRes.ok ? (
          <CheckoutClient addresses={addresses} initialQuote={(await quoteRes.json()) as CheckoutQuote} />
        ) : (
          <div className="panel" style={{ textAlign: 'center' }}>
            <h2>Nothing to check out</h2>
            <p className="hint">
              {((await quoteRes.json()) as { message?: string }).message ?? 'Go back to your cart and tick the items you want to buy.'}
            </p>
            <div>
              <Link href="/cart" className="btn" style={{ width: 'auto' }}>
                Back to cart
              </Link>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
