import { TopBar } from '@/components/SignedIn';
import { requireUser } from '@/lib/session';

const copy = {
  pending: {
    chip: 'Awaiting review',
    title: 'Your shop is being reviewed',
    body: 'We’ll email you as soon as there’s a decision. Orders and live listings unlock after approval.',
  },
  rejected: { chip: 'Changes needed', title: 'Your application needs changes', body: 'Check the email from our team for what to fix.' },
  suspended: { chip: 'Suspended', title: 'Your shop is suspended', body: 'Contact support to find out more.' },
  approved: { chip: 'Approved', title: 'Your shop is approved', body: 'Seller Hub arrives in a later milestone.' },
} as const;

export default async function SellerApplicationPage() {
  const user = await requireUser('/seller/application', ['seller']);
  const status = user.seller?.status ?? 'pending';
  const c = copy[status];
  return (
    <>
      <TopBar name={user.fullName} />
      <main className="page">
        <span className={`chip${status === 'approved' ? ' ok' : ''}`}>{c.chip}</span>
        <h1 style={{ fontSize: 32 }}>{c.title}</h1>
        <p className="hint" style={{ fontSize: 16 }}>
          {c.body}
        </p>
        <section className="panel">
          <h2 style={{ fontSize: 20 }}>Your application</h2>
          <dl className="facts">
            <dt>Shop name</dt>
            <dd>{user.seller?.shopName}</dd>
            <dt>Account email</dt>
            <dd>{user.email}</dd>
            <dt>Phone</dt>
            <dd>{user.phone}</dd>
          </dl>
        </section>
      </main>
    </>
  );
}
