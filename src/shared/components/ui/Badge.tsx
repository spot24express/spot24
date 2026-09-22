import type { OrderStatus } from '@/shared/constants/orders';
import { STATUS_LABELS } from '@/shared/constants/orders';

const STATUS_STYLES: Record<OrderStatus, string> = {
  // Rojo SOLO para estados activos (sección 2.1: el rojo señala).
  pendiente: 'border-paper/40 text-paper',
  en_verificacion: 'border-signal text-signal',
  pagado: 'border-paper text-paper bg-surface-2',
  preparado: 'border-paper text-paper bg-surface-3',
  en_camino: 'border-signal text-signal bg-signal/10',
  entregado: 'border-paper/60 text-paper/90',
  cancelado: 'border-line text-muted line-through',
};

export function StatusBadge({ status, className = '' }: { status: OrderStatus; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-brand border-2 px-3 py-1 font-display text-sm font-bold italic uppercase tracking-wide ${STATUS_STYLES[status]} ${className}`}
      data-status={status}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

export function Chip({
  active = false,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`inline-flex min-h-[40px] items-center rounded-brand border-2 px-4 py-1.5 font-body text-sm font-semibold transition-colors ${
        active
          ? 'border-signal bg-signal/10 text-signal'
          : 'border-line bg-transparent text-paper hover:border-line-strong'
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}
