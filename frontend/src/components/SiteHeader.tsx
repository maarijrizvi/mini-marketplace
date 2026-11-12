'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { canUseSellerHub, useMe, useSignOut } from '@/features/session';
import { cartCount, useCart } from '@/features/shopping';

function Search() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  return (
    <form
      role="search"
      className="hsearch"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/shop?q=${encodeURIComponent(q.trim())}` : '/shop');
      }}
    >
      <label htmlFor="site-q" className="sr">
        Search products
      </label>
      <input id="site-q" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4F5B75" strokeWidth="2" strokeLinecap="round">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    </form>
  );
}

export function SiteHeader() {
  const { data: me } = useMe();
  const { data: cart } = useCart(!!me);
  const signOut = useSignOut();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const count = cartCount(cart);

  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          Mini Marketplace
        </Link>
        <Suspense fallback={<div className="hsearch" />}>
          <Search />
        </Suspense>
        <nav aria-label="Main" className="row" style={{ gap: 4 }}>
          <Link href="/shop" className="navl">
            Shop
          </Link>
          {me ? (
            <>
              <Link href="/orders" className="navl">
                Orders
              </Link>
              <div style={{ position: 'relative' }}>
                <button
                  className="navl"
                  style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                >
                  {me.firstName} ▾
                </button>
                {open && (
                  <div className="menu" role="menu" onClick={() => setOpen(false)}>
                    <Link href="/account" role="menuitem">
                      My account
                    </Link>
                    <Link href="/orders" role="menuitem">
                      My orders
                    </Link>
                    {canUseSellerHub(me) ? (
                      <Link href="/seller" role="menuitem">
                        Seller Hub
                      </Link>
                    ) : (
                      <Link href="/sell" role="menuitem">
                        {me.seller ? 'Shop application' : 'Sell on Mini Marketplace'}
                      </Link>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => signOut.mutate(undefined, { onSuccess: () => router.push('/') })}
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link href="/sell" className="navl">
                Sell
              </Link>
              <Link href="/signin" className="navl">
                Sign in
              </Link>
              <Link href="/signup" className="btn gold" style={{ minHeight: 40 }}>
                Sign up
              </Link>
            </>
          )}
          <Link href="/cart" className="navl" aria-label={`Cart, ${count} items`}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6" />
              <circle cx="9" cy="20" r="1" />
              <circle cx="18" cy="20" r="1" />
            </svg>
            Cart <span className="hbadge">{count}</span>
          </Link>
        </nav>
      </div>
      <div className="promo">
        <div className="wrap">
          <span>One cart for every seller</span>
          <span aria-hidden="true">·</span>
          <span>Pay online or cash on delivery</span>
          <span aria-hidden="true">·</span>
          <span>Track each parcel</span>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap">
        <span>© Mini Marketplace · Prices in PKR · Delivered by Leopards Courier</span>
        <span>
          <Link href="/sell">Sell with us</Link> · <Link href="/admin">Admin</Link>
        </span>
      </div>
    </footer>
  );
}
