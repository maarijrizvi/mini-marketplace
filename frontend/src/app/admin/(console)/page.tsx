'use client';

import Link from 'next/link';
import { SellerReview } from '@/components/SellerReview';
import { Empty, Loading, Money, StatusChip } from '@/components/ui';
import { useAdminPayments, useAdminUsers, useJobCounts } from '@/features/admin';
import { dateTime, paymentStatus } from '@/features/format';

export default function Operations() {
  const { data: pending, isLoading } = useAdminUsers(undefined, 'pending');
  const { data: counts } = useJobCounts();
  const { data: payments } = useAdminPayments({ status: 'pending' });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Operations</h1>
          <p>What needs an admin today. Every action here is recorded in the audit log under your name.</p>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="l">Seller applications</div>
          <div className="n">{pending?.items.length ?? '—'}</div>
        </div>
        <Link href="/admin/jobs?state=queued" className="tile" style={{ color: 'inherit' }}>
          <div className="l">Jobs waiting</div>
          <div className="n">{counts?.queued ?? '—'}</div>
        </Link>
        <Link href="/admin/jobs?state=failed" className="tile" style={{ color: 'inherit' }}>
          <div className="l">Failed jobs</div>
          <div className="n" style={{ color: counts?.failed ? 'var(--bad)' : undefined }}>{counts?.failed ?? '—'}</div>
        </Link>
        <Link href="/admin/orders?tab=payments" className="tile" style={{ color: 'inherit' }}>
          <div className="l">Payments pending</div>
          <div className="n">{payments?.items.length ?? '—'}</div>
        </Link>
      </div>

      <section className="card stack">
        <div className="row between">
          <h2>Seller applications</h2>
          <Link href="/admin/sellers">All sellers →</Link>
        </div>
        {isLoading ? (
          <Loading />
        ) : !pending?.items.length ? (
          <Empty title="No applications waiting" />
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Applicant</th>
                  <th>Joined</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pending.items.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.seller?.shopName}</strong>
                    </td>
                    <td>
                      {u.firstName} {u.lastName}
                      <div className="tiny muted">{u.email}</div>
                    </td>
                    <td>{dateTime(u.createdAt)}</td>
                    <td>
                      <SellerReview user={u} compact />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card stack">
        <div className="row between">
          <h2>Payments waiting for the gateway</h2>
          <Link href="/admin/orders?tab=payments">All payments →</Link>
        </div>
        {!payments?.items.length ? (
          <p className="muted small">None. Unanswered charges release their stock when the 15-minute hold ends.</p>
        ) : (
          <table className="table">
            <tbody>
              {payments.items.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/orders?order=${p.orderId}`}>Order #{p.orderId}</Link>
                  </td>
                  <td>{p.kind}</td>
                  <td className="mono">{p.providerRef}</td>
                  <td>
                    <Money paisa={p.amount} />
                  </td>
                  <td>
                    <StatusChip map={paymentStatus} value={p.status} />
                  </td>
                  <td>{dateTime(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
