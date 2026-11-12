'use client';
/** Small presentational building blocks. No data fetching or business rules here. */
import { useEffect, useRef, type ReactNode } from 'react';
import { ApiError } from '@/lib/api/client';
import { rupees, type Tone } from '@/features/format';

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`chip ${tone === 'neutral' ? '' : tone}`}>{children}</span>;
}

export function StatusChip<K extends string>({ map, value }: { map: Record<K, [string, Tone]>; value: K }) {
  const [label, tone] = map[value] ?? [value, 'neutral'];
  return <Chip tone={tone}>{label}</Chip>;
}

export function Money({ paisa, className }: { paisa: number; className?: string }) {
  return <span className={className}>{rupees(paisa)}</span>;
}

/** The API's message for an error, or a fallback. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}

export function fieldError(e: unknown, field: string): string | undefined {
  return e instanceof ApiError ? e.fieldErrors[field]?.[0] : undefined;
}

export function hasFieldErrors(e: unknown): boolean {
  return e instanceof ApiError && Object.keys(e.fieldErrors).length > 0;
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div className="note bad" role="alert">
      {errorText(error)}
    </div>
  );
}

export function Field({
  label,
  id,
  error,
  hint,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <span className="errmsg" id={`${id}-err`}>
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </div>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="muted" role="status" style={{ padding: '24px 0' }}>
      {label}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3 style={{ color: 'var(--ink)' }}>{title}</h3>
      {children}
    </div>
  );
}

export function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function ProductImage({ src, name, className = 'thumb' }: { src?: string | null; name: string; className?: string }) {
  return (
    <div className={className} aria-hidden={!src}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt={name} /> : <span>{name.slice(0, 1).toUpperCase()}</span>}
    </div>
  );
}

export function Qty({
  value,
  max,
  onChange,
  disabled,
  label,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="qty" role="group" aria-label={label}>
      <button type="button" aria-label="Decrease" disabled={disabled || value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <span aria-live="polite">{value}</span>
      <button type="button" aria-label="Increase" disabled={disabled || value >= max} onClick={() => onChange(value + 1)}>
        +
      </button>
    </div>
  );
}
