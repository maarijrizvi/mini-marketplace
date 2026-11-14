'use client';

import { useState } from 'react';
import type { Schemas } from '@/lib/api/client';
import { ErrorNote, Field, fieldError } from './ui';

type Address = Schemas['AddressInput'];

const BLANK: Address = { label: '', recipient: '', phone: '', line1: '', line2: '', area: '', city: '', province: '' };

export function AddressForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<Address>;
  submitLabel: string;
  pending: boolean;
  error: unknown;
  onSubmit: (a: Address) => void;
  onCancel?: () => void;
}) {
  const [a, setA] = useState<Address>({ ...BLANK, ...initial });
  const bind = (k: keyof Address) => ({
    id: `addr-${k}`,
    className: 'input',
    value: (a[k] as string) ?? '',
    'aria-invalid': !!fieldError(error, k),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value }),
  });
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(a);
      }}
    >
      <ErrorNote error={error} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Label" id="addr-label" error={fieldError(error, 'label')}>
          <input {...bind('label')} placeholder="Home, Office…" required />
        </Field>
        <Field label="Recipient" id="addr-recipient" error={fieldError(error, 'recipient')}>
          <input {...bind('recipient')} autoComplete="name" required />
        </Field>
        <Field label="Phone" id="addr-phone" error={fieldError(error, 'phone')} hint="For the courier, e.g. 0300 1234567">
          <input {...bind('phone')} autoComplete="tel" required />
        </Field>
        <Field label="City" id="addr-city" error={fieldError(error, 'city')}>
          <input {...bind('city')} autoComplete="address-level2" required />
        </Field>
      </div>
      <Field label="Address" id="addr-line1" error={fieldError(error, 'line1')}>
        <input {...bind('line1')} autoComplete="address-line1" placeholder="House, street" required />
      </Field>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Area (optional)" id="addr-area">
          <input {...bind('area')} placeholder="e.g. DHA Phase 6" />
        </Field>
        <Field label="Province (optional)" id="addr-province">
          <input {...bind('province')} autoComplete="address-level1" />
        </Field>
      </div>
      <div className="row">
        <button className="btn" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
