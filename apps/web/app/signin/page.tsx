import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { getSessionUser, homeFor } from '@/lib/session';
import { SignInForm } from './SignInForm';

const notices: Record<string, string> = {
  'signed-out': 'You’re signed out.',
  'password-reset': 'Password changed. Sign in with your new password.',
};

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string; notice?: string }> }) {
  const { next = '', notice } = await searchParams;
  const user = await getSessionUser();
  if (user) redirect(homeFor(user));
  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Your cart and orders are waiting."
      points={['Customers, sellers and admins all sign in here', 'You’ll land on the right place for your account']}
      foot={
        <>
          New here? <Link href="/signup">Create an account</Link>
        </>
      }
    >
      <SignInForm
        next={next}
        notice={(notice && notices[notice]) || (next ? 'Sign in to continue. We’ll take you back afterwards.' : undefined)}
      />
    </AuthShell>
  );
}
