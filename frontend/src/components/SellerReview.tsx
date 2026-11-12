'use client';

import { useState } from 'react';
import { reviewActions, useReviewSeller } from '@/features/admin';
import type { Schemas } from '@/lib/api/client';
import { Dialog, ErrorNote } from './ui';

const LABEL = { approve: 'Approve', reject: 'Reject', suspend: 'Suspend', reinstate: 'Reinstate' } as const;
const NEEDS_REASON = new Set(['reject', 'suspend']);

/** Approve / reject / suspend / reinstate buttons for one seller, asking for a reason where the rules need one. */
export function SellerReview({ user, compact }: { user: Schemas['AdminUserView']; compact?: boolean }) {
  const review = useReviewSeller();
  const [asking, setAsking] = useState<'reject' | 'suspend' | null>(null);
  const [reason, setReason] = useState('');
  const actions = reviewActions(user.seller?.status);
  if (!actions.length) return null;
  return (
    <>
      <span className="row" style={{ gap: 6 }}>
        {actions.map((a) => (
          <button
            key={a}
            className={`btn small ${a === 'approve' || a === 'reinstate' ? '' : 'danger'}`}
            disabled={review.isPending}
            onClick={() => (NEEDS_REASON.has(a) ? setAsking(a as 'reject' | 'suspend') : review.mutate({ id: user.id, action: a }))}
          >
            {LABEL[a]}
          </button>
        ))}
      </span>
      {!compact && <ErrorNote error={review.error} />}
      {asking && (
        <Dialog title={`${LABEL[asking]} ${user.seller?.shopName}?`} onClose={() => setAsking(null)}>
          <p className="muted small">
            {asking === 'suspend'
              ? 'Their products leave the shop at once. Orders they already took still need sending.'
              : 'They can apply again later.'}{' '}
            The seller sees this reason.
          </p>
          <div className="field">
            <label htmlFor="review-reason">Reason</label>
            <input id="review-reason" className="input" required value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <ErrorNote error={review.error} />
          <div className="row">
            <button
              className="btn danger"
              disabled={!reason.trim() || review.isPending}
              onClick={() => review.mutate({ id: user.id, action: asking, reason }, { onSuccess: () => { setAsking(null); setReason(''); } })}
            >
              {LABEL[asking]}
            </button>
            <button className="btn ghost" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
