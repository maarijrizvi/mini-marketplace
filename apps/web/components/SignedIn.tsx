'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="link-btn"
      style={{ color: '#fff' }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api('/auth/signout', { method: 'POST' });
        router.replace('/signin?notice=signed-out');
        router.refresh();
      }}
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}

export function TopBar({ name }: { name: string }) {
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        <span className="mark" aria-hidden="true">
          M
        </span>
        Mini Marketplace
      </Link>
      <div style={{ display: 'flex', gap: 18, alignItems: 'center', color: '#fff', fontSize: 15 }}>
        <span>{name}</span>
        <SignOutButton />
      </div>
    </header>
  );
}
