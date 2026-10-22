/**
 * Helpers de tiempo puros (ronda 5.92e) — sin dependencias de Firebase.
 *
 * BUG que motiva esta ronda: `createdAt` puede vivir en Firestore como
 * Timestamp (lo escribe `serverTimestamp()`, que usan el importador de
 * inventario y el panel de admin) o como número epoch-ms (`Date.now()`,
 * usado en updatedAt de varias escrituras). El cursor de paginación del
 * catálogo y el mapper de productos asumían número: con Timestamp,
 * `Number(timestamp)` da NaN → el cursor no decodificaba → la página 2
 * volvía a pedir la página 1 → React: «Encountered two children with the
 * same key» y «Cargar más» infinito. Con 72 productos importados en UN solo
 * lote (todos con el mismo timestamp) el caso era 100% reproducible.
 */

/**
 * Normaliza cualquier valor de fecha de Firestore a epoch-ms:
 * número · string numérico · Date · Timestamp de Firestore (con toMillis()
 * o con {seconds, nanoseconds}). Todo lo desconocido → 0 (jamás NaN).
 */
export function aMillis(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'string') {
    if (v.trim() === '') return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
    // Timestamp real del SDK de Firebase (y cualquier objeto con toMillis()).
    if (typeof o.toMillis === 'function') {
      try {
        const t = (o.toMillis as () => number).call(o);
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    }
    // Timestamp "pelado" (JSON plano: {seconds, nanoseconds}) — como llega
    // desde backups JSON o de Firestore Admin serializado.
    const s = Number(o.seconds);
    if (Number.isFinite(s)) {
      const ns = Number(o.nanoseconds ?? 0);
      return Math.round(s * 1000 + (Number.isFinite(ns) ? ns : 0) / 1e6);
    }
  }
  return 0;
}

/**
 * Quita elementos repetidos por `id` conservando el orden y la PRIMERA
 * aparición. Cinturón de seguridad de la paginación infinita del catálogo:
 * aunque un cursor vuelva a repetir una página, las tarjetas nunca se
 * renderizan dos veces (adiós «duplicate key» de React).
 */
export function dedupePorId<T extends { id: string }>(items: readonly T[]): T[] {
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    if (vistos.has(it.id)) continue;
    vistos.add(it.id);
    out.push(it);
  }
  return out;
}
