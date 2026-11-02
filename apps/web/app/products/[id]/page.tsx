import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ProductDetail } from '@mm/shared';
import { AddToCart } from '@/components/AddToCart';
import { stockLabel } from '@/components/ProductCard';
import { SiteHeader } from '@/components/SiteHeader';
import { serverGet } from '@/lib/server-api';
import { getSessionUser } from '@/lib/session';

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [user, product] = await Promise.all([getSessionUser(), serverGet<ProductDetail>(`/catalogue/products/${id}`)]);
  if (!product) notFound();
  return (
    <>
      <SiteHeader />
      <main className="wrap stack-lg">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link href="/shop">Shop</Link> / <Link href={`/shop?category=${product.category.slug}`}>{product.category.name}</Link> /{' '}
          {product.name}
        </nav>
        <div className="product-detail">
          <div className="photo big">[product photo]</div>
          <div className="stack">
            <span className="chip">{product.category.name}</span>
            <h1>{product.name}</h1>
            <p className="hint">
              Sold and shipped by <Link href={`/shop?seller=${product.seller.id}`}>{product.seller.shopName}</Link>
            </p>
            <div className="row" style={{ justifyContent: 'flex-start' }}>
              <span className="price">${product.price}</span>
              <span className={`chip ${product.stock === 'in_stock' ? 'ok' : product.stock === 'out' ? 'bad' : ''}`}>
                {stockLabel(product)}
              </span>
            </div>
            <AddToCart productId={product.id} available={product.available} role={user?.role ?? null} full />
            <p className="note info">
              Price and stock are confirmed again when you check out. Items aren’t reserved until you place the order.
            </p>
            <section>
              <h2>Description</h2>
              <p style={{ whiteSpace: 'pre-line' }}>{product.description || 'The seller hasn’t added a description yet.'}</p>
            </section>
            <p className="hint mono">SKU {product.sku}</p>
          </div>
        </div>
      </main>
    </>
  );
}
