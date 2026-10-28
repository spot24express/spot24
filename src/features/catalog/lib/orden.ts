/**
 * 5.111 · Ordenar por precio (estilo de la app de farmacia de referencia, aprobado por el dueño).
 * Lógica PURA (testeable en node). El orden es de CLIENTE: se recalcula sobre
 * las tarjetas YA CARGADAS, sin cambiar la consulta de Firestore — ni índices
 * compuestos nuevos, ni lecturas extra. La paginación por cursor sigue siendo
 * por createdAt: al pulsar «Cargar más» la lista crece y el orden se
 * recalcula solo sobre el total cargado (con el catálogo completo en pantalla
 * el orden queda global).
 */
import type { Product } from '../types';

/** 'asc' = menor precio primero · 'desc' = mayor precio · null = recientes. */
export type TipoOrden = 'asc' | 'desc' | null;

/** true si el valor del parámetro URL ?orden= es válido (si no, recientes). */
export function esOrdenValida(v: string | null): v is 'asc' | 'desc' {
  return v === 'asc' || v === 'desc';
}

/**
 * Lista ordenada por basePriceUsd. `null` → la lista tal cual (el orden de
 * siempre: más recientes primero, como llega de Firestore). Desempate de
 * precio → createdAt descendente (los recientes arriba). sort() es estable en
 * JS moderno: sin orden, el orden relativo de la lista sobrevive intacto.
 */
export function ordenarPorPrecio(items: Product[], orden: TipoOrden): Product[] {
  if (orden !== 'asc' && orden !== 'desc') return items;
  const dir = orden === 'asc' ? 1 : -1;
  return [...items].sort(
    (a, b) => (a.basePriceUsd - b.basePriceUsd) * dir || b.createdAt - a.createdAt,
  );
}