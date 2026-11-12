'use client';

import Link from 'next/link';
import { Loading, Money } from '@/components/ui';
import { useBalance, useParcels, useSellerProducts } from '@/features/seller';
import { useMe } from '@/features/session';

export default function SellerHome() {
  const { data: me } = useMe();
  const { data: pending, isLoading } = useParcels('pending');
  const { data: late } = useParcels('pending', true);
  const { data: shipped } = useParcels('shipped');
  const { data: products } = useSellerProducts();
  const { data: balance } = useBalance();

  const lowStock = (products?.items ?? []).flatMap((p) =>
    p.status === 'active' ? p.variants.filter((v) => v.isActive && v.available <= 3).map((v) => ({ p, v })) : [],
  );
  const toBook = (pending?.items ?? []).filter((p) => !p.trackingNo).length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Hi, {me?.firstName}</h1>
          <p>What needs you today.</p>
        </div>
        <Link href="/seller/products/new" className="btn gold">
          + Add a product
        </Link>
      </div>
      {isLoading ? (
        <Loading />
      ) : (
        <div className="tiles">
          <Link href="/seller/orders?status=pending" className="tile" style={{ color: 'inherit' }}>
            <div className="l">To send</div>
            <div className="n">{pending?.items.length ?? 0}{pending?.nextCursor ? '+' : ''}</div>
            <div className="tiny muted">{toBook} need a pickup booked</div>
          </Link>
          <Link href="/seller/orders?late=1" className="tile" style={{ color: 'inherit' }}>
            <div className="l">Past the ship deadline</div>
            <div className="n" style={{ color: late?.items.length ? 'var(--bad)' : undefined }}>{late?.items.length ?? 0}</div>
            <div className="tiny muted">24 business hours after the order</div>
          </Link>
          <Link href="/seller/orders?status=shipped" className="tile" style={{ color: 'inherit' }}>
            <div className="l">With Leopards</div>
            <div className="n">{shipped?.items.length ?? 0}</div>
          </Link>
          <Link href="/seller/money" className="tile" style={{ color: 'inherit' }}>
            <div className="l">Balance</div>
            <div className="n">{balance ? <Money paisa={balance.balance} /> : '—'}</div>
            <div className="tiny muted">After commission, before payouts</div>
          </Link>
        </div>
      )}
      <section className="card stack">
        <div className="row between">
          <h2>Low stock</h2>
          <Link href="/seller/products">All products →</Link>
        </div>
        {lowStock.length === 0 ? (
          <p className="muted small">Nothing is running low.</p>
        ) : (
          lowStock.map(({ p, v }) => (
            <div key={v.id} className="row between small" style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <span>
                <Link href={`/seller/products/${p.id}`}>{p.name}</Link> · <span className="mono">{v.sku}</span>
              </span>
              <span className={`chip ${v.available === 0 ? 'bad' : 'warn'}`}>{v.available} available</span>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
