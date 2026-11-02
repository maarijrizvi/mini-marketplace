import Link from 'next/link';
import { TopBar } from '@/components/SignedIn';
import { serverGet } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { ProductsClient, type SellerProduct } from './ProductsClient';

export default async function SellerProductsPage() {
  const user = await requireUser('/seller/products', ['seller']);
  const [data, categories] = await Promise.all([
    serverGet<{ shop: { shopName: string; status: string }; products: SellerProduct[] }>('/seller/products'),
    serverGet<{ id: string; name: string }[]>('/catalogue/categories'),
  ]);
  const live = user.seller?.status === 'approved';
  return (
    <>
      <TopBar name={user.fullName} />
      <main className="page wide">
        <div className="row">
          <div>
            <h1>Products &amp; inventory</h1>
            <p className="hint">Reserved units are held for orders awaiting payment and return to stock if the payment fails or expires.</p>
          </div>
          {!live && <Link href="/seller/application">Application status →</Link>}
        </div>
        {!live && (
          <p className="note warn">Your shop is awaiting review. Products you add are saved as drafts and go live once it’s approved.</p>
        )}
        {data ? (
          <ProductsClient products={data.products} categories={categories ?? []} live={live} />
        ) : (
          <p className="note bad">Your shop can’t change products right now.</p>
        )}
      </main>
    </>
  );
}
