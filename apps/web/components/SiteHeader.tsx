import Link from 'next/link';
import type { CartView } from '@mm/shared';
import { serverGet } from '@/lib/server-api';
import { getSessionUser, homeFor } from '@/lib/session';
import { GuestCartCount } from './GuestCartCount';
import { SignOutButton } from './SignedIn';

/** Shop header. Carts and orders are for customers and visitors only. */
export async function SiteHeader({ query = '' }: { query?: string }) {
  const user = await getSessionUser();
  const cart = user?.role === 'customer' ? await serverGet<CartView>('/cart') : null;
  const isShopper = !user || user.role === 'customer';
  return (
    <header className="shop-header">
      <div className="wrap shop-header-row">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          Mini Marketplace
        </Link>
        <form action="/shop" role="search" className="search">
          <label htmlFor="q" className="sr-only">
            Search products or sellers
          </label>
          <input id="q" name="q" defaultValue={query} placeholder="Search products or sellers" className="input" />
        </form>
        <nav className="shop-nav" aria-label="Main">
          {user?.role === 'customer' && <Link href="/orders">Orders</Link>}
          {!user && <Link href="/sell">Sell</Link>}
          {isShopper && (
            <Link href="/cart" className="cart-link">
              Cart <span className="badge">{user ? (cart?.itemCount ?? 0) : <GuestCartCount />}</span>
            </Link>
          )}
          {user ? (
            <>
              <Link href={homeFor(user)}>{user.fullName.split(' ')[0]}</Link>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/signin">Sign in</Link>
              <Link href="/signup" className="btn small">
                Sign up
              </Link>
            </>
          )}
        </nav>
      </div>
      <div className="strip">One cart for every seller · Pay once, never charged twice · Track each shipment</div>
    </header>
  );
}
