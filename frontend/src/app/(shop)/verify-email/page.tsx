'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ErrorNote, Loading } from '@/components/ui';
import { useVerifyEmail } from '@/features/session';
import { authApi } from '@/lib/api/endpoints';

function Verify() {
  const token = useSearchParams().get('token');
  const verify = useVerifyEmail();
  const started = useRef(false);
  const [email, setEmail] = useState('');
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (token && !started.current) {
      started.current = true;
      verify.mutate(token);
    }
  }, [token, verify]);

  return (
    <div className="auth">
      <div className="card">
        <h1>Confirm your email</h1>
        {verify.isPending && <Loading label="Checking your link…" />}
        {verify.isSuccess && (
          <>
            <div className="note ok">Email confirmed — you&apos;re signed in, {verify.data.user.firstName}.</div>
            <Link href="/shop" className="btn gold">
              Start shopping
            </Link>
          </>
        )}
        {(verify.isError || !token) && (
          <>
            {token ? <ErrorNote error={verify.error} /> : <p className="muted">Open the link we emailed you, or get a new one.</p>}
            {resent ? (
              <div className="note ok">If that email has an unconfirmed account, a new link is on its way.</div>
            ) : (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  authApi.resendVerification(email).then(() => setResent(true));
                }}
              >
                <input className="input" type="email" required placeholder="Your email" aria-label="Your email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1 }} />
                <button className="btn">Send a new link</button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Verify />
    </Suspense>
  );
}
