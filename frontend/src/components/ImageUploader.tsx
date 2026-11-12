'use client';

import { useUpload } from '@/features/seller';
import { ErrorNote, ProductImage } from './ui';

export function ImageUploader({ images, onChange, label = 'Images' }: { images: string[]; onChange: (v: string[]) => void; label?: string }) {
  const upload = useUpload();
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row">
        {images.map((src) => (
          <div key={src} className="stack" style={{ gap: 2, alignItems: 'center' }}>
            <ProductImage src={src} name="" />
            <button type="button" className="linkbtn danger" style={{ fontSize: 12 }} onClick={() => onChange(images.filter((i) => i !== src))}>
              Remove
            </button>
          </div>
        ))}
        <label className="btn ghost small" style={{ cursor: upload.isPending ? 'wait' : 'pointer' }}>
          {upload.isPending ? 'Uploading…' : '+ Upload'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr"
            disabled={upload.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) upload.mutate(file, { onSuccess: (r) => onChange([...images, r.url]) });
            }}
          />
        </label>
      </div>
      <span className="hint">JPEG, PNG or WebP, up to 5 MB.</span>
      <ErrorNote error={upload.error} />
    </div>
  );
}
