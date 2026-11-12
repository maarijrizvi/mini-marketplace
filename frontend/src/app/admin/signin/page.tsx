'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorNote, Field } from '@/components/ui';
import { useAdminSignIn } from '@/features/session';

export default function AdminSignIn() {
  const router = useRouter();
  const signIn = useAdminSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <div className="auth" style={{ minHeight: '100vh', background: 'var(--navy)' }}>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          signIn.mutate({ email, password }, { onSuccess: () => router.replace('/admin') });
        }}
      >
        <div className="row" style={{ gap: 10 }}>
          <span className="avatar" style={{ borderRadius: 8 }}>M</span>
          <strong>Mini Marketplace · Admin</strong>
        </div>
        <h1>Admin sign in</h1>
        <p className="muted small">Admin accounts are separate from shopper and seller accounts.</p>
        <ErrorNote error={signIn.error} />
        <Field label="Email" id="email">
          <input id="email" className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" id="password">
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn gold block" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
