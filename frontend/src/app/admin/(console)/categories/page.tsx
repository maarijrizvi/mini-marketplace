'use client';

import { useState } from 'react';
import { Dialog, ErrorNote, Field, fieldError, Loading } from '@/components/ui';
import { useCategoryMutations } from '@/features/admin';
import { useCategories } from '@/features/shopping';
import type { Schemas } from '@/lib/api/client';

type Cat = Schemas['CategoryOut'];

const slugify = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "size: S, M, L" per line ⇄ {size: [S, M, L]} */
function schemaToText(schema: Record<string, string[]>) {
  return Object.entries(schema)
    .map(([k, v]) => `${k}: ${v.join(', ')}`)
    .join('\n');
}
function textToSchema(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const line of text.split('\n')) {
    const [name, values] = line.split(':');
    if (name?.trim() && values) out[name.trim()] = values.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return out;
}

function Editor({ cat, all, onClose }: { cat: Cat | null; all: Cat[]; onClose: () => void }) {
  const m = useCategoryMutations();
  const [name, setName] = useState(cat?.name ?? '');
  const [slug, setSlug] = useState(cat?.slug ?? '');
  const [parentId, setParentId] = useState(cat?.parentId ?? '');
  const [schema, setSchema] = useState(schemaToText(cat?.variantSchema ?? {}));
  const mutation = cat ? m.update : m.create;
  const save = () => {
    const body = { name, slug: slug || slugify(name), parentId: parentId || null, variantSchema: textToSchema(schema) };
    if (cat) m.update.mutate({ id: cat.id, body }, { onSuccess: onClose });
    else m.create.mutate(body, { onSuccess: onClose });
  };
  return (
    <Dialog title={cat ? `Edit ${cat.name}` : 'New category'} onClose={onClose}>
      <ErrorNote error={mutation.error} />
      <Field label="Name" id="cname">
        <input id="cname" className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Slug" id="cslug" error={fieldError(mutation.error, 'slug')} hint="Used in the shop's URL">
        <input id="cslug" className="input mono" placeholder={slugify(name)} value={slug} onChange={(e) => setSlug(e.target.value)} />
      </Field>
      <Field label="Parent" id="cparent">
        <select id="cparent" className="input" value={parentId} onChange={(e) => setParentId(e.target.value)}>
          <option value="">None (top level)</option>
          {all.filter((c) => c.id !== cat?.id && !c.parentId).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Allowed options" id="cschema" hint="One option per line, e.g. “size: S, M, L”. Values in use can't be removed.">
        <textarea id="cschema" className="input mono" value={schema} onChange={(e) => setSchema(e.target.value)} />
      </Field>
      <div className="row">
        <button className="btn" disabled={!name || mutation.isPending} onClick={save}>
          Save
        </button>
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Dialog>
  );
}

export default function Categories() {
  const { data, isLoading } = useCategories();
  const m = useCategoryMutations();
  const [editing, setEditing] = useState<Cat | 'new' | null>(null);
  const all = data?.items ?? [];
  const ordered = all.filter((c) => !c.parentId).flatMap((r) => [r, ...all.filter((c) => c.parentId === r.id)]);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Categories</h1>
          <p>Sellers pick one for each product. A category&apos;s options decide which sizes and colours its products can have.</p>
        </div>
        <button className="btn gold" onClick={() => setEditing('new')}>
          + Add category
        </button>
      </div>
      <ErrorNote error={m.remove.error} />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="card flush scroll-x">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Slug</th>
                <th>Allowed options</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ordered.map((c) => (
                <tr key={c.id}>
                  <td style={{ paddingLeft: c.parentId ? 34 : 14 }}>
                    <strong>{c.name}</strong>
                  </td>
                  <td className="mono">{c.slug}</td>
                  <td className="small">
                    {Object.entries(c.variantSchema).map(([k, v]) => (
                      <div key={k}>
                        <strong>{k}</strong>: {v.join(', ')}
                      </div>
                    ))}
                  </td>
                  <td>
                    <span className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                      <button className="linkbtn" onClick={() => setEditing(c)}>
                        Edit
                      </button>
                      <button className="linkbtn danger" onClick={() => confirm(`Delete ${c.name}?`) && m.remove.mutate(c.id)}>
                        Delete
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <Editor cat={editing === 'new' ? null : editing} all={all} onClose={() => setEditing(null)} />}
    </div>
  );
}
