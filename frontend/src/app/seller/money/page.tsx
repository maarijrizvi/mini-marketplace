'use client';

import { useState } from 'react';
import { Empty, ErrorNote, Loading, Money } from '@/components/ui';
import { dateTime } from '@/features/format';
import { useBalance, useLedger } from '@/features/seller';
import type { Schemas } from '@/lib/api/client';

const TYPES: [Schemas['LedgerEntryType'] | undefined, string][] = [
  [undefined, 'All'],
  ['sale', 'Sales'],
  ['commission', 'Commission'],
  ['refund', 'Refunds'],
  ['payout', 'Payouts'],
];

const LABEL: Record<Schemas['LedgerEntryType'], string> = {
  sale: 'Sale',
  commission: 'Platform commission',
  refund: 'Refund',
  payout: 'Payout to you',
};

export default function SellerMoney() {
  const [type, setType] = useState<Schemas['LedgerEntryType'] | undefined>();
  const { data: balance } = useBalance();
  const { data, isLoading, error } = useLedger(type);
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Money</h1>
          <p>Sales are added when a parcel is delivered, minus the platform&apos;s 10% commission. Payouts are recorded by an admin.</p>
        </div>
      </div>
      <div className="tiles">
        <div className="tile">
          <div className="l">Balance owed to you</div>
          <div className="n">{balance ? <Money paisa={balance.balance} /> : '—'}</div>
        </div>
      </div>
      <div className="tabs">
        {TYPES.map(([t, l]) => (
          <button key={l} className={`tab ${type === t ? 'on' : ''}`} onClick={() => setType(t)}>
            {l}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : !data?.items.length ? (
        <Empty title="No entries yet">
          <p>Your first sale appears here once a parcel is delivered.</p>
        </Empty>
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry</th>
                <th>Parcel</th>
                <th style={{ textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td>{dateTime(e.createdAt)}</td>
                  <td>{LABEL[e.entryType]}</td>
                  <td className="mono">{e.sellerOrderId ? `#${e.sellerOrderId}` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: e.amount < 0 ? 'var(--bad)' : 'var(--ok)' }}>
                    {e.amount < 0 ? '−' : '+'}
                    <Money paisa={Math.abs(e.amount)} />
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
