'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { useMe } from '@/features/session';

/** Sign-in and sign-up are for signed-out visitors; anyone already signed in goes on to where they were headed. */
export function RedirectIfSignedIn() {
  const { data: me } = useMe();
  const router = useRouter();
  const next = useSearchParams().get('next');
  useEffect(() => {
    if (me) router.replace(next && next.startsWith('/') ? next : '/');
  }, [me, next, router]);
  return null;
}
