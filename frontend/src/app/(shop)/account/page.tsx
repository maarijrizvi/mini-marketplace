'use client';

import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { AddressForm } from '@/components/AddressForm';
import { RequireUser } from '@/components/guards';
import { ErrorNote, Field, fieldError, StatusChip } from '@/components/ui';
import { sellerStatus } from '@/features/format';
import type { User } from '@/features/session';
import { useAddressMutations, useAddresses } from '@/features/shopping';
import { meApi } from '@/lib/api/endpoints';

function Profile({ me }: { me: User }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ firstName: me.firstName, lastName: me.lastName, phone: me.phone });
  const save = useMutation({ mutationFn: meApi.update, onSuccess: (r) => qc.setQueryData(['me'], r.user) });
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(f);
      }}
    >
      <h2>Profile</h2>
      {save.isSuccess && <div className="note ok">Saved.</div>}
      {!fieldError(save.error, 'phone') && <ErrorNote error={save.error} />}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="First name" id="fn">
          <input id="fn" className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} />
        </Field>
        <Field label="Last name" id="ln">
          <input id="ln" className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} />
        </Field>
        <Field label="Mobile" id="ph" error={fieldError(save.error, 'phone')}>
          <input id="ph" className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </Field>
      </div>
      <p className="small muted">
        Email: <strong>{me.email}</strong> <span className="chip ok">Verified</span>
      </p>
      <div>
        <button className="btn" disabled={save.isPending}>
          Save changes
        </button>
      </div>
    </form>
  );
}

function Password() {
  const [f, setF] = useState({ currentPassword: '', newPassword: '' });
  const save = useMutation({ mutationFn: meApi.changePassword, onSuccess: () => setF({ currentPassword: '', newPassword: '' }) });
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(f);
      }}
    >
      <h2>Password</h2>
      {save.isSuccess && <div className="note ok">Password changed.</div>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field label="Current password" id="cp" error={fieldError(save.error, 'currentPassword')}>
          <input id="cp" type="password" className="input" autoComplete="current-password" value={f.currentPassword} onChange={(e) => setF({ ...f, currentPassword: e.target.value })} />
        </Field>
        <Field label="New password" id="np" error={fieldError(save.error, 'newPassword')}>
          <input id="np" type="password" className="input" autoComplete="new-password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} />
        </Field>
      </div>
      <div>
        <button className="btn" disabled={save.isPending}>
          Change password
        </button>
      </div>
    </form>
  );
}

function Addresses() {
  const { data } = useAddresses();
  const m = useAddressMutations();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const list = data?.items ?? [];
  return (
    <section className="card stack">
      <div className="row between">
        <h2>Addresses</h2>
        {editing === null && (
          <button className="btn ghost small" onClick={() => setEditing('new')}>
            Add address
          </button>
        )}
      </div>
      <p className="small muted">The first address is your default at checkout.</p>
      <ErrorNote error={m.remove.error ?? m.makeDefault.error} />
      {list.map((a) =>
        editing === a.id ? (
          <AddressForm
            key={a.id}
            initial={a}
            submitLabel="Save"
            pending={m.update.isPending}
            error={m.update.error}
            onCancel={() => setEditing(null)}
            onSubmit={(body) => m.update.mutate({ id: a.id, body }, { onSuccess: () => setEditing(null) })}
          />
        ) : (
          <div key={a.id} className="row between" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <div>
              <strong>{a.label}</strong> {a.isDefault && <span className="chip info">Default</span>}
              <div className="small muted">
                {a.recipient} · {[a.line1, a.area, a.city].filter(Boolean).join(', ')} · {a.phone}
              </div>
            </div>
            <div className="row">
              {!a.isDefault && (
                <button className="linkbtn" onClick={() => m.makeDefault.mutate(a.id)}>
                  Make default
                </button>
              )}
              <button className="linkbtn" onClick={() => setEditing(a.id)}>
                Edit
              </button>
              <button className="linkbtn danger" onClick={() => m.remove.mutate(a.id)}>
                Remove
              </button>
            </div>
          </div>
        ),
      )}
      {editing === 'new' && (
        <AddressForm
          submitLabel="Add address"
          pending={m.add.isPending}
          error={m.add.error}
          onCancel={() => setEditing(null)}
          onSubmit={(body) => m.add.mutate(body, { onSuccess: () => setEditing(null) })}
        />
      )}
    </section>
  );
}

export default function AccountPage() {
  return (
    <div className="wrap page">
      <RequireUser>
        {(me) => (
          <div className="stack-lg">
            <div className="page-head">
              <div>
                <h1>Hi, {me.firstName}</h1>
                <p>Your profile, addresses and selling.</p>
              </div>
              <Link href="/orders" className="btn ghost">
                My orders
              </Link>
            </div>
            <Profile me={me} />
            <Addresses />
            <Password />
            <section className="card stack">
              <h2>Selling</h2>
              {me.seller ? (
                <div className="row between">
                  <span>
                    {me.seller.shopName} <StatusChip map={sellerStatus} value={me.seller.status} />
                  </span>
                  <Link href={me.seller.status === 'approved' ? '/seller' : '/sell'} className="btn ghost small">
                    {me.seller.status === 'approved' ? 'Open Seller Hub' : 'View application'}
                  </Link>
                </div>
              ) : (
                <div className="row between">
                  <span className="muted">Open a shop with the same account. Your buying stays as it is.</span>
                  <Link href="/sell" className="btn gold small">
                    Start selling
                  </Link>
                </div>
              )}
            </section>
          </div>
        )}
      </RequireUser>
    </div>
  );
}
