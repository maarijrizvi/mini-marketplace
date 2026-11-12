'use client';
/** Client-side gates for pages. The API enforces every permission; these only decide what to show. */
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { canUseSellerHub, useAdminMe, useMe, type User } from '@/features/session';
import type { Schemas } from '@/lib/api/client';
import { Loading } from './ui';

export function RequireUser({ children }: { children: (user: User) => ReactNode }) {
  const { data: me, isLoading } = useMe();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    if (!isLoading && !me) router.replace(`/signin?next=${encodeURIComponent(path)}`);
  }, [isLoading, me, path, router]);
  if (!me) return <Loading />;
  return <>{children(me)}</>;
}

export function RequireSeller({ children }: { children: (user: User) => ReactNode }) {
  return <RequireUser>{(me) => <SellerGate me={me}>{children}</SellerGate>}</RequireUser>;
}

function SellerGate({ me, children }: { me: User; children: (user: User) => ReactNode }) {
  const router = useRouter();
  const approved = canUseSellerHub(me);
  useEffect(() => {
    if (!approved) router.replace('/sell');
  }, [approved, router]);
  return approved ? <>{children(me)}</> : <Loading />;
}

export function RequireAdmin({ children }: { children: (admin: Schemas['AdminOut']) => ReactNode }) {
  const { data: admin, isLoading } = useAdminMe();
  const router = useRouter();
  useEffect(() => {
    if (!isLoading && !admin) router.replace('/admin/signin');
  }, [isLoading, admin, router]);
  if (!admin) return <Loading />;
  return <>{children(admin)}</>;
}
