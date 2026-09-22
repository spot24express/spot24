import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const BASE_CONTROL =
  'w-full rounded-brand border-2 bg-surface-1 px-4 py-3 text-paper text-body-base placeholder:text-muted/60 border-line focus:border-signal focus:outline-none disabled:opacity-50 min-h-[48px]';

interface FieldShellProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

/** Label mayúscula con interletrado ampliado + mensaje de error accesible. */
function FieldShell({ id, label, error, hint, required, children }: FieldShellProps) {
  return (
    <div className="w-full">
      <label htmlFor={id} className="mb-1.5 block">
        {label}
        {required && <span className="text-signal" aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-sm text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="mt-1 text-sm font-semibold text-signal">
          {error}
        </p>
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const control = (
    <input
      ref={ref}
      id={label ? id : undefined}
      aria-invalid={error ? true : undefined}
      required={required}
      className={`${BASE_CONTROL} ${error ? 'border-signal' : ''}`}
      {...rest}
    />
  );
  if (!label) return control;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      {control}
    </FieldShell>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, hint, required, rows = 3, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const control = (
    <textarea
      ref={ref}
      id={label ? id : undefined}
      rows={rows}
      aria-invalid={error ? true : undefined}
      required={required}
      className={`${BASE_CONTROL} min-h-[96px] resize-y ${error ? 'border-signal' : ''}`}
      {...rest}
    />
  );
  if (!label) return control;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      {control}
    </FieldShell>
  );
});

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, required, children, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const control = (
    <select
      ref={ref}
      id={label ? id : undefined}
      aria-invalid={error ? true : undefined}
      required={required}
      className={`${BASE_CONTROL} appearance-none ${error ? 'border-signal' : ''}`}
      {...rest}
    >
      {children}
    </select>
  );
  if (!label) return control;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      {control}
    </FieldShell>
  );
});
