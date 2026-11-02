import Link from 'next/link';
import { TopBar } from '@/components/SignedIn';
import { requireUser } from '@/lib/session';

export default async function AccountPage() {
  const user = await requireUser('/account', ['customer']);
  return (
    <>
      <TopBar name={user.fullName} />
      <main className="page">
        <h1 style={{ fontSize: 32 }}>Welcome, {user.fullName.split(' ')[0]}</h1>
        <section className="panel">
          <h2 style={{ fontSize: 20 }}>Your account</h2>
          <dl className="facts">
            <dt>Name</dt>
            <dd>{user.fullName}</dd>
            <dt>Email</dt>
            <dd>
              {user.email} <span className="chip ok">Verified</span>
            </dd>
            <dt>Phone</dt>
            <dd>{user.phone}</dd>
          </dl>
        </section>
        <section className="panel">
          <h2 style={{ fontSize: 20 }}>Sell on Mini Marketplace</h2>
          <p className="hint" style={{ fontSize: 15 }}>
            Open a shop with its own seller account. Your customer account stays as it is.
          </p>
          <div>
            <Link href="/sell" className="btn" style={{ width: 'auto' }}>
              Register as a seller
            </Link>
          </div>
        </section>
        <section className="panel">
          <h2 style={{ fontSize: 20 }}>Shopping</h2>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <Link href="/shop">Browse the shop</Link>
            <Link href="/cart">Your cart</Link>
            <Link href="/orders">My orders</Link>
          </div>
        </section>
      </main>
    </>
  );
}
