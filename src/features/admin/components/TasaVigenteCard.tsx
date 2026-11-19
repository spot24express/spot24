import { useBcvRate } from '@/shared/hooks/useBcvRate';
import { rateText, fmtFechaValor } from '@/shared/lib/format';

/**
 * 5.155 · Tasa vigente COMPACTA en la cabecera del panel (pedido del dueño:
 * «me gustaría que también los roles admin, gerente y cajero vieran la tasa
 * vigente»). Mientras la tasa solo vivía en Métricas, el cajero —que no entra
 * a esa sección— cobraba sin verla; ahora la tarjeta viaja en la cabecera de
 * TODAS las secciones del panel para admin, gerente y cajero (VER_TASA).
 *
 * Lee el MISMO doc rates/bcv por el hook compartido useBcvRate (una sola
 * conexión Firestore para toda la app, patrón vigía): cuando el cron horario
 * escribe, esta tarjeta repinta sola. Mientras llega el primer snapshot
 * muestra «—» (milisegundos: la tasa queda en cache).
 *
 * La tarjeta COMPLETA (vigía del cron, «Leer BCV ahora», tasa pendiente)
 * sigue SOLO en Métricas, para admin y gerente.
 */
export function TasaVigenteCard() {
  const rate = useBcvRate();
  return (
    <div className="rounded-brand-lg border-2 border-line bg-surface-1 px-5 py-3 text-right">
      <p className="spot-label">Tasa vigente (Bs por USD)</p>
      <p className="mt-0.5 font-display text-3xl font-black italic uppercase text-signal">
        {rate ? rateText(rate.rate) : '—'}
      </p>
      <p className="mt-0.5 spot-label">Fecha valor: {rate ? fmtFechaValor(rate.fechaValor) : '—'}</p>
    </div>
  );
}
