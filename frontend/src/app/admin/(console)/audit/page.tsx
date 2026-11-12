'use client';

import { useSearchParams } from 'next/navigation';
import { Fragment, Suspense, useState } from 'react';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import { useAudit } from '@/features/admin';
import { dateTime } from '@/features/format';
import type { Schemas } from '@/lib/api/client';

const ENTITIES = ['', 'order', 'seller_order', 'payment', 'product', 'variant', 'seller', 'user', 'category', 'job'];

function Audit() {
  const params = useSearchParams();
  const [entityType, setEntityType] = useState(params.get('entityType') ?? '');
  const [entityId, setEntityId] = useState(params.get('entityId') ?? '');
  const [actorType, setActorType] = useState<Schemas['ActorType'] | ''>((params.get('actorType') as Schemas['ActorType']) ?? '');
  const actorId = params.get('actorId') ?? undefined;
  const [open, setOpen] = useState<string | null>(null);
  const { data, isLoading, error } = useAudit({
    entityType: entityType || undefined,
    entityId: /^\d+$/.test(entityId) ? entityId : undefined,
    actorType: actorType || undefined,
    actorId,
  });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Who changed what, and when — people and system processes alike. Records can&apos;t be edited.</p>
        </div>
      </div>
      <div className="row">
        <select className="input" style={{ width: 'auto' }} aria-label="Entity" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>
              {e ? e.replace('_', ' ') : 'All entities'}
            </option>
          ))}
        </select>
        <input className="input" style={{ width: 140 }} placeholder="Entity id" aria-label="Entity id" value={entityId} onChange={(e) => setEntityId(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} aria-label="Actor" value={actorType} onChange={(e) => setActorType(e.target.value as Schemas['ActorType'] | '')}>
          <option value="">Any actor</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
          <option value="system">System</option>
        </select>
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No entries" />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((a) => (
                <Fragment key={a.id}>
                  <tr className="clickable" onClick={() => setOpen(open === a.id ? null : a.id)}>
                    <td>{dateTime(a.createdAt)}</td>
                    <td>
                      {a.actorType}
                      {a.actorId ? ` #${a.actorId}` : ''}
                    </td>
                    <td className="mono">{a.action}</td>
                    <td>
                      {a.entityType} #{a.entityId}
                    </td>
                  </tr>
                  {open === a.id && (
                    <tr>
                      <td colSpan={4}>
                        <pre className="mono tiny" style={{ margin: 0, whiteSpace: 'pre-wrap', background: 'var(--bg)', padding: 12, borderRadius: 8 }}>
                          {JSON.stringify(a.data, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Audit />
    </Suspense>
  );
}
