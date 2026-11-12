'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ParcelTimeline } from '@/components/ParcelTimeline';
import { Dialog, Empty, ErrorNote, Loading, Money, StatusChip } from '@/components/ui';
import { dateTime, dropReasons, optionsLabel, parcelStatus } from '@/features/format';
import { nextStep, parcelSnapshot, useParcel, useParcelActions, useParcels } from '@/features/seller';
import type { Schemas } from '@/lib/api/client';

type S = Schemas;
const TABS: { key: S['ParcelStatus'] | 'late' | 'all'; label: string }[] = [
  { key: 'pending', label: 'To send' },
  { key: 'late', label: 'Late' },
  { key: 'shipped', label: 'With Leopards' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'all', label: 'All' },
];

function ParcelPanel({ id }: { id: string }) {
  // While a job (pickup booking, courier webhook) is on its way, poll until the parcel changes.
  const [waitFrom, setWaitFrom] = useState<string | null>(null);
  const { data: p, isLoading } = useParcel(id, waitFrom);
  const snapshot = p ? parcelSnapshot(p) : '';
  useEffect(() => {
    if (waitFrom === null) return;
    const t = setTimeout(() => setWaitFrom(null), 20_000);
    return () => clearTimeout(t);
  }, [waitFrom]);
  const waiting = waitFrom !== null && snapshot === waitFrom;
  const act = useParcelActions(id);
  const [dropping, setDropping] = useState<S['SellerOrderItem'] | null>(null);
  const [reason, setReason] = useState<S['DropItemRequest']['reason']>('out_of_stock');
  const [note, setNote] = useState('');

  if (isLoading || !p) return <Loading />;
  const step = nextStep(p);
  const active = p.items.filter((i) => i.status === 'active');
  const addr = p.shippingAddress;

  return (
    <section className="card stack" aria-label={`Parcel ${p.id}`}>
      <div className="row between">
        <h2>Order #{p.orderId}</h2>
        <StatusChip map={parcelStatus} value={p.status} />
      </div>
      <ParcelTimeline status={p.status} />
      <dl className="kv">
        <dt>Placed</dt>
        <dd>{dateTime(p.placedAt)}</dd>
        <dt>Ship by</dt>
        <dd style={{ color: p.late ? 'var(--bad)' : undefined }}>
          {dateTime(p.shipDeadline)} {p.late && <span className="chip bad">Late</span>}
        </dd>
        <dt>Ship to</dt>
        <dd>
          {addr.recipient} · {addr.phone}
          <br />
          {[addr.line1, addr.line2, addr.area, addr.city, addr.province].filter(Boolean).join(', ')}
        </dd>
        <dt>Collect</dt>
        <dd>{p.codAmount !== null ? <><Money paisa={p.codAmount} /> cash on delivery</> : 'Nothing — paid online'}</dd>
        {p.trackingNo && (
          <>
            <dt>Tracking</dt>
            <dd className="mono">{p.trackingNo}</dd>
          </>
        )}
      </dl>
      <hr className="divider" />
      {p.items.map((it) => (
        <div key={it.id} className="row between small" style={{ opacity: it.status === 'dropped' ? 0.55 : 1 }}>
          <span>
            {it.quantity} × {it.productName}
            <span className="muted"> · {optionsLabel(it.options)} · </span>
            <span className="mono">{it.sku}</span>
            {it.status === 'dropped' && <span className="chip bad" style={{ marginLeft: 6 }}>Dropped</span>}
          </span>
          <span className="row" style={{ gap: 8 }}>
            <Money paisa={it.lineTotal} />
            {p.status === 'pending' && it.status === 'active' && (
              <button className="linkbtn danger" onClick={() => setDropping(it)}>
                Can&apos;t send
              </button>
            )}
          </span>
        </div>
      ))}
      <ErrorNote error={act.bookPickup.error ?? act.courierEvent.error} />
      {step === 'book' && active.length > 0 && (
        <div className="stack">
          <p className="small muted">Pack the items, then book a pickup. Leopards collects the parcel and updates tracking from there.</p>
          <button
            className="btn gold"
            disabled={act.bookPickup.isPending}
            onClick={() => act.bookPickup.mutate(undefined, { onSuccess: () => setWaitFrom(snapshot) })}
          >
            Book Leopards pickup
          </button>
        </div>
      )}
      {waiting && <p className="small muted" role="status">Waiting for Leopards…</p>}
      {(step === 'awaiting-pickup' || step === 'in-transit') && p.trackingNo && (
        <div className="card sandbox stack" style={{ padding: 14 }}>
          <span className="small">
            <strong>Sandbox courier.</strong> Stands in for Leopards&apos; scans, sent as signed webhooks.
          </span>
          <div className="row">
            {step === 'awaiting-pickup' && (
              <button className="btn small" onClick={() => act.courierEvent.mutate({ trackingNo: p.trackingNo!, event: 'picked_up' }, { onSuccess: () => setWaitFrom(snapshot) })}>
                Simulate pickup scan
              </button>
            )}
            {step === 'in-transit' &&
              (['delivered', 'refused', 'delivery_failed'] as const).map((ev) => (
                <button key={ev} className={`btn small ${ev === 'delivered' ? '' : 'ghost'}`} onClick={() => act.courierEvent.mutate({ trackingNo: p.trackingNo!, event: ev }, { onSuccess: () => setWaitFrom(snapshot) })}>
                  {ev === 'delivered' ? 'Simulate delivery' : ev === 'refused' ? 'Refused at door' : 'Delivery failed'}
                </button>
              ))}
          </div>
        </div>
      )}
      {dropping && (
        <Dialog title={`Drop ${dropping.productName}?`} onClose={() => setDropping(null)}>
          <p className="muted small">
            Only this item is dropped; its stock goes back on sale.{' '}
            {p.codAmount !== null ? 'The courier collects less cash.' : 'The customer is refunded for it.'} The rest of the order goes ahead.
          </p>
          <div className="field">
            <label htmlFor="drop-reason">Reason (shared with the customer)</label>
            <select id="drop-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
              {dropReasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="drop-note">Note (optional)</label>
            <input id="drop-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <ErrorNote error={act.drop.error} />
          <div className="row">
            <button
              className="btn danger"
              disabled={act.drop.isPending}
              onClick={() =>
                act.drop.mutate({ itemId: dropping.id, body: { reason, note: note || undefined } }, { onSuccess: () => setDropping(null) })
              }
            >
              Drop item
            </button>
            <button className="btn ghost" onClick={() => setDropping(null)}>
              Keep it
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

function Orders() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const tab: string = params.get('late') ? 'late' : (params.get('status') ?? 'pending');
  const status = tab === 'late' ? 'pending' : tab === 'all' ? undefined : (tab as S['ParcelStatus']);
  const { data, isLoading, error } = useParcels(status, tab === 'late' || undefined);
  const [selected, setSelected] = useState<string | null>(null);

  const go = (key: string) => router.push(key === 'late' ? `${path}?late=1` : `${path}?status=${key}`);
  const items = data?.items ?? [];
  const current = selected ?? items[0]?.id ?? null;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Orders to fulfil</h1>
          <p>Only your own parcels appear here. Book a pickup and Leopards takes it from there.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'on' : ''}`} onClick={() => go(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <ErrorNote error={error} />
      {isLoading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty title="Nothing here">
          <p>New orders appear as soon as they&apos;re paid or placed with cash on delivery.</p>
        </Empty>
      ) : (
        <div className="split">
          <div className="card flush scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Items</th>
                  <th>Ship by</th>
                  <th>Your total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id} className={`clickable ${current === p.id ? 'on' : ''}`} onClick={() => setSelected(p.id)}>
                    <td>
                      <button className="linkbtn" onClick={() => setSelected(p.id)}>
                        #{p.orderId}
                      </button>
                    </td>
                    <td>{p.items.filter((i) => i.status === 'active').reduce((n, i) => n + i.quantity, 0)}</td>
                    <td style={{ color: p.late ? 'var(--bad)' : undefined }}>{dateTime(p.shipDeadline)}</td>
                    <td>
                      <Money paisa={p.itemsTotal} />
                    </td>
                    <td>
                      <StatusChip map={parcelStatus} value={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current && <ParcelPanel key={current} id={current} />}
        </div>
      )}
    </div>
  );
}

export default function SellerOrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Orders />
    </Suspense>
  );
}
