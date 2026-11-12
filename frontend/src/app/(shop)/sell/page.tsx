'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ErrorNote, Field, fieldError, Loading, StatusChip } from '@/components/ui';
import { sellerStatus } from '@/features/format';
import { useApplyToSell } from '@/features/seller';
import { useMe } from '@/features/session';

export default function SellPage() {
  const { data: me, isLoading } = useMe();
  const apply = useApplyToSell();
  const [shop, setShop] = useState('');

  if (isLoading) return <div className="wrap page"><Loading /></div>;

  return (
    <div className="auth">
      <div className="card" style={{ maxWidth: 560 }}>
        <span className="chip info plain" style={{ alignSelf: 'flex-start' }}>
          Sell on Mini Marketplace
        </span>
        {!me ? (
          <>
            <h1>Open your shop</h1>
            <p className="muted">
              Selling uses the same account you shop with. Sign in or create an account, then apply here — an admin
              reviews every new shop before it goes live.
            </p>
            <div className="row">
              <Link href="/signup" className="btn gold">
                Create an account
              </Link>
              <Link href="/signin?next=/sell" className="btn ghost">
                Sign in
              </Link>
            </div>
          </>
        ) : me.seller && me.seller.status !== 'rejected' ? (
          <>
            <h1>{me.seller.shopName}</h1>
            <p>
              <StatusChip map={sellerStatus} value={me.seller.status} />
            </p>
            {me.seller.status === 'pending' && (
              <p className="muted">An admin is reviewing your shop. We&apos;ll email you as soon as it&apos;s decided.</p>
            )}
            {me.seller.status === 'suspended' && (
              <div className="note bad">Your shop is suspended: {me.seller.statusReason}. Your products are hidden. Orders already placed still need sending.</div>
            )}
            {(me.seller.status === 'approved' || me.seller.status === 'suspended') && (
              <Link href="/seller" className="btn gold">
                Open Seller Hub
              </Link>
            )}
          </>
        ) : (
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              apply.mutate(shop);
            }}
          >
            <h1>Name your shop</h1>
            {me.seller?.status === 'rejected' && (
              <div className="note warn">Your last application wasn&apos;t approved: {me.seller.statusReason}. You can apply again.</div>
            )}
            <p className="muted">Customers see this name on every product and parcel. It must be unique.</p>
            {!fieldError(apply.error, 'shopName') && <ErrorNote error={apply.error} />}
            <Field label="Shop name" id="shop" error={fieldError(apply.error, 'shopName')}>
              <input id="shop" className="input" required minLength={2} maxLength={60} value={shop} onChange={(e) => setShop(e.target.value)} />
            </Field>
            <button className="btn gold" disabled={apply.isPending}>
              Submit for review
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
