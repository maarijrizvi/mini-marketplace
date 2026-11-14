import type { Schemas } from '@/lib/api/client';

type Step = { label: string; state: 'done' | 'todo' | 'stop' };

/** The steps a parcel has been through. A parcel that stops early shows where it stopped, in red. */
function steps(status: Schemas['ParcelStatus']): Step[] {
  switch (status) {
    case 'pending':
      return [{ label: 'Placed', state: 'done' }, { label: 'Picked up', state: 'todo' }, { label: 'Delivered', state: 'todo' }];
    case 'shipped':
      return [{ label: 'Placed', state: 'done' }, { label: 'Picked up', state: 'done' }, { label: 'Delivered', state: 'todo' }];
    case 'delivered':
      return [{ label: 'Placed', state: 'done' }, { label: 'Picked up', state: 'done' }, { label: 'Delivered', state: 'done' }];
    case 'refused':
      return [{ label: 'Placed', state: 'done' }, { label: 'Picked up', state: 'done' }, { label: 'Refused at door', state: 'stop' }];
    case 'delivery_failed':
      return [{ label: 'Placed', state: 'done' }, { label: 'Picked up', state: 'done' }, { label: 'Not delivered', state: 'stop' }];
    case 'cancelled':
      return [{ label: 'Placed', state: 'done' }, { label: 'Cancelled before pickup', state: 'stop' }];
  }
}

export function ParcelTimeline({ status }: { status: Schemas['ParcelStatus'] }) {
  return (
    <ol className="steps" style={{ listStyle: 'none', padding: 0 }} aria-label="Parcel progress">
      {steps(status).map((s) => (
        <li key={s.label} className={`step ${s.state === 'done' ? 'done' : ''} ${s.state === 'stop' ? 'stop' : ''}`}>
          <span className="bar" />
          {s.label}
        </li>
      ))}
    </ol>
  );
}
