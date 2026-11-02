import Link from 'next/link';
import type { CartView } from '@mm/shared';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { getSessionUser, homeFor } from '@/lib/session';
import { CartClient } from './CartClient';

export default async function CartPage() {
  const user = await getSessionUser();
  if (user && user.role !== 'customer') {
    return (
      <>
        <SiteHeader />
        <main className="wrap">
          <div className="panel">
            <h1>Buying needs a customer account</h1>
            <p className="hint">You’re signed in as a {user.role}. Sign in with a customer account to use the cart.</p>
            <Link href={homeFor(user)}>Back to my home page</Link>
          </div>
        </main>
      </>
    );
  }
  const cart = user ? await serverGet<CartView>('/cart') : null;
  return (
    <>
      <SiteHeader />
      <main className="wrap stack">
        <h1>Your cart</h1>
        <CartClient signedIn={!!user} initial={cart} />
      </main>
    </>
  );
}
