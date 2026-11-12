'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImageUploader } from '@/components/ImageUploader';
import { ErrorNote, Field, fieldError } from '@/components/ui';
import { useCreateProduct } from '@/features/seller';
import { useCategories } from '@/features/shopping';

export default function NewProduct() {
  const router = useRouter();
  const { data: cats } = useCategories();
  const create = useCreateProduct();
  const [f, setF] = useState({ categoryId: '', name: '', description: '', optionNames: [] as string[], images: [] as string[] });
  const category = cats?.items.find((c) => c.id === f.categoryId);
  const err = (k: string) => fieldError(create.error, k);

  return (
    <div className="stack-lg" style={{ maxWidth: 760 }}>
      <div className="page-head">
        <div>
          <h1>New product</h1>
          <p>It starts as a draft. Add at least one variant, then publish.</p>
        </div>
        <Link href="/seller/products">Cancel</Link>
      </div>
      <form
        className="card stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate(f, { onSuccess: (p) => router.push(`/seller/products/${p.id}?new=1`) });
        }}
      >
        <ErrorNote error={create.error} />
        <Field label="Category" id="cat" error={err('categoryId')}>
          <select id="cat" className="input" required value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value, optionNames: [] })}>
            <option value="">Choose a category</option>
            {cats?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Name" id="name" error={err('name')}>
          <input id="name" className="input" required minLength={2} maxLength={120} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Description" id="desc" error={err('description')}>
          <textarea id="desc" className="input" maxLength={5000} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
        {category && Object.keys(category.variantSchema).length > 0 && (
          <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="label">Options this product comes in</legend>
            <span className="hint" style={{ marginBottom: 6 }}>
              Values come from the category, so filters work the same across shops. You can&apos;t change options after adding variants.
            </span>
            {Object.entries(category.variantSchema).map(([name, values]) => (
              <label key={name} className="check">
                <input
                  type="checkbox"
                  checked={f.optionNames.includes(name)}
                  onChange={(e) =>
                    setF({ ...f, optionNames: e.target.checked ? [...f.optionNames, name] : f.optionNames.filter((n) => n !== name) })
                  }
                />
                <span style={{ textTransform: 'capitalize' }}>{name}</span>
                <span className="small muted">({values.join(', ')})</span>
              </label>
            ))}
            {err('optionNames') && <span className="errmsg">{err('optionNames')}</span>}
          </fieldset>
        )}
        <ImageUploader images={f.images} onChange={(images) => setF({ ...f, images })} />
        <div>
          <button className="btn gold" disabled={create.isPending}>
            {create.isPending ? 'Creating…' : 'Create draft'}
          </button>
        </div>
      </form>
    </div>
  );
}
