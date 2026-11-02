import { AuthShell } from '@/components/AuthShell';
import { ResetForm } from './ResetForm';

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = '' } = await searchParams;
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Pick something only you would know."
      points={['We’ll sign you out everywhere else', 'And email you so you know it was you']}
    >
      <ResetForm token={token} />
    </AuthShell>
  );
}
