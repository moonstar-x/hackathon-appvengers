import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export function TextField({
  label,
  error,
  help,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; help?: string }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <div className="field">
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        aria-describedby={(error ?? help) ? fieldId + '-help' : undefined}
        {...props}
      />
      {(error ?? help) && (
        <small id={fieldId + '-help'} className={error ? 'field-error' : 'muted'}>
          {error ?? help}
        </small>
      )}
    </div>
  );
}
export function Checkbox({
  children,
  id,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { children: ReactNode }) {
  const generated = useId();
  const fieldId = id ?? generated;
  return (
    <label className="checkbox" htmlFor={fieldId}>
      <input id={fieldId} type="checkbox" {...props} />
      <span>{children}</span>
    </label>
  );
}
