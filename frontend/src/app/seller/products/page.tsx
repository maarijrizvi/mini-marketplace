'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorNote, Loading, ProductImage, StatusChip } from '@/components/ui';
import { productStatus, rupees } from '@/features/format';
import { useSellerProducts } from '@/features/seller';
import type { Schemas } from '@/lib/api/client';

const TABS: [Schemas['ProductStatus'] | undefined, string][] = [
  [undefined, 'All'],
  ['active', 'Live'],
  ['draft', 'Drafts'],
  ['archived', 'Archived'],
];

export default function SellerProducts() {
  const [status, setStatus] = useState<Schemas['ProductStatus'] | undefined>();
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useSellerProducts(status, q || undefined);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Products &amp; inventory</h1>
          <p>Reserved units are held for orders awaiting payment and come back if the payment fails or expires.</p>
        </div>
        <Link href="/seller/products/new" className="btn gold">
          + New product
        </Link>
      </div>
      <div className="row between">
        <div className="tabs">
          {TABS.map(([s, l]) => (
            <button key={l} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {l}
            </button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search your products" aria-label="Search your products" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No products yet">
          <Link href="/seller/products/new" className="btn gold">
            Add your first product
          </Link>
        </Empty>
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th>Variants</th>
                <th>Price</th>
                <th>Available</th>
                <th>Reserved</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => {
                const prices = p.variants.map((v) => v.price);
                const available = p.variants.filter((v) => v.isActive).reduce((n, v) => n + v.available, 0);
                const reserved = p.variants.reduce((n, v) => n + v.reserved, 0);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/seller/products/${p.id}`} className="row" style={{ flexWrap: 'nowrap', color: 'var(--ink)' }}>
                        <ProductImage src={p.images[0] ?? p.variants.find((v) => v.images.length)?.images[0]} name={p.name} />
                        <strong>{p.name}</strong>
                      </Link>
                    </td>
                    <td>{p.variants.length}</td>
                    <td>{prices.length ? (Math.min(...prices) === Math.max(...prices) ? rupees(prices[0]) : `${rupees(Math.min(...prices))}–${rupees(Math.max(...prices))}`) : '—'}</td>
                    <td>
                      <span className={available === 0 ? 'chip bad' : available <= 3 ? 'chip warn' : ''}>{available}</span>
                    </td>
                    <td>{reserved}</td>
                    <td>
                      <StatusChip map={productStatus} value={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
