import Link from 'next/link';
import type { CataloguePage } from '@mm/shared';
import { ProductCard } from '@/components/ProductCard';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

type Params = {
  q?: string;
  category?: string;
  seller?: string;
  minPrice?: string;
  maxPrice?: string;
  inStock?: string;
  sort?: string;
  page?: string;
};

const sorts = [
  ['relevance', 'Most relevant'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
] as const;

export default async function ShopPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const [user, data] = await Promise.all([getSessionUser(), serverGet<CataloguePage>(`/catalogue/products?${qs}`)]);
  const page = data ?? { items: [], total: 0, page: 1, pageSize: 12, facets: { categories: [], sellers: [] } };
  const pages = Math.max(1, Math.ceil(page.total / page.pageSize));
  const link = (change: Partial<Params>) => {
    const next = new URLSearchParams(qs);
    for (const [k, v] of Object.entries(change)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in change)) next.delete('page');
    return `/shop?${next}`;
  };
  const hasFilters = ['q', 'category', 'seller', 'minPrice', 'maxPrice', 'inStock'].some((k) => params[k as keyof Params]);

  return (
    <>
      <SiteHeader query={params.q} />
      <main className="wrap shop-layout">
        <aside className="filters" aria-label="Filters">
          <h2 className="sr-only">Filters</h2>
          <div>
            <h3>Category</h3>
            {page.facets.categories.map((c) => (
              <Link
                key={c.slug}
                href={link({ category: params.category === c.slug ? undefined : c.slug })}
                className={`facet${params.category === c.slug ? ' on' : ''}`}
              >
                <span>{c.name}</span>
                <span>{c.count}</span>
              </Link>
            ))}
          </div>
          <form action="/shop">
            {Object.entries(params)
              .filter(([k, v]) => v && !['minPrice', 'maxPrice', 'page'].includes(k))
              .map(([k, v]) => (
                <input key={k} type="hidden" name={k} value={v} />
              ))}
            <h3>Price</h3>
            <div className="price-range">
              <input
                className="input"
                name="minPrice"
                inputMode="decimal"
                placeholder="Min $"
                defaultValue={params.minPrice}
                aria-label="Minimum price"
              />
              <input
                className="input"
                name="maxPrice"
                inputMode="decimal"
                placeholder="Max $"
                defaultValue={params.maxPrice}
                aria-label="Maximum price"
              />
            </div>
            <button className="btn ghost small" type="submit">
              Apply
            </button>
          </form>
          <div>
            <h3>Seller</h3>
            {page.facets.sellers.map((s) => (
              <Link
                key={s.id}
                href={link({ seller: params.seller === s.id ? undefined : s.id })}
                className={`facet${params.seller === s.id ? ' on' : ''}`}
              >
                <span>{s.shopName}</span>
                <span>{s.count}</span>
              </Link>
            ))}
          </div>
          <Link href={link({ inStock: params.inStock ? undefined : 'true' })} className={`facet${params.inStock ? ' on' : ''}`}>
            <span>In stock only</span>
          </Link>
        </aside>
        <section className="stack">
          <div className="row">
            <div>
              <h1>{params.q ? `Results for “${params.q}”` : 'All products'}</h1>
              <p className="hint">
                {page.total} {page.total === 1 ? 'result' : 'results'}
                {hasFilters && (
                  <>
                    {' · '}
                    <Link href="/shop">Clear filters</Link>
                  </>
                )}
              </p>
            </div>
            <form action="/shop" className="sort">
              {Object.entries(params)
                .filter(([k, v]) => v && !['sort', 'page'].includes(k))
                .map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
              <label htmlFor="sort" className="lbl">
                Sort by
              </label>
              <select id="sort" name="sort" className="input" defaultValue={params.sort ?? 'relevance'}>
                {sorts.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <button className="btn ghost small" type="submit">
                Sort
              </button>
            </form>
          </div>
          {page.items.length ? (
            <div className="grid">
              {page.items.map((p) => (
                <ProductCard key={p.id} product={p} role={user?.role ?? null} />
              ))}
            </div>
          ) : (
            <div className="panel">
              <h2>No products match</h2>
              <p className="hint">
                Try a different search, or <Link href="/shop">clear the filters</Link>.
              </p>
            </div>
          )}
          {pages > 1 && (
            <nav className="pager" aria-label="Pages">
              {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={link({ page: String(n) })}
                  aria-current={n === page.page ? 'page' : undefined}
                  className={n === page.page ? 'on' : ''}
                >
                  {n}
                </Link>
              ))}
            </nav>
          )}
        </section>
      </main>
    </>
  );
}
