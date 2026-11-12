'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { Dialog, ErrorNote, Field, fieldError, hasFieldErrors, Loading, StatusChip } from '@/components/ui';
import { optionsLabel, parseRupees, productStatus, rupees } from '@/features/format';
import { useProductMutations, useSellerProduct } from '@/features/seller';
import { useCategories } from '@/features/shopping';
import type { Schemas } from '@/lib/api/client';

type S = Schemas;

function Details({ p, m }: { p: S['SellerProduct']; m: ReturnType<typeof useProductMutations> }) {
  const [f, setF] = useState({ name: p.name, description: p.description, images: p.images });
  const locked = p.status === 'archived';
  return (
    <form
      className="card stack"
      onSubmit={(e) => {
        e.preventDefault();
        m.update.mutate(f);
      }}
    >
      <h2>Details</h2>
      {m.update.isSuccess && <div className="note ok">Saved.</div>}
      <ErrorNote error={m.update.error} />
      <Field label="Name" id="name" error={fieldError(m.update.error, 'name')}>
        <input id="name" className="input" disabled={locked} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field label="Description" id="desc">
        <textarea id="desc" className="input" disabled={locked} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <ImageUploader label="Product images (used when a variant has none)" images={f.images} onChange={(images) => setF({ ...f, images })} />
      {!locked && (
        <div>
          <button className="btn" disabled={m.update.isPending}>
            Save details
          </button>
        </div>
      )}
    </form>
  );
}

function AddVariant({ p, m, schema }: { p: S['SellerProduct']; m: ReturnType<typeof useProductMutations>; schema: Record<string, string[]> }) {
  const [options, setOptions] = useState<Record<string, string>>({});
  const [sku, setSku] = useState('');
  const [price, setPrice] = useState('');
  const [onHand, setOnHand] = useState('0');
  const err = (k: string) => fieldError(m.addVariant.error, k);
  return (
    <form
      className="stack"
      style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}
      onSubmit={(e) => {
        e.preventDefault();
        m.addVariant.mutate(
          { sku, options, price: parseRupees(price) ?? 0, onHand: Number(onHand) || 0 },
          { onSuccess: () => { setSku(''); setPrice(''); setOnHand('0'); setOptions({}); } },
        );
      }}
    >
      <h3>Add a variant</h3>
      {!hasFieldErrors(m.addVariant.error) && <ErrorNote error={m.addVariant.error} />}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {p.optionNames.map((name) => (
          <Field key={name} label={name[0].toUpperCase() + name.slice(1)} id={`opt-${name}`}>
            <select id={`opt-${name}`} className="input" required value={options[name] ?? ''} onChange={(e) => setOptions({ ...options, [name]: e.target.value })}>
              <option value="">Choose</option>
              {(schema[name] ?? []).map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
        ))}
        <Field label="SKU" id="sku" error={err('sku')} hint="Unique within your shop">
          <input id="sku" className="input mono" required pattern="[A-Za-z0-9._\-]{1,40}" value={sku} onChange={(e) => setSku(e.target.value)} />
        </Field>
        <Field label="Price (Rs)" id="price" error={err('price')}>
          <input id="price" className="input" required inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label="Stock on hand" id="stock" error={err('onHand')}>
          <input id="stock" className="input" type="number" min={0} value={onHand} onChange={(e) => setOnHand(e.target.value)} />
        </Field>
      </div>
      {err('options') && <span className="errmsg">{err('options')}</span>}
      <div>
        <button className="btn" disabled={m.addVariant.isPending}>
          Add variant
        </button>
      </div>
    </form>
  );
}

