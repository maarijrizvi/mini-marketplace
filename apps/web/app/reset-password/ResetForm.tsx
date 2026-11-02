'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { passwordProblems } from '@mm/shared';
import { Field } from '@/components/Field';
import { api } from '@/lib/api';

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [linkProblem, setLinkProblem] = useState('');
  const [busy, setBusy] = useState(false);

  if (!token || linkProblem) {
    return (
      <div className="card" role="alert">
        <h2>{linkProblem ? 'This link can’t be used' : 'This link is incomplete'}</h2>
        <p className="sub">{linkProblem || 'Open the link from your email again, or request a new one.'}</p>
        <Link href="/forgot-password" className="btn navy">
          Send a new link
        </Link>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local: Record<string, string[]> = {};
    const problems = passwordProblems(password);
    if (problems.length) local.password = problems;
    if (confirm !== password) local.confirm = ['Your two passwords must match.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const res = await api('/auth/reset-password', { body: { token, password } });
    setBusy(false);
    if (res.ok) return router.replace('/signin?notice=password-reset');
    if (res.problem.status === 410) return setLinkProblem(res.problem.message);
    setErrors(Object.keys(res.problem.fieldErrors).length ? res.problem.fieldErrors : { password: [res.problem.message] });
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <div>
        <h2>Choose a new password</h2>
        <p className="sub">Changing it signs you out on every other device.</p>
      </div>
      <Field
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="8+ characters, with a letter and a number."
        value={password}
        onChange={setPassword}
        errors={errors.password}
      />
      <Field
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={setConfirm}
        errors={errors.confirm}
      />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}
