'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorNote, Field, Loading } from '@/components/ui';
import { isApprovedSeller, useSignIn } from '@/features/session';
import { ApiError } from '@/lib/api/client';
import { authApi } from '@/lib/api/endpoints';

function SignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useSignIn();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resent, setResent] = useState(false);
  const unverified = signIn.error instanceof ApiError && signIn.error.code === 'email_not_verified';

  return (
    <div className="auth">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          signIn.mutate(
            { email, password },
            {
              onSuccess: (r) => {
                const next = params.get('next');
                router.replace(next && next.startsWith('/') ? next : isApprovedSeller(r.user) ? '/seller' : '/');
              },
            },
          );
        }}
      >
        <div>
          <h1>Sign in</h1>
          <p className="muted">One account to shop and to sell.</p>
        </div>
        {params.get('reset') && <div className="note ok">Password changed. Sign in with your new password.</div>}
        {unverified ? (
          <div className="note warn stack" style={{ gap: 6 }}>
            Confirm your email first — check your inbox for our link.
            {resent ? (
              <span>New link sent.</span>
            ) : (
              <button type="button" className="linkbtn" onClick={() => authApi.resendVerification(email).then(() => setResent(true))}>
                Send a new link
              </button>
            )}
          </div>
        ) : (
          <ErrorNote error={signIn.error} />
        )}
        <Field label="Email" id="email">
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" id="password">
          <input id="password" className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn gold block" disabled={signIn.isPending}>
          {signIn.isPending ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="row between small">
          <Link href="/forgot-password">Forgot password?</Link>
          <span>
            New here? <Link href="/signup">Create an account</Link>
          </span>
        </div>
      </form>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SignIn />
    </Suspense>
  );
}
