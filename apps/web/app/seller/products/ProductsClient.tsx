'use client';

import { useState } from 'react';
import { createProductSchema, productUpdateSchema } from '@mm/shared';
import { Field, ProblemSummary } from '@/components/Field';
import { api } from '@/lib/api';
import { fieldErrors, flatten } from '@/lib/validate';

export interface SellerProduct {
  id: string;
  name: string;
  sku: string;
  price: string;
  description: string;
  isActive: boolean;
  categoryId: string;
  onHand: number;
  reserved: number;
  available: number;
  stock: 'in_stock' | 'low' | 'out';
}

const blank = { name: '', sku: '', price: '', description: '', categoryId: '', isActive: true, initialStock: '0' };

export function ProductsClient(props: { products: SellerProduct[]; categories: { id: string; name: string }[]; live: boolean }) {
  const [products, setProducts] = useState(props.products);
  const [selectedId, setSelectedId] = useState<string | null>(props.products[0]?.id ?? null);
  const creating = selectedId === null;
  const current = products.find((p) => p.id === selectedId) ?? null;
  const [draft, setDraft] = useState(() => (current ? toDraft(current) : { ...blank, categoryId: props.categories[0]?.id ?? '' }));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [toast, setToast] = useState('');
  const [delta, setDelta] = useState('');
  const [stockError, setStockError] = useState('');

  function toDraft(p: SellerProduct) {
    return {
      name: p.name,
      sku: p.sku,
      price: p.price,
      description: p.description,
      categoryId: p.categoryId,
      isActive: p.isActive,
      initialStock: '0',
    };
  }
  function pick(p: SellerProduct | null) {
    setSelectedId(p?.id ?? null);
    setDraft(p ? toDraft(p) : { ...blank, categoryId: props.categories[0]?.id ?? '' });
    setErrors({});
    setToast('');
    setDelta('');
    setStockError('');
  }
  const set = (k: keyof typeof draft) => (v: string | boolean) => setDraft((d) => ({ ...d, [k]: v }));

  async function save() {
    const body = { ...draft, initialStock: creating ? Number(draft.initialStock || 0) : undefined };
    const local = fieldErrors(creating ? createProductSchema : productUpdateSchema, body);
    setErrors(local);
    if (Object.keys(local).length) return;
    const res = creating
      ? await api<SellerProduct>('/seller/products', { body })
      : await api<SellerProduct>(`/seller/products/${selectedId}`, { method: 'PATCH', body: { ...body, initialStock: undefined } });
    if (!res.ok) return setErrors(Object.keys(res.problem.fieldErrors).length ? res.problem.fieldErrors : { _: [res.problem.message] });
    setProducts((list) => (creating ? [res.data, ...list] : list.map((p) => (p.id === res.data.id ? res.data : p))));
    setSelectedId(res.data.id);
    setDraft(toDraft(res.data));
    setToast(
      !props.live
        ? 'Draft saved. It goes live once your shop is approved.'
        : creating
          ? 'Product created. Active products appear in the catalogue straight away.'
          : 'Changes saved.',
    );
  }

  async function adjust() {
    setStockError('');
    const n = Number(delta);
    if (!Number.isInteger(n) || n === 0) return setStockError('Enter a whole number other than zero, like 20 or -2.');
    const res = await api<SellerProduct>(`/seller/products/${selectedId}/stock`, {
      body: { delta: n, reason: n > 0 ? 'restock' : 'adjust' },
    });
    if (!res.ok) return setStockError(res.problem.fieldErrors.delta?.[0] ?? res.problem.message);
    setProducts((list) => list.map((p) => (p.id === res.data.id ? res.data : p)));
    setDelta('');
    setToast(`Stock updated. ${res.data.available} available.`);
  }

  return (
    <div className="seller-layout">
      <section className="panel">
        <div className="row">
          <h2>Your products</h2>
          <button className="btn small" style={{ width: 'auto' }} onClick={() => pick(null)}>
            + New product
          </button>
        </div>
        {!products.length && <p className="hint">No products yet. Add your first one.</p>}
        <table className="table">
          <thead>
            <tr>
              <th>Product</th>
              <th>Price</th>
              <th>Available</th>
              <th>Reserved</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={p.id === selectedId ? 'sel' : ''} onClick={() => pick(p)}>
                <td>
                  <button className="link-btn" onClick={() => pick(p)}>
                    {p.name}
                  </button>
                  <div className="mono hint">{p.sku}</div>
                </td>
                <td>${p.price}</td>
                <td>{p.available}</td>
                <td>{p.reserved}</td>
                <td>
                  <span className={`chip ${!p.isActive ? '' : p.stock === 'out' ? 'bad' : p.stock === 'low' ? '' : 'ok'}`}>
                    {!p.isActive ? 'Inactive' : p.stock === 'out' ? 'Out of stock' : p.stock === 'low' ? 'Low stock' : 'Active'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <aside className="panel" aria-label={creating ? 'New product' : 'Edit product'}>
        <h2>{creating ? 'New product' : 'Edit product'}</h2>
        {toast && (
          <p className="note ok" role="status">
            {toast}
          </p>
        )}
        <Field label="Name" value={draft.name} onChange={set('name')} errors={errors.name} />
        <Field label="SKU" value={draft.sku} onChange={set('sku')} errors={errors.sku} hint="Unique across the marketplace." />
        <div className="field">
          <label className="lbl" htmlFor="cat">
            Category
          </label>
          <select id="cat" className="input" value={draft.categoryId} onChange={(e) => set('categoryId')(e.target.value)}>
            {props.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <Field
          label="Price (USD)"
          inputMode="decimal"
          value={draft.price}
          onChange={set('price')}
          errors={errors.price}
          hint="Changing the price won’t affect orders already placed."
        />
        <Field label="Description" multiline value={draft.description} onChange={set('description')} errors={errors.description} />
        <label className="check">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set('isActive')(e.target.checked)} />
          <span>Active (shown in the catalogue)</span>
        </label>
        {creating && (
          <Field
            label="Starting stock"
            inputMode="numeric"
            value={draft.initialStock}
            onChange={set('initialStock')}
            errors={errors.initialStock}
          />
        )}
        <ProblemSummary title="Not saved yet." problems={flatten(errors)} />
        <button className="btn" onClick={save}>
          {creating ? (props.live ? 'Create product' : 'Save draft') : 'Save changes'}
        </button>
        {current && (
          <fieldset className="stock-box">
            <legend>Adjust stock</legend>
            <p className="hint">
              Available {current.available} · Reserved {current.reserved} · On hand {current.onHand}
            </p>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input
                className={`input${stockError ? ' err' : ''}`}
                placeholder="+20 or -2"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
                aria-label="Stock change"
              />
              <button className="btn navy small" style={{ width: 'auto' }} onClick={adjust}>
                Apply
              </button>
            </div>
            {stockError && <p className="errmsg">{stockError}</p>}
          </fieldset>
        )}
      </aside>
    </div>
  );
}
