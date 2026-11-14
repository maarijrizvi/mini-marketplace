'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import { plural, rupees } from '@/features/format';
import { activeOptions, categoryTree, checkPriceRange, useCategories, useProducts } from '@/features/shopping';
import type { ProductQuery } from '@/lib/api/endpoints';

const SORTS = [
  ['relevance', 'Best match'],
  ['newest', 'Newest'],
  ['price_asc', 'Price: low to high'],
  ['price_desc', 'Price: high to low'],
] as const;

function PriceFilter({ min, max, onApply }: { min?: number; max?: number; onApply: (min: number | null, max: number | null) => void }) {
  const [lo, setLo] = useState(min ? String(min / 100) : '');
  const [hi, setHi] = useState(max ? String(max / 100) : '');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="stack"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const result = checkPriceRange(lo, hi);
        setError(result.error);
        if (!result.error) onApply(result.min, result.max);
      }}
    >
      <span className="label">Price (Rs)</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="input" type="number" min={0} step={1} inputMode="numeric" placeholder="Min" value={lo} aria-label="Minimum price in rupees" aria-invalid={!!error} onChange={(e) => setLo(e.target.value)} />
        <input className="input" type="number" min={0} step={1} inputMode="numeric" placeholder="Max" value={hi} aria-label="Maximum price in rupees" aria-invalid={!!error} onChange={(e) => setHi(e.target.value)} />
      </div>
      {error && (
        <span className="errmsg" role="alert">
          {error}
        </span>
      )}
      <button className="btn ghost small">Apply</button>
    </form>
  );
}

function Catalogue() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const { data: cats } = useCategories();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const all = useMemo(() => cats?.items ?? [], [cats]);
  const tree = useMemo(() => categoryTree(all), [all]);
  const category = params.get('category') ?? undefined;
  const current = all.find((c) => c.slug === category);
  const schema = current?.variantSchema ?? {};
  // Only options the current category actually has are applied (and shown); stale ones from the URL are ignored.
  const options = activeOptions(params, schema);

  const query: ProductQuery = {
    q: params.get('q')?.slice(0, 100) || undefined,
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

  const set = (changes: Record<string, string | null>, { dropOptions = false } = {}) => {
    const next = new URLSearchParams(params);
    if (dropOptions) [...next.keys()].filter((k) => k.startsWith('opt.')).forEach((k) => next.delete(k));
    for (const [k, v] of Object.entries(changes)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('cursor' in changes)) next.delete('cursor');
    router.push(`${path}?${next}`);
  };
  // A different category has different options, so its old option filters go.
  const setCategory = (slug: string | null) => set({ category: slug }, { dropOptions: true });

  const chips: { label: string; clear: () => void }[] = [];
  if (query.q) chips.push({ label: `“${query.q}”`, clear: () => set({ q: null }) });
  if (current) chips.push({ label: current.name, clear: () => setCategory(null) });
  if (query.minPrice) chips.push({ label: `From ${rupees(query.minPrice)}`, clear: () => set({ min: null }) });
  if (query.maxPrice) chips.push({ label: `Up to ${rupees(query.maxPrice)}`, clear: () => set({ max: null }) });
  for (const [name, value] of Object.entries(options)) chips.push({ label: `${name}: ${value}`, clear: () => set({ [`opt.${name}`]: null }) });
  if (query.inStock) chips.push({ label: 'In stock', clear: () => set({ stock: null }) });

  return (
    <div className="wrap page">
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: 'anywhere' }}>{query.q ? `Results for “${query.q}”` : (current?.name ?? 'All products')}</h1>
          <p>{data ? (data.nextCursor ? `${data.items.length}+ products` : plural(data.items.length, 'product')) : ' '}</p>
        </div>
        <div className="row">
          <button className="btn ghost small show-mobile" aria-expanded={filtersOpen} aria-controls="filters" onClick={() => setFiltersOpen((o) => !o)}>
            Filters{chips.length ? ` (${chips.length})` : ''}
          </button>
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
      </div>
      {chips.length > 0 && (
        <div className="row" style={{ marginBottom: 16, gap: 8 }} aria-label="Active filters">
          {chips.map((c) => (
            <button key={c.label} className="filter-chip" onClick={c.clear} aria-label={`Remove filter ${c.label}`}>
              {c.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button className="linkbtn" onClick={() => router.push(path)}>
            Clear all
          </button>
        </div>
      )}
      <div className="shop-grid">
        <aside id="filters" className={`card stack filters ${filtersOpen ? 'open' : ''}`} aria-label="Filters" style={{ alignSelf: 'start' }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">Category</span>
            <button className="linkbtn" onClick={() => setCategory(null)} style={{ fontWeight: category ? 500 : 700 }}>
              All categories
            </button>
            {tree.map((c) => (
              <div key={c.id} className="stack" style={{ gap: 0 }}>
                <button className="linkbtn" onClick={() => setCategory(c.slug)} style={{ fontWeight: category === c.slug ? 700 : 500 }}>
                  {c.name} <span className="muted tiny">&nbsp;{c.productCount ?? ''}</span>
                </button>
                {c.children.map((ch) => (
                  <button key={ch.id} className="linkbtn" style={{ paddingLeft: 14, fontWeight: category === ch.slug ? 700 : 500 }} onClick={() => setCategory(ch.slug)}>
                    {ch.name} <span className="muted tiny">&nbsp;{ch.productCount ?? ''}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <hr className="divider" />
          <PriceFilter key={`${query.minPrice}-${query.maxPrice}`} min={query.minPrice} max={query.maxPrice} onApply={(min, max) => set({ min: min ? String(min) : null, max: max ? String(max) : null })} />
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
              <p>{chips.length ? 'Try removing a filter above.' : 'Try a different search.'}</p>
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
