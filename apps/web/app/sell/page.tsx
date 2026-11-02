import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/AuthShell';
import { getSessionUser, homeFor } from '@/lib/session';
import { SellerForm } from './SellerForm';

export default async function SellPage() {
  const user = await getSessionUser();
  // Sellers and admins already have their place; customers and visitors can register a shop.
  if (user && user.role !== 'customer') redirect(homeFor(user));
  return (
    <AuthShell
      eyebrow="For sellers"
      title="Open your shop on Mini Marketplace."
      points={[
        'Your own seller login, separate from any customer account',
        'Our team reviews every new shop before it opens',
        'Our shipping partner collects from your pickup address',
      ]}
      foot={
        <>
          Already have a seller account? <Link href="/signin">Sign in</Link>
        </>
      }
    >
      <SellerForm customerEmail={user?.email} />
    </AuthShell>
  );
}
