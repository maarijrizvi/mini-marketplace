'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Empty, ErrorNote, Loading, StatusChip } from '@/components/ui';
import { useAdminUsers } from '@/features/admin';
import { dateTime, sellerStatus } from '@/features/format';

export default function Users() {
  const [q, setQ] = useState('');
  const { data, isLoading, error } = useAdminUsers(q || undefined);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Users</h1>
          <p>Everyone who shops or sells. Admins never see or set passwords.</p>
        </div>
        <input className="input" style={{ maxWidth: 300 }} placeholder="Name, email, phone or shop" aria-label="Search users" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No users match" />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Shop</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>
                      {u.firstName} {u.lastName}
                    </strong>
                  </td>
                  <td>
                    {u.email} {!u.emailVerified && <span className="chip warn">Unverified</span>}
                  </td>
                  <td className="mono">{u.phone}</td>
                  <td>{u.orderCount}</td>
                  <td>
                    {u.seller ? (
                      <>
                        {u.seller.shopName} <StatusChip map={sellerStatus} value={u.seller.status} />
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{dateTime(u.createdAt)}</td>
                  <td>
                    <Link href={`/admin/audit?actorType=user&actorId=${u.id}`} className="small">
                      Activity →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
