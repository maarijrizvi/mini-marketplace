'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
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
      <input id="site-q" placeholder="Search products" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} />
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

  const [mobileOpen, setMobileOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuBox = useRef<HTMLDivElement>(null);
  // The account menu closes on Escape (focus back on its button) and on a click anywhere outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        menuButton.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (!menuBox.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);
  const cartLink = (extra = '') => (
    <Link href="/cart" className={`navl ${extra}`} aria-label={`Cart, ${count} items`}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L20 8H6" />
        <circle cx="9" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </svg>
      <span className="desktop-only">Cart</span> <span className="hbadge">{count}</span>
    </Link>
  );
  const sellerLink = me && (canUseSellerHub(me) ? { href: '/seller', label: 'Seller Hub' } : { href: '/sell', label: me.seller ? 'Shop application' : 'Sell on Mini Marketplace' });
  const doSignOut = () => signOut.mutate(undefined, { onSuccess: () => router.push('/') });

  return (
    <header className="site-header">
      <div className="wrap bar">
        <Link href="/" className="brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          Mini Marketplace
        </Link>
        {/* Phones: cart and a menu button stay on the first row; the links fold into the menu. */}
        <div className="mobile-only row" style={{ gap: 4 }}>
          {cartLink()}
          <button className="navl menu-btn" aria-expanded={mobileOpen} aria-controls="main-nav" onClick={() => setMobileOpen((o) => !o)}>
            {mobileOpen ? 'Close' : 'Menu'}
          </button>
        </div>
        <Suspense fallback={<div className="hsearch" />}>
          <Search />
        </Suspense>
        <nav id="main-nav" aria-label="Main" className={`row main-nav ${mobileOpen ? 'open' : ''}`} style={{ gap: 4 }} onClick={() => setMobileOpen(false)}>
          <Link href="/shop" className="navl">
            Shop
          </Link>
          {me ? (
            <>
              <Link href="/orders" className="navl">
                Orders
              </Link>
              <div className="desktop-only" style={{ position: 'relative' }} ref={menuBox}>
                <button
                  ref={menuButton}
                  className="navl"
                  style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer' }}
                  aria-haspopup="menu"
                  aria-expanded={open}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen((o) => !o);
                  }}
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
                    {sellerLink && (
                      <Link href={sellerLink.href} role="menuitem">
                        {sellerLink.label}
                      </Link>
                    )}
                    <button role="menuitem" onClick={doSignOut}>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
              <span className="mobile-only stack" style={{ gap: 0, width: '100%' }}>
                <Link href="/account" className="navl">
                  My account ({me.firstName})
                </Link>
                {sellerLink && (
                  <Link href={sellerLink.href} className="navl">
                    {sellerLink.label}
                  </Link>
                )}
                <button className="navl" style={{ background: 'none', border: 0, font: 'inherit', cursor: 'pointer', textAlign: 'left' }} onClick={doSignOut}>
                  Sign out
                </button>
              </span>
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
          {cartLink('desktop-only')}
        </nav>
      </div>
      <div className="promo">
        <div className="wrap">
          <span>One cart for every seller</span>
          <span aria-hidden="true" className="desktop-only">
            ·
          </span>
          <span className="desktop-only">Pay online or cash on delivery</span>
          <span aria-hidden="true" className="desktop-only">
            ·
          </span>
          <span className="desktop-only">Track each parcel</span>
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
