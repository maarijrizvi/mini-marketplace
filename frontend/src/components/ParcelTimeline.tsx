import type { Schemas } from '@/lib/api/client';
import { parcelSteps } from '@/features/format';

/** Placed → Picked up → Delivered, with the final state shown in red if it ended badly. */
export function ParcelTimeline({ status }: { status: Schemas['ParcelStatus'] }) {
  const reached = { pending: 0, shipped: 1, delivered: 2, refused: 1, delivery_failed: 1, cancelled: 0 }[status];
  const bad = status === 'refused' || status === 'delivery_failed' || status === 'cancelled';
  return (
    <ol className="steps" style={{ listStyle: 'none', padding: 0 }} aria-label="Parcel progress">
      {parcelSteps.map((s, i) => {
        const done = i <= reached;
        const stop = bad && i === reached + 1;
        return (
          <li key={s.key} className={`step ${done ? 'done' : ''} ${stop ? 'stop' : ''}`}>
            <span className="bar" />
            {stop ? { refused: 'Refused', delivery_failed: 'Not delivered', cancelled: 'Cancelled' }[status as string] : s.label}
          </li>
        );
      })}
    </ol>
  );
}
