import { AuthShell } from '@/components/AuthShell';
import { VerifyForm } from './VerifyForm';

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = '' } = await searchParams;
  return (
    <AuthShell
      eyebrow="Almost there"
      title="Confirm it’s really your email."
      points={['We use it for receipts and shipping updates', 'And to help you reset your password']}
    >
      <VerifyForm initialEmail={email} />
    </AuthShell>
  );
}
