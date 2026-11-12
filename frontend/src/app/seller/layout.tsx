'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Console } from '@/components/Console';
import { RequireSeller } from '@/components/guards';
import { StatusChip } from '@/components/ui';
import { initials, sellerStatus } from '@/features/format';
import { useSignOut } from '@/features/session';

const NAV = [
  { href: '/seller', label: 'Home', exact: true },
  { href: '/seller/orders', label: 'Orders' },
  { href: '/seller/products', label: 'Products & inventory' },
  { href: '/seller/money', label: 'Money' },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const signOut = useSignOut();
  const router = useRouter();
  return (
    <RequireSeller>
      {(me) => (
        <Console
          title="Seller Hub"
          home="/seller"
          nav={NAV}
          badge={
            <div style={{ padding: '4px 12px 14px', color: '#fff', fontSize: 14 }}>
              <div style={{ fontWeight: 600 }}>{me.seller!.shopName}</div>
              <div style={{ marginTop: 4 }}>
                <StatusChip map={sellerStatus} value={me.seller!.status} />
              </div>
            </div>
          }
          person={{ name: `${me.firstName} ${me.lastName}`, initials: initials(me.firstName, me.lastName) }}
          footer={
            <>
              <Link href="/">Shop as a customer ↗</Link>
              <button className="link" onClick={() => signOut.mutate(undefined, { onSuccess: () => router.push('/') })}>
                Sign out
              </button>
            </>
          }
        >
          {me.seller!.status === 'suspended' && (
            <div className="note bad" style={{ marginBottom: 16 }}>
              Your shop is suspended ({me.seller!.statusReason}). Your products are hidden from customers, but orders
              you already took still need sending.
            </div>
          )}
          {children}
        </Console>
      )}
    </RequireSeller>
  );
}
