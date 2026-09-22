import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger-ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

const VARIANTS: Record<ButtonVariant, string> = {
  // CTA rojo: Saira itálica MAYÚSCULAS — solo para acciones clave (10% rojo).
  primary:
    'bg-signal text-paper font-display font-bold italic uppercase tracking-wide hover:bg-[#d80801] active:translate-y-px disabled:bg-[#5a0f0c] disabled:text-paper/50',
  secondary:
    'border-2 border-paper bg-transparent text-paper font-display font-semibold italic uppercase tracking-wide hover:bg-paper hover:text-ink active:translate-y-px disabled:opacity-40',
  ghost:
    'bg-transparent text-paper font-body font-semibold hover:bg-surface-2 active:translate-y-px disabled:opacity-40',
  'danger-ghost':
    'bg-transparent text-signal font-body font-semibold hover:bg-signal/10 active:translate-y-px disabled:opacity-40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'px-3.5 py-1.5 text-sm rounded-brand min-h-[40px]',
  md: 'px-5 py-2.5 text-base rounded-brand min-h-[44px]',
  lg: 'px-7 py-3.5 text-lg rounded-brand-lg min-h-[52px]',
};

/**
 * Botón base SPOT 24. Toque mínimo 44 px (WCAG 2.1 AA). La voz es corta y
 * afirmativa: "Pagar", "Seguir", "Reintentar".
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, fullWidth = false, className = '', disabled, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
