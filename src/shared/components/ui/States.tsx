import { SpeedLines } from '@/shared/components/brand/Logo';
import { Button } from './Button';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';

interface EmptyStateProps {
  title: string;
  message?: string;
  action?: { label: string; onClick: () => void };
}

/** Estado vacío con la voz de marca y las líneas de velocidad. */
export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-brand-lg border-2 border-dashed border-line px-6 py-14 text-center">
      <SpeedLines className="mb-5" />
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">{title}</h2>
      {message && <p className="mt-2 max-w-sm text-body-base text-muted">{message}</p>}
      {action && (
        <Button className="mt-6" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface ErrorStateProps {
  onRetry?: () => void;
  message?: string;
}

/** Estado de error genérico (sin detalle técnico) con reintento. */
export function ErrorState({ onRetry, message = 'No salió. Reintenta y seguimos.' }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center rounded-brand-lg border-2 border-signal/40 bg-signal/5 px-6 py-12 text-center">
      <h2 className="font-display text-xl font-bold italic uppercase text-signal">Error</h2>
      <p className="mt-2 max-w-sm text-body-base text-paper">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-6" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** Banner fijo cuando no hay conexión (el carrito y catálogo siguen offline). */
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 bg-signal py-2 text-center font-body text-sm font-semibold uppercase tracking-label text-paper">
      Sin conexión — lo que ya viste sigue disponible
    </div>
  );
}
