'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { ErrorNote, Field, fieldError, Loading } from '@/components/ui';
import { authApi } from '@/lib/api/endpoints';

function Reset() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [password, setPassword] = useState('');
  const reset = useMutation({
    mutationFn: () => authApi.resetPassword(token, password),
    onSuccess: () => router.replace('/signin?reset=1'),
  });
  return (
    <div className="auth">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          reset.mutate();
        }}
      >
        <h1>Choose a new password</h1>
        {!fieldError(reset.error, 'password') && <ErrorNote error={reset.error} />}
        <Field label="New password" id="password" error={fieldError(reset.error, 'password')} hint="At least 8 characters, with a letter and a number">
          <input id="password" className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <button className="btn gold block" disabled={reset.isPending || !token}>
          Save password
        </button>
        <Link href="/forgot-password" className="small">
          Need a new link?
        </Link>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Reset />
    </Suspense>
  );
}
