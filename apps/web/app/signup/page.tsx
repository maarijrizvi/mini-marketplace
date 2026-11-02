import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { getSessionUser, homeFor } from '@/lib/session';
import { SignUpForm } from './SignUpForm';

export default async function SignUpPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user));
  return (
    <AuthShell
      eyebrow="Join the marketplace"
      title="One account for every shop here."
      points={['One cart and one checkout across sellers', 'Track each seller’s shipment separately', 'Saved addresses and order history']}
      foot={
        <>
          Already have an account? <Link href="/signin">Sign in</Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
