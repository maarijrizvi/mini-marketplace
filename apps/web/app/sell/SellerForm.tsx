'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { sellerRegisterSchema } from '@mm/shared';
import { Field, ProblemSummary } from '@/components/Field';
import { api } from '@/lib/api';
import { fieldErrors, flatten } from '@/lib/validate';

const CATEGORIES = ['Kitchen', 'Home', 'Office', 'Apparel', 'Other'];

export function SellerForm({ customerEmail }: { customerEmail?: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    shopName: '',
    category: 'Kitchen',
    pickupAddress: '',
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirm: '',
    acceptTerms: false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const local = fieldErrors(sellerRegisterSchema, form);
    if (form.confirm !== form.password) local.confirm = ['Your two passwords must match.'];
    if (customerEmail && form.email.trim().toLowerCase() === customerEmail)
      local.email = ['Your seller account needs a different email from your customer account.'];
    setErrors(local);
    if (Object.keys(local).length) return;
    setBusy(true);
    const res = await api('/auth/seller-signup', { body: { ...form, confirm: undefined } });
    setBusy(false);
    if (!res.ok) return setErrors(Object.keys(res.problem.fieldErrors).length ? res.problem.fieldErrors : { _: [res.problem.message] });
    router.push(`/verify-email?email=${encodeURIComponent(form.email.trim().toLowerCase())}`);
  }

  return (
    <form className="card" onSubmit={submit} noValidate>
      <span className="chip">Step 1 of 2 · shop and account</span>
      <div>
        <h2>Register as a seller</h2>
        <p className="sub">Tell us about your shop, then create the login you’ll run it with.</p>
      </div>
      {customerEmail && (
        <div className="note info">
          You’re signed in as <strong>{customerEmail}</strong>. Your seller account is separate, so it needs its own email and phone number.
          Your customer account stays as it is.
        </div>
      )}
      <h3 className="section-title">Shop details</h3>
      <Field label="Shop name" value={form.shopName} onChange={set('shopName')} errors={errors.shopName} />
      <div className="field">
        <label className="lbl" htmlFor="category">
          What will you sell?
        </label>
        <select id="category" className="input" value={form.category} onChange={(e) => set('category')(e.target.value)}>
          {CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <Field
        label="Pickup address"
        hint="Where our shipping partner collects your parcels."
        value={form.pickupAddress}
        onChange={set('pickupAddress')}
        errors={errors.pickupAddress}
      />
      <h3 className="section-title">Seller account</h3>
      <Field label="Your full name" autoComplete="name" value={form.fullName} onChange={set('fullName')} errors={errors.fullName} />
      <Field
        label="Seller account email"
        type="email"
        autoComplete="email"
        value={form.email}
        onChange={set('email')}
        errors={errors.email}
      />
      <Field
        label="Seller account phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        hint="For pickup and order updates."
        value={form.phone}
        onChange={set('phone')}
        errors={errors.phone}
      />
      <Field
        label="Password"
        type="password"
        autoComplete="new-password"
        hint="8+ characters, with a letter and a number."
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
        <span>I agree to the seller rules in the terms of service and privacy policy.</span>
      </label>
      <ProblemSummary title="Your seller account wasn’t created yet." problems={flatten(errors)} />
      <button className="btn" type="submit" disabled={busy}>
        {busy ? 'Creating your seller account…' : 'Create seller account'}
      </button>
      <Link href="/" style={{ textAlign: 'center' }}>
        Cancel and go back
      </Link>
    </form>
  );
}
