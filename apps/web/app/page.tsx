import Link from 'next/link';
import type { CataloguePage } from '@mm/shared';
import { ProductCard } from '@/components/ProductCard';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

export default async function HomePage() {
  const [user, page] = await Promise.all([getSessionUser(), serverGet<CataloguePage>('/catalogue/products?pageSize=8')]);
  return (
    <>
      <SiteHeader />
      <main className="wrap stack-lg">
        <section className="hero">
          <div className="hero-main">
            <div className="eyebrow">{user ? `Welcome back, ${user.fullName.split(' ')[0]}` : 'Fresh from the makers'}</div>
            <h1>Independent shops, one easy checkout.</h1>
            <Link href="/shop" className="btn" style={{ width: 'auto' }}>
              Shop all products
            </Link>
          </div>
          <aside className="hero-side">
            <div className="eyebrow navy">For sellers</div>
            <h2>Sell your products here</h2>
            <Link href={user && user.role !== 'customer' ? '/' : '/sell'}>Register your shop →</Link>
          </aside>
        </section>
        <section className="stack">
          <div className="row">
            <h2>Trending now</h2>
            <Link href="/shop">See all →</Link>
          </div>
          <div className="grid">
            {page?.items.map((p) => (
              <ProductCard key={p.id} product={p} role={user?.role ?? null} />
            ))}
          </div>
          {!page?.items.length && <p className="hint">No products yet. Run the demo seed to fill the shop.</p>}
        </section>
      </main>
    </>
  );
}
