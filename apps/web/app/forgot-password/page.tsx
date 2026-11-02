'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AuthShell } from '@/components/AuthShell';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address, like name@example.com.');
    setBusy(true);
    const res = await api('/auth/forgot-password', { body: { email } });
    setBusy(false);
    if (!res.ok) return setError(res.problem.message);
    setSentTo(email.trim().toLowerCase());
  }

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Locked out? It happens."
      points={['We’ll email you a link to choose a new password', 'For your safety it works once and expires after 30 minutes']}
    >
      {sentTo ? (
        <div className="card" role="status">
          <h2>Check your email</h2>
          <p className="sub">
            If an account exists for <strong>{sentTo}</strong>, we’ve sent a link to reset its password. It expires in 30 minutes.
          </p>
          <p className="hint">We show this message for every address, so nobody can use this page to find out who has an account.</p>
          <div className="row">
            <button className="link-btn" onClick={() => setSentTo('')}>
              Use a different email
            </button>
            <Link href="/signin">Back to sign in</Link>
          </div>
        </div>
      ) : (
        <form className="card" onSubmit={submit} noValidate>
          <div>
            <h2>Reset your password</h2>
            <p className="sub">Enter the email you signed up with.</p>
          </div>
          <div className="field">
            <label className="lbl" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              className={`input${error ? ' err' : ''}`}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <p className="errmsg">{error}</p>}
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
          <Link href="/signin">← Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}
