'use client';

import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { Loading } from '@/components/ui';
import { categoryTree, useCategories, useProducts } from '@/features/shopping';

export default function Home() {
  const { data: cats } = useCategories();
  const { data: newest, isLoading } = useProducts({ sort: 'newest', limit: 8 });
  const tree = categoryTree(cats?.items ?? []);

  return (
    <>
      <section style={{ background: '#fff', borderBottom: '1px solid var(--line)' }}>
        <div className="wrap" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32, padding: '48px 32px' }}>
          <div className="stack-lg" style={{ justifyContent: 'center' }}>
            <span className="chip info plain" style={{ alignSelf: 'flex-start' }}>
              Independent shops · one checkout
            </span>
            <h1 style={{ fontSize: 44, lineHeight: 1.08 }}>Shop many sellers. Pay once.</h1>
            <p className="muted" style={{ fontSize: 18, maxWidth: 520 }}>
              Fill one cart from shops across Pakistan. Pay online or cash on delivery — each seller ships their own
              parcel with Leopards, and you track every one.
            </p>
            <div className="row">
              <Link href="/shop" className="btn gold">
                Start shopping
              </Link>
              <Link href="/sell" className="btn ghost">
                Open your shop
              </Link>
            </div>
          </div>
          <div className="card" style={{ background: 'var(--navy)', color: '#fff', border: 0, display: 'grid', gap: 14 }}>
            {[
              ['1', 'Tick what you want', 'Keep the rest of your cart for later.'],
              ['2', 'Pay once', 'Card, wallet or cash on delivery — never charged twice.'],
              ['3', 'Track each parcel', 'Every seller ships separately, with its own tracking.'],
            ].map(([n, t, d]) => (
              <div key={n} className="row" style={{ alignItems: 'flex-start', gap: 14, flexWrap: 'nowrap' }}>
                <span className="avatar">{n}</span>
                <div>
                  <strong>{t}</strong>
                  <p style={{ color: '#C9D2E3' }}>{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="wrap page stack-lg">
        <section className="stack">
          <h2>Shop by category</h2>
          <div className="row">
            {tree.map((c) => (
              <Link key={c.id} href={`/shop?category=${c.slug}`} className="btn ghost small">
                {c.name}
              </Link>
            ))}
          </div>
        </section>
        <section className="stack">
          <div className="row between">
            <h2>New in</h2>
            <Link href="/shop?sort=newest">See all →</Link>
          </div>
          {isLoading ? (
            <Loading />
          ) : (
            <div className="products">
              {newest?.items.map((p) => (
                <ProductCard key={p.id} p={p} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
