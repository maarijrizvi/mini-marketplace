'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { ErrorNote, Field } from '@/components/ui';
import { authApi } from '@/lib/api/endpoints';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const send = useMutation({ mutationFn: authApi.forgotPassword });
  return (
    <div className="auth">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          send.mutate(email);
        }}
      >
        <div>
          <h1>Reset your password</h1>
          <p className="muted">We&apos;ll email you a link to set a new one. It works once, for 30 minutes.</p>
        </div>
        {send.isSuccess ? (
          <div className="note ok">If {email} has an account, the link is on its way.</div>
        ) : (
          <>
            <ErrorNote error={send.error} />
            <Field label="Email" id="email">
              <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <button className="btn gold block" disabled={send.isPending}>
              Email me a link
            </button>
          </>
        )}
        <Link href="/signin" className="small">
          ← Back to sign in
        </Link>
      </form>
    </div>
  );
}
