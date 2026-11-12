'use client';

import { useState } from 'react';
import { SellerReview } from '@/components/SellerReview';
import { Dialog, Empty, ErrorNote, Field, Loading, Money, StatusChip } from '@/components/ui';
import { usePayout, useAdminUsers } from '@/features/admin';
import { dateTime, parseRupees, sellerStatus } from '@/features/format';
import type { Schemas } from '@/lib/api/client';

const TABS: [Schemas['SellerStatus'] | undefined, string][] = [
  ['pending', 'Awaiting review'],
  ['approved', 'Approved'],
  ['suspended', 'Suspended'],
  ['rejected', 'Rejected'],
];

function Payout({ user, onClose }: { user: Schemas['AdminUserView']; onClose: () => void }) {
  const payout = usePayout();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [key] = useState(() => `po-${Date.now()}-${user.id}`);
  return (
    <Dialog title={`Record a payout to ${user.seller?.shopName}`} onClose={onClose}>
      {payout.isSuccess ? (
        <>
          <div className="note ok">
            Recorded <Money paisa={-payout.data.amount} />. It shows in the seller&apos;s ledger.
          </div>
          <button className="btn" onClick={onClose}>
            Done
          </button>
        </>
      ) : (
        <>
          <p className="small muted">Make the bank transfer first, then record it here. It can&apos;t be more than the seller&apos;s balance.</p>
          <Field label="Amount (Rs)" id="amt">
            <input id="amt" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Note (optional)" id="note">
            <input id="note" className="input" placeholder="Bank reference" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <ErrorNote error={payout.error} />
          <button
            className="btn"
            disabled={!parseRupees(amount) || payout.isPending}
            onClick={() => payout.mutate({ id: user.id, amount: parseRupees(amount)!, note: note || undefined, key })}
          >
            Record payout
          </button>
        </>
      )}
    </Dialog>
  );
}

export default function Sellers() {
  const [status, setStatus] = useState<Schemas['SellerStatus'] | undefined>('pending');
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useAdminUsers(q || undefined, status);
  const [paying, setPaying] = useState<Schemas['AdminUserView'] | null>(null);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Sellers</h1>
          <p>Sellers can only list products after approval. Suspending a seller hides their products from the shop.</p>
        </div>
      </div>
      <div className="row between">
        <div className="tabs">
          {TABS.map(([s, l]) => (
            <button key={l} className={`tab ${status === s ? 'on' : ''}`} onClick={() => setStatus(s)}>
              {l}
            </button>
          ))}
        </div>
        <input className="input" style={{ maxWidth: 260 }} placeholder="Search shop, name or email" aria-label="Search sellers" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No sellers here" />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Shop</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Reviewed by</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.seller?.shopName}</strong>
                    {u.seller?.statusReason && <div className="tiny muted">Reason: {u.seller.statusReason}</div>}
                  </td>
                  <td>
                    {u.firstName} {u.lastName}
                    <div className="tiny muted">{u.email}</div>
                  </td>
                  <td>{u.seller && <StatusChip map={sellerStatus} value={u.seller.status} />}</td>
                  <td>{u.reviewedBy?.fullName ?? '—'}</td>
                  <td>{dateTime(u.createdAt)}</td>
                  <td>
                    <span className="row" style={{ gap: 6 }}>
                      <SellerReview user={u} compact />
                      {(u.seller?.status === 'approved' || u.seller?.status === 'suspended') && (
                        <button className="btn ghost small" onClick={() => setPaying(u)}>
                          Payout
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {paying && <Payout user={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}
