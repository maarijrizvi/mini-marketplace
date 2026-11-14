import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { ProductView } from './ProductView';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:8000';

/** Server-side existence check, so a missing product is a real 404 (not a 200 with an error message). */
const lookup = cache(async (id: string): Promise<{ name: string } | 'missing' | null> => {
  const r = await fetch(`${API}/api/v1/products/${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
  if (!r) return null; // API unreachable: let the client page try and show its own error
  if (r.status === 404) return 'missing';
  return r.ok ? ((await r.json()) as { name: string }) : null;
});

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await lookup((await params).id);
  if (product === 'missing') return { title: 'Not found' };
  return { title: product ? product.name : 'Product' };
}

export default async function ProductPage({ params }: Props) {
  if ((await lookup((await params).id)) === 'missing') notFound();
  return <ProductView />;
}
