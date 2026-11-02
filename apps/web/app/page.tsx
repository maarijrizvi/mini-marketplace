import Link from 'next/link';
import { getSessionUser, homeFor } from '@/lib/session';

export default async function HomePage() {
  const user = await getSessionUser();
  return (
    <main className="auth">
      <section className="auth-side" style={{ flex: '1 1 100%', minHeight: '100vh', justifyContent: 'center' }}>
        <span className="brand">
          <span className="mark" aria-hidden="true">
            M
          </span>
          Mini Marketplace
        </span>
        <div style={{ position: 'relative', maxWidth: 640 }}>
          <div className="eyebrow">Fresh from the makers</div>
          <h1>Independent shops, one easy checkout.</h1>
          <p style={{ color: '#dbe3f5', fontSize: 18 }}>The shop opens with the catalogue milestone. Accounts work today.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 24 }}>
            {user ? (
              <Link href={homeFor(user)} className="btn" style={{ width: 'auto' }}>
                Go to your account
              </Link>
            ) : (
              <>
                <Link href="/signup" className="btn" style={{ width: 'auto' }}>
                  Create an account
                </Link>
                <Link href="/signin" className="btn ghost" style={{ width: 'auto' }}>
                  Sign in
                </Link>
                <Link href="/sell" className="btn ghost" style={{ width: 'auto' }}>
                  Sell with us
                </Link>
              </>
            )}
          </div>
        </div>
        <span className="ring" aria-hidden="true" />
      </section>
    </main>
  );
}
