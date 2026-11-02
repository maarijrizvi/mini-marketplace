'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SessionUser } from '@mm/shared';
import { api } from '@/lib/api';

const RESEND_SECONDS = 60;

export function VerifyForm({ initialEmail }: { initialEmail: string }) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError('Enter all 6 digits.');
    setBusy(true);
    const res = await api<{ user: SessionUser }>('/auth/verify-email', { body: { email, code } });
    setBusy(false);
    if (!res.ok) return setError(res.problem.fieldErrors.code?.[0] ?? res.problem.message);
    const user = res.data.user;
    router.replace(user.role === 'seller' ? '/seller/application' : '/account');
    router.refresh();
  }

  async function resend() {
    setError('');
    const res = await api('/auth/resend-code', { body: { email } });
    if (!res.ok) return setError(res.problem.message);
    setCode('');
    setNotice('New code sent. The old one no longer works.');
    setCooldown(RESEND_SECONDS);
  }

  return (
    <form className="card" onSubmit={verify} noValidate>
      <span className="chip">Verify your email</span>
      <div>
        <h2>Enter your verification code</h2>
        <p className="sub">
          {initialEmail ? (
            <>
              We sent a 6-digit code to <strong>{initialEmail}</strong>. It expires in 24 hours.
            </>
          ) : (
            'Enter the email you signed up with and the code we sent to it.'
          )}
        </p>
      </div>
      {!initialEmail && (
        <div className="field">
          <label className="lbl" htmlFor="email">
            Email
          </label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      )}
      {notice && (
        <div className="note ok" role="status">
          {notice}
        </div>
      )}
      <div className="field">
        <label className="lbl" htmlFor="code">
          Verification code
        </label>
        <input
          id="code"
          className={`input code-input${error ? ' err' : ''}`}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          aria-invalid={!!error}
          onChange={(e) => {
            setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
        />
        {error && (
          <p className="errmsg" role="alert">
            {error}
          </p>
        )}
        <p className="hint">Codes arrive within a minute. Locally, open the Mailpit inbox at localhost:8025.</p>
      </div>
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Checking…' : 'Verify email'}
      </button>
      <div className="row" style={{ fontSize: 14 }}>
        <Link href="/signup">← Wrong email? Start again</Link>
        <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0 || !email}>
          {cooldown > 0 ? `Resend in ${cooldown} s` : 'Send a new code'}
        </button>
      </div>
    </form>
  );
}
