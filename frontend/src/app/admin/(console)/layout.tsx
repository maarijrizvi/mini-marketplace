'use client';

import { useRouter } from 'next/navigation';
import { Console } from '@/components/Console';
import { RequireAdmin } from '@/components/guards';
import { useAdminSignOut } from '@/features/session';

const NAV = [
  { href: '/admin', label: 'Operations', exact: true },
  { href: '/admin/sellers', label: 'Sellers' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/categories', label: 'Categories' },
  { href: '/admin/orders', label: 'Orders & payments' },
  { href: '/admin/jobs', label: 'Background jobs' },
  { href: '/admin/audit', label: 'Audit log' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const signOut = useAdminSignOut();
  const router = useRouter();
  return (
    <RequireAdmin>
      {(admin) => (
        <Console
          title="Admin"
          home="/admin"
          nav={NAV}
          person={{
            name: admin.fullName,
            initials: admin.fullName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
            note: 'Admin',
          }}
          footer={
            <button className="link" onClick={() => signOut.mutate(undefined, { onSuccess: () => router.replace('/admin/signin') })}>
              Sign out
            </button>
          }
        >
          {children}
        </Console>
      )}
    </RequireAdmin>
  );
}
