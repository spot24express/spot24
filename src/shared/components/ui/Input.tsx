import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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

/** Ojito: muestra/oculta la clave. Estilo feather, trazo fino como los iconos de la barra. */
function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {off ? (
        <>
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </>
      ) : (
        <>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, id: idProp, type, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';

  const control = (
    <input
      ref={ref}
      id={label ? id : undefined}
      type={isPassword && showPassword ? 'text' : type}
      aria-invalid={error ? true : undefined}
      required={required}
      className={`${BASE_CONTROL} ${isPassword ? 'pr-12' : ''} ${error ? 'border-signal' : ''}`}
      {...rest}
    />
  );

  if (!isPassword) {
    if (!label) return control;
    return (
      <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
        {control}
      </FieldShell>
    );
  }

  // Campo de clave: el ojito vive dentro, con área táctil de 48px.
  const field = (
    <div className="relative">
      {control}
      <button
        type="button"
        onClick={() => setShowPassword((v) => !v)}
        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={showPassword}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted transition-colors hover:text-paper focus:text-signal focus:outline-none"
      >
        <EyeIcon off={showPassword} />
      </button>
    </div>
  );
  if (!label) return field;
  return (
    <FieldShell id={id} label={label} error={error} hint={hint} required={required}>
      {field}
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