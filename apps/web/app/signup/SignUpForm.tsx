'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signUpSchema } from '@mm/shared';
import { Field, ProblemSummary } from '@/components/Field';
import { api } from '@/lib/api';
import { fieldErrors, flatten } from '@/lib/validate';

export function SignUpForm() {
  const router = useRouter();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '', acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = fieldErrors(signUpSchema, form);
    if (form.confirm !== form.password) local.confirm = ['Your two passwords must match.'];
    setErrors(local);
    if (Object.keys(local).length) return;

    setBusy(true);
    const res = await api('/auth/signup', { body: { ...form, confirm: undefined } });
    setBusy(false);
    if (!res.ok) return setErrors(Object.keys(res.problem.fieldErrors).length ? res.problem.fieldErrors : { _: [res.problem.message] });
    router.push(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
  }

  const taken = (errors.email ?? []).some((m) => m.includes('already'));
  return (
    <form className="card" onSubmit={submit} noValidate>
      <div>
        <h2>Create your account</h2>
        <p className="sub">
          Have one already? <Link href="/signin">Sign in</Link>
        </p>
      </div>
      <Field label="Full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} errors={errors.fullName} />
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={set('email')}
        errors={errors.email}
        after={
          taken && (
            <p className="hint">
              <Link href="/signin">Sign in</Link> or <Link href="/forgot-password">reset your password</Link>.
            </p>
          )
        }
      />
      <Field
        label="Phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="For delivery updates. Numbers without a country code are read as Pakistani."
        value={form.phone}
        onChange={set('phone')}
        errors={errors.phone}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="8+ characters, with a letter and a number. Not your email or a common password."
        value={form.password}
        onChange={set('password')}
        errors={errors.password}
      />
      <Field
        label="Confirm password"
        type="password"
        autoComplete="new-password"
        value={form.confirm}
        onChange={set('confirm')}
        errors={errors.confirm}
      />
      <label className="check">
        <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set('acceptTerms')(e.target.checked)} />
        <span>I agree to the terms of service and privacy policy.</span>
      </label>
      {errors.acceptTerms && <p className="errmsg">{errors.acceptTerms[0]}</p>}
      <ProblemSummary title="Your account wasn’t created yet." problems={flatten(errors)} />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Creating your account…' : 'Create account'}
      </button>
    </form>
  );
}
