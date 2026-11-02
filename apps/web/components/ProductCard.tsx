import Link from 'next/link';
import type { ProductSummary, Role } from '@mm/shared';
import { AddToCart } from './AddToCart';

const tints: Record<string, string> = { kitchen: '#E3E9EF', home: '#ECE7DF', office: '#E6E4EE', apparel: '#E2EAE3' };

export const stockLabel = (p: Pick<ProductSummary, 'stock' | 'available'>) =>
  p.stock === 'out' ? 'Out of stock' : p.stock === 'low' ? `Only ${p.available} left` : 'In stock';

export function ProductCard({ product, role }: { product: ProductSummary; role: Role | null }) {
  return (
    <article className="product-card">
      <Link href={`/products/${product.id}`} className="photo" style={{ background: tints[product.category.slug] ?? '#E3E9EF' }}>
        <span>[product photo]</span>
      </Link>
      <div className="body">
        <Link href={`/products/${product.id}`} className="name">
          {product.name}
        </Link>
        <span className="by">by {product.seller.shopName}</span>
        <div className="row">
          <strong>${product.price}</strong>
          <span className={`chip ${product.stock === 'in_stock' ? 'ok' : product.stock === 'out' ? 'bad' : ''}`}>
            {stockLabel(product)}
          </span>
        </div>
        <AddToCart productId={product.id} available={product.available} role={role} />
      </div>
    </article>
  );
}
