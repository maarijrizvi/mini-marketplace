'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import { parseRupees } from '@/features/format';
import { categoryTree, useCategories, useProducts } from '@/features/shopping';
import type { ProductQuery } from '@/lib/api/endpoints';

const SORTS = [
  ['relevance', 'Best match'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
] as const;

function Catalogue() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { data: cats } = useCategories();

  const category = params.get('category') ?? undefined;
  const options: Record<string, string> = {};
  params.forEach((v, k) => {
    if (k.startsWith('opt.')) options[k.slice(4)] = v;
  });
  const query: ProductQuery = {
    q: params.get('q') ?? undefined,
    category,
    sort: (params.get('sort') as ProductQuery['sort']) ?? 'relevance',
    minPrice: params.get('min') ? Number(params.get('min')) : undefined,
    maxPrice: params.get('max') ? Number(params.get('max')) : undefined,
    inStock: params.get('stock') === '1' || undefined,
    options,
    cursor: params.get('cursor') ?? undefined,
    limit: 24,
  };
  const { data, isLoading, error, isFetching } = useProducts(query);

  const set = (changes: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('cursor' in changes)) next.delete('cursor');
    router.push(`${path}?${next}`);
  };

  const all = useMemo(() => cats?.items ?? [], [cats]);
  const current = all.find((c) => c.slug === category);
  const schema = current?.variantSchema ?? {};
  const tree = useMemo(() => categoryTree(all), [all]);

  return (
    <div className="wrap page">
      <div className="page-head">
        <div>
          <h1>{query.q ? `Results for “${query.q}”` : (current?.name ?? 'All products')}</h1>
          <p>{data ? `${data.items.length}${data.nextCursor ? '+' : ''} products` : ' '}</p>
        </div>
        <label className="row small">
          Sort
          <select className="input" style={{ width: 'auto' }} value={query.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 240px) minmax(0, 1fr)', gap: 24 }} className="shop-grid">
        <aside className="card stack" aria-label="Filters" style={{ alignSelf: 'start' }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Category</span>
            <button className="linkbtn" onClick={() => set({ category: null })} style={{ fontWeight: category ? 500 : 700 }}>
              All categories
            </button>
            {tree.map((c) => (
              <div key={c.id} className="stack" style={{ gap: 0 }}>
                <button className="linkbtn" onClick={() => set({ category: c.slug })} style={{ fontWeight: category === c.slug ? 700 : 500 }}>
                  {c.name}
                </button>
                {c.children.map((ch) => (
                  <button
                    key={ch.id}
                    className="linkbtn"
                    style={{ paddingLeft: 14, fontWeight: category === ch.slug ? 700 : 500 }}
                    onClick={() => set({ category: ch.slug })}
                  >
                    {ch.name}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <hr className="divider" />
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const min = parseRupees(String(f.get('min') ?? ''));
              const max = parseRupees(String(f.get('max') ?? ''));
              set({ min: min ? String(min) : null, max: max ? String(max) : null });
            }}
          >
            <span className="label">Price (Rs)</span>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" name="min" inputMode="numeric" placeholder="Min" defaultValue={query.minPrice ? query.minPrice / 100 : ''} aria-label="Minimum price" />
              <input className="input" name="max" inputMode="numeric" placeholder="Max" defaultValue={query.maxPrice ? query.maxPrice / 100 : ''} aria-label="Maximum price" />
            </div>
            <button className="btn ghost small">Apply</button>
          </form>
          {Object.entries(schema).map(([name, values]) => (
            <div key={name} className="field">
              <label htmlFor={`opt-${name}`} style={{ textTransform: 'capitalize' }}>
                {name}
              </label>
              <select id={`opt-${name}`} className="input" value={options[name] ?? ''} onChange={(e) => set({ [`opt.${name}`]: e.target.value })}>
                <option value="">Any</option>
                {values.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
          ))}
          <label className="check small">
            <input type="checkbox" checked={!!query.inStock} onChange={(e) => set({ stock: e.target.checked ? '1' : null })} />
            In stock only
          </label>
        </aside>
        <section aria-busy={isFetching}>
          <ErrorNote error={error} />
          {isLoading ? (
            <Loading />
          ) : data && data.items.length === 0 ? (
            <Empty title="Nothing matches">
              <p>Try fewer filters or a different search.</p>
            </Empty>
          ) : (
            <div className="products">{data?.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
          )}
          {data?.nextCursor && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 20 }}>
              <button className="btn ghost" onClick={() => set({ cursor: data.nextCursor })}>
                Next page →
              </button>
            </div>
          )}
        </section>
      </div>
      <style>{`@media (max-width: 760px){.shop-grid{grid-template-columns:1fr!important}}`}</style>
    </div>
  );
}

export default function ShopPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Catalogue />
    </Suspense>
  );
}
