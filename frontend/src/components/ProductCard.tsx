import Link from 'next/link';
import type { Schemas } from '@/lib/api/client';
import { rupees } from '@/features/format';
import { ProductImage } from './ui';

export function ProductCard({ p }: { p: Schemas['ProductSummary'] }) {
  const price = p.priceFrom === p.priceTo ? rupees(p.priceFrom) : `From ${rupees(p.priceFrom)}`;
  return (
    <Link href={`/products/${p.id}`} className="pcard">
      <ProductImage src={p.image} name={p.name} className="img" />
      <div className="body">
        <span className="tiny muted">{p.seller.shopName}</span>
        <span className="name">{p.name}</span>
        <span className="price">{price}</span>
        {!p.inStock && <span className="chip bad plain">Out of stock</span>}
      </div>
    </Link>
  );
}
