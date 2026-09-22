import { formatBs, formatUsd } from '@/shared/lib/format';

interface PriceTagProps {
  usd: number;
  /** Monto en Bs ya calculado por el backend; omitido → solo USD. */
  ves?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Precio dual USD/Bs. El precio va en rojo (señal) y en Saira itálica;
 * el equivalente en Bs es siempre referencial si no viene del backend.
 */
export function PriceTag({ usd, ves = null, size = 'md' }: PriceTagProps) {
  const main = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  const sub = size === 'lg' ? 'text-lg' : 'text-sm';
  return (
    <div className="leading-tight">
      <span className={`font-display font-extrabold italic text-signal ${main}`}>
        {formatUsd(usd)}
      </span>
      {ves !== null && (
        <span className={`ml-2 font-body font-medium text-muted ${sub}`}>
          {formatBs(ves)}
        </span>
      )}
    </div>
  );
}

interface StockBadgeProps {
  stock: number;
  /** umbral para marcar "últimas unidades" */
  lowThreshold?: number;
}

export function StockBadge({ stock, lowThreshold = 5 }: StockBadgeProps) {
  if (stock <= 0) {
    return (
      <span className="inline-flex items-center rounded-brand border-2 border-line px-2.5 py-1 spot-label text-muted">
        Sin stock
      </span>
    );
  }
  if (stock <= lowThreshold) {
    return (
      <span className="inline-flex items-center rounded-brand border-2 border-signal bg-signal/10 px-2.5 py-1 text-xs font-semibold uppercase tracking-label text-signal">
        Últimas {stock}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-brand border-2 border-line px-2.5 py-1 spot-label text-paper/80">
      En stock
    </span>
  );
}

/** Cifra grande estilo pit stop (Saira 900 itálica). */
export function BigFigure({ children, tone = 'paper' }: { children: React.ReactNode; tone?: 'paper' | 'signal' }) {
  return (
    <span className={`font-display text-4xl font-black italic uppercase ${tone === 'signal' ? 'text-signal' : 'text-paper'}`}>
      {children}
    </span>
  );
}
