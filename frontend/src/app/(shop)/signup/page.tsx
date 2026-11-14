'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { RedirectIfSignedIn } from '@/components/RedirectIfSignedIn';
import { ErrorNote, Field, fieldError } from '@/components/ui';
import { useSignUp } from '@/features/session';
import { ApiError } from '@/lib/api/client';

export default function SignUpPage() {
  return (
    <>
      <Suspense>
        <RedirectIfSignedIn />
      </Suspense>
      <SignUp />
    </>
  );
}

function SignUp() {
  const signUp = useSignUp();
  const [f, setF] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' });
  const err = (k: string) => fieldError(signUp.error, k);
  const bind = (k: keyof typeof f) => ({
    id: k,
    className: 'input',
    value: f[k],
    'aria-invalid': !!err(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });

  if (signUp.isSuccess)
    return (
      <div className="auth">
        <div className="card">
          <span className="chip ok" style={{ alignSelf: 'flex-start' }}>
            Account created
          </span>
          <h1>Check your email</h1>
          <p className="muted">
            We sent a link to <strong>{f.email}</strong>. Open it to confirm your email and you&apos;re signed in. The
            link works for 24 hours.
          </p>
          <p className="small muted">On the demo server every email lands in the Mailpit inbox.</p>
          <Link href="/signin" className="btn ghost">
            Back to sign in
          </Link>
        </div>
      </div>
    );

  const generic = signUp.error instanceof ApiError && !Object.keys(signUp.error.fieldErrors).length;
  return (
    <div className="auth">
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          signUp.mutate(f);
        }}
      >
        <div>
          <h1>Create your account</h1>
          <p className="muted">Shop from every seller with one cart. You can open a shop later.</p>
        </div>
        {generic && <ErrorNote error={signUp.error} />}
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Field label="First name" id="firstName" error={err('firstName')}>
            <input {...bind('firstName')} autoComplete="given-name" required />
          </Field>
          <Field label="Last name" id="lastName" error={err('lastName')}>
            <input {...bind('lastName')} autoComplete="family-name" required />
          </Field>
        </div>
        <Field label="Email" id="email" error={err('email')}>
          <input {...bind('email')} type="email" autoComplete="email" required />
        </Field>
        <Field label="Mobile number" id="phone" error={err('phone')} hint="Pakistani number, e.g. 0300 1234567">
          <input {...bind('phone')} type="tel" autoComplete="tel" required />
        </Field>
        <Field label="Password" id="password" error={err('password')} hint="At least 8 characters, with a letter and a number">
          <input {...bind('password')} type="password" autoComplete="new-password" required />
        </Field>
        <button className="btn gold block" disabled={signUp.isPending}>
          {signUp.isPending ? 'Creating account…' : 'Create account'}
        </button>
        <p className="small">
          Already have an account? <Link href="/signin">Sign in</Link>
        </p>
      </form>
    </div>
  );
}