function VariantRow({ v, m, locked }: { v: S['SellerVariant']; m: ReturnType<typeof useProductMutations>; locked: boolean }) {
  const [editing, setEditing] = useState<'price' | 'stock' | null>(null);
  const [price, setPrice] = useState(String(v.price / 100));
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('Stock count');
  return (
    <tr>
      <td>{optionsLabel(v.options) || '—'}</td>
      <td className="mono">{v.sku}</td>
      <td>{rupees(v.price)}</td>
      <td>{v.onHand}</td>
      <td>{v.reserved}</td>
      <td>
        <span className={v.available === 0 ? 'chip bad' : v.available <= 3 ? 'chip warn' : ''}>{v.available}</span>
      </td>
      <td>{v.isActive ? <span className="chip ok">On sale</span> : <span className="chip">Hidden</span>}</td>
      <td>
        {!locked && (
          <span className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            <button className="linkbtn" onClick={() => setEditing('price')}>Price</button>
            <button className="linkbtn" onClick={() => setEditing('stock')}>Stock</button>
            <button className="linkbtn" onClick={() => m.updateVariant.mutate({ variantId: v.id, body: { isActive: !v.isActive } })}>
              {v.isActive ? 'Hide' : 'Show'}
            </button>
          </span>
        )}
        {editing === 'price' && (
          <Dialog title={`Price for ${v.sku}`} onClose={() => setEditing(null)}>
            <p className="small muted">Orders already placed keep the price they were bought at.</p>
            <Field label="Price (Rs)" id="np">
              <input id="np" className="input" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
            <ErrorNote error={m.updateVariant.error} />
            <button className="btn" disabled={m.updateVariant.isPending} onClick={() => m.updateVariant.mutate({ variantId: v.id, body: { price: parseRupees(price) ?? 0 } }, { onSuccess: () => setEditing(null) })}>
              Save price
            </button>
          </Dialog>
        )}
        {editing === 'stock' && (
          <Dialog title={`Adjust stock for ${v.sku}`} onClose={() => setEditing(null)}>
            <p className="small muted">
              On hand {v.onHand}, of which {v.reserved} are held for unpaid orders. Enter +10 to add, −2 to remove.
            </p>
            <Field label="Change" id="delta">
              <input id="delta" className="input" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} />
            </Field>
            <Field label="Reason" id="why">
              <input id="why" className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
            <ErrorNote error={m.adjustStock.error} />
            <button className="btn" disabled={m.adjustStock.isPending || !Number(delta)} onClick={() => m.adjustStock.mutate({ variantId: v.id, body: { delta: Number(delta), reason } }, { onSuccess: () => { setEditing(null); setDelta(''); } })}>
              Apply
            </button>
          </Dialog>
        )}
      </td>
    </tr>
  );
}

export default function SellerProductPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, error } = useSellerProduct(id);
  const { data: cats } = useCategories();
  const m = useProductMutations(id);

  if (isLoading) return <Loading />;
  if (!p) return <ErrorNote error={error} />;
  const category = cats?.items.find((c) => c.id === p.categoryId);
  const locked = p.status === 'archived';

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/seller/products">← Products</Link>
          </p>
          <h1>
            {p.name} <StatusChip map={productStatus} value={p.status} />
          </h1>
          <p>{category?.name}</p>
        </div>
        <div className="row">
          {p.status === 'active' && (
            <Link href={`/products/${p.id}`} className="btn ghost">
              View in shop ↗
            </Link>
          )}
          {p.status === 'draft' && (
            <button className="btn gold" disabled={m.publish.isPending} onClick={() => m.publish.mutate()}>
              Publish
            </button>
          )}
          {!locked && (
            <button className="btn danger" disabled={m.archive.isPending} onClick={() => confirm('Archive this product? It disappears from the shop; past orders keep their copy.') && m.archive.mutate()}>
              Archive
            </button>
          )}
        </div>
      </div>
      <ErrorNote error={m.publish.error ?? m.archive.error ?? m.updateVariant.error} />
      <section className="card stack">
        <h2>Variants &amp; stock</h2>
        {p.variants.length === 0 ? (
          <p className="muted small">No variants yet. Add one below — each has its own price, SKU and stock.</p>
        ) : (
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Options</th>
                  <th>SKU</th>
                  <th>Price</th>
                  <th>On hand</th>
                  <th>Reserved</th>
                  <th>Available</th>
                  <th>Sale</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.variants.map((v) => (
                  <VariantRow key={v.id} v={v} m={m} locked={locked} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!locked && <AddVariant p={p} m={m} schema={category?.variantSchema ?? {}} />}
      </section>
      <Details key={p.updatedAt} p={p} m={m} />
    </div>
  );
}
