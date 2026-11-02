'use client';

import { useId } from 'react';

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  errors?: string[];
  hint?: string;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  placeholder?: string;
  multiline?: boolean;
  after?: React.ReactNode;
}) {
  const id = useId();
  const errors = props.errors ?? [];
  const describedBy = [props.hint && `${id}-hint`, errors.length && `${id}-err`].filter(Boolean).join(' ') || undefined;
  const common = {
    id,
    className: `input${errors.length ? ' err' : ''}`,
    value: props.value,
    placeholder: props.placeholder,
    'aria-invalid': errors.length > 0,
    'aria-describedby': describedBy,
  };
  return (
    <div className="field">
      <label className="lbl" htmlFor={id}>
        {props.label}
      </label>
      {props.multiline ? (
        <textarea {...common} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input
          {...common}
          type={props.type ?? 'text'}
          autoComplete={props.autoComplete}
          inputMode={props.inputMode}
          onChange={(e) => props.onChange(e.target.value)}
        />
      )}
      {props.hint && (
        <p className="hint" id={`${id}-hint`}>
          {props.hint}
        </p>
      )}
      {errors.length > 0 && (
        <div id={`${id}-err`}>
          {errors.map((e) => (
            <p className="errmsg" key={e}>
              {e}
            </p>
          ))}
        </div>
      )}
      {props.after}
    </div>
  );
}

/** Lists every problem beside the submit button, so a failed submit is never silent. */
export function ProblemSummary({ title, problems }: { title: string; problems: string[] }) {
  if (!problems.length) return null;
  return (
    <div className="note bad" role="alert">
      <strong>{title}</strong>
      <ul>
        {problems.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
