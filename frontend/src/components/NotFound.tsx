import Link from 'next/link';

export function NotFoundContent() {
  return (
    <div className="wrap page">
      <div className="empty" style={{ padding: '64px 16px' }}>
        <span className="chip warn plain">404</span>
        <h1 style={{ color: 'var(--ink)' }}>We couldn’t find that page</h1>
        <p>It may have been removed, or the link is mistyped.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link href="/shop" className="btn gold">
            Browse the shop
          </Link>
          <Link href="/" className="btn ghost">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
