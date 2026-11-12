'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Empty, ErrorNote, Loading } from '@/components/ui';
import { useJobActions, useJobCounts, useJobs } from '@/features/admin';
import { dateTime } from '@/features/format';

type State = 'queued' | 'running' | 'failed' | undefined;

function Jobs() {
  const params = useSearchParams();
  const [state, setState] = useState<State>((params.get('state') as State) ?? 'failed');
  const { data, isLoading, error } = useJobs(state);
  const { data: counts } = useJobCounts();
  const act = useJobActions();
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Background jobs</h1>
          <p>Emails, refunds, Leopards bookings and stock releases run here. Failures retry 5 times, then wait for you.</p>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="l">Waiting</div>
          <div className="n">{counts?.queued ?? '—'}</div>
        </div>
        <div className="tile">
          <div className="l">Running</div>
          <div className="n">{counts?.running ?? '—'}</div>
        </div>
        <div className="tile">
          <div className="l">Failed</div>
          <div className="n" style={{ color: counts?.failed ? 'var(--bad)' : undefined }}>{counts?.failed ?? '—'}</div>
        </div>
      </div>
      <div className="tabs">
        {(['failed', 'queued', 'running', undefined] as const).map((s) => (
          <button key={s ?? 'all'} className={`tab ${state === s ? 'on' : ''}`} onClick={() => setState(s)}>
            {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>
      <ErrorNote error={error ?? act.retry.error ?? act.remove.error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="Nothing here" />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Job</th>
                <th>Task</th>
                <th>Arguments</th>
                <th>Attempts</th>
                <th>Status</th>
                <th>Queued</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((j) => (
                <tr key={j.id}>
                  <td className="mono">#{j.id}</td>
                  <td className="mono">{j.task}</td>
                  <td className="mono tiny" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={JSON.stringify(j.args)}>
                    {JSON.stringify(j.args)}
                  </td>
                  <td>{j.attempts} / 5</td>
                  <td>
                    <span className={`chip ${j.status === 'failed' ? 'bad' : j.status === 'succeeded' ? 'ok' : 'info'}`}>{j.status}</span>
                  </td>
                  <td>{dateTime(j.createdAt)}</td>
                  <td>
                    {(j.status === 'failed' || j.status === 'queued') && (
                      <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                        <button className="linkbtn" onClick={() => act.retry.mutate(j.id)}>
                          Retry now
                        </button>
                        <button className="linkbtn danger" onClick={() => confirm('Remove this job? Its arguments stay in the audit log.') && act.remove.mutate(j.id)}>
                          Remove
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="tiny muted">Retrying is safe: every job checks the current state first, so no refund, email or ledger entry is doubled.</p>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Jobs />
    </Suspense>
  );
}
