import { formatBs, usdToBs } from '@/shared/lib/format';
import { useBcvRate } from '@/shared/hooks/useBcvRate';

interface PriceTagProps {
  usd: number;
  /** Monto en Bs ya calculado por el backend; omitido → convierte con la tasa en vivo. */
  ves?: number | null;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Ronda 3 — SOLO bolívares para el cliente: nada de montos en USD en la
 * tienda. Los precios de catálogo viven en USD en la base de datos (referencia
 * interna), pero la presentación convierte con la tasa BCV en vivo; si el
 * backend ya entregó el monto en Bs (checkout/órdenes) se usa tal cual.
 * Mientras llega la tasa muestra «Bs. —» (milisegundos: la tasa queda en cache).
 */
export function PriceTag({ usd, ves = null, size = 'md' }: PriceTagProps) {
  const rate = useBcvRate();
  const main = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-2xl';
  const bs = ves ?? (rate ? usdToBs(usd, rate.rate) : null);
  return (
    <div className="leading-tight">
      <span className={`font-display font-extrabold italic text-signal ${main}`}>
        {bs !== null ? formatBs(bs) : 'Bs. —'}
      </span>
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
      Disponible
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
