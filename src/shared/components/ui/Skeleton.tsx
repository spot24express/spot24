import { SpeedLines } from '@/shared/components/brand/Logo';

/**
 * Skeleton de marca: barras angulares con barrido de las líneas de velocidad.
 * Usado en todos los estados de carga (sección 8.3).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-brand bg-surface-2 ${className}`} aria-hidden="true">
      <div className="absolute inset-y-0 w-1/3 animate-speed-sweep bg-gradient-to-r from-transparent via-surface-3 to-transparent" />
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-4">
      <Skeleton className="mb-4 aspect-square w-full" />
      <SpeedLines className="mb-3" tone="muted" />
      <Skeleton className="mb-2 h-5 w-3/4" />
      <Skeleton className="h-6 w-1/2" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

/** Skeleton de ruta completa con líneas de velocidad (fallback de Suspense). */
export function RouteSkeleton() {
  return (
    <div className="spot-container py-10" role="status" aria-label="Cargando">
      <SpeedLines animated className="mb-6" />
      <Skeleton className="mb-4 h-10 w-2/3 max-w-md" />
      <Skeleton className="mb-8 h-6 w-1/3 max-w-xs" />
      <ProductGridSkeleton />
    </div>
  );
}

/** Pantalla de carga de arranque: escudo + líneas de velocidad. */
export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex min-h-dvh flex-col items-center justify-center bg-ink" role="status" aria-label="Cargando SPOT 24">
      <SpeedLines animated className="mb-6 scale-125" />
      <p className="font-display text-2xl font-extrabold italic uppercase text-paper">
        SPOT <span className="text-signal">24</span>
      </p>
      <p className="mt-2 spot-label">Tu parada segura. 24/7.</p>
    </div>
  );
}
