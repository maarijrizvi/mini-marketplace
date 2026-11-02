'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SessionUser } from '@mm/shared';
import { mergeGuestCart } from '@/lib/guest-cart';
import { api, type ApiProblem } from '@/lib/api';

/** Only allow returning to a path on this site. */
const safeNext = (next: string) => (next.startsWith('/') && !next.startsWith('//') ? next : '');

export function SignInForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      return setProblem({ status: 400, message: 'Enter your email and password.', fieldErrors: {} });
    }
    setBusy(true);
    const res = await api<{ user: SessionUser }>('/auth/signin', { body: { email, password } });
    setBusy(false);
    if (!res.ok) return setProblem(res.problem);
    const { user } = res.data;
    if (user.role === 'customer') await mergeGuestCart();
    const fallback =
      user.role === 'admin'
        ? '/admin'
        : user.role === 'seller'
          ? user.seller?.status === 'approved'
            ? '/seller'
            : '/seller/application'
          : '/';
    router.replace(safeNext(next) || fallback);
    router.refresh();
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div>
        <h2>Sign in</h2>
        <p className="sub">
          Don’t have an account? <Link href="/signup">Sign up</Link>
        </p>
      </div>
      {notice && !problem && (
        <div className="note info" role="status">
          {notice}
        </div>
      )}
      {problem && (
        <div className={`note ${problem.code === 'email_unverified' ? 'warn' : 'bad'}`} role="alert">
          {problem.message}{' '}
          {problem.code === 'email_unverified' && (
            <Link href={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`}>Enter code or resend it →</Link>
          )}
          {problem.code === 'locked' && <Link href="/forgot-password">Reset your password</Link>}
        </div>
      )}
      <div className="field">
        <label className="lbl" htmlFor="email">
          Email
        </label>
        <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <div className="row">
          <label className="lbl" htmlFor="password">
            Password
          </label>
          <Link href="/forgot-password" style={{ fontSize: 14 }}>
            Forgot password?
          </Link>
        </div>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
