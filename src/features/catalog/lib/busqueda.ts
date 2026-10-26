/**
 * SPOT 24 · 5.95 · Búsqueda de verdad: nombre, varias palabras y CÓDIGO.
 *
 * Pedido del dueño: en la tienda se debe encontrar CUALQUIER producto — por
 * nombre, por varias palabras y POR CÓDIGO (los trabajadores y el admin buscan
 * «ES800033» o «RK641395»); sin anunciar nada al cliente: la barra se ve igual.
 *
 * Por qué no bastaba el mecanismo anterior (searchTerms array-contains):
 *  · El código NO vive en searchTerms (solo palabras del nombre): buscar un
 *    código devolvía SIEMPRE cero resultados.
 *  · Varias palabras («terminal aveo») nunca casan: array-contains exige el
 *    término COMPLETO como UN token exacto del arreglo.
 *
 * Estrategia (sin índices nuevos y sin tocar datos):
 *  · CÓDIGO → consulta de prefijo `code >= T && code <= T+\uf8ff`: usa el
 *    índice automático de un campo (un orderBy en otro campo exigiría un
 *    índice compuesto que no existe — el orden se resuelve en código).
 *  · NOMBRE → el token MÁS LARGO manda como ancla del array-contains y el
 *    resto de las palabras se exige en código dentro de la página leída. La
 *    paginación queda correcta: el índice entrega TODOS los documentos que
 *    contienen el ancla, en orden; el filtro en código solo oculta los que no
 *    cumplen las demás palabras (la página puede venir algo más vacía, jamás
 *    con huecos ni repetidos).
 *
 * Todo puro y sin dependencias de Firebase para poder probarlo en vitest.
 */

import type { Product, CatalogQuery } from '../types';

/** Quita acentos y baja a minúsculas (igual que normalizeSearchTerm). */
export function sinAcentos(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Palabras del término ya normalizado (sin acentos, separadas por espacio). */
export function tokensDe(q: string): string[] {
  return sinAcentos(q).trim().split(/\s+/).filter(Boolean);
}

/**
 * Ancla del array-contains: el token más LARGO con 3+ letras (los tokens de
 * searchTerms son palabras de 3+ caracteres). null si ninguna palabra llega a
 * 3 — entonces la búsqueda por nombre no puede aportar nada.
 */
export function anclaDe(q: string): string | null {
  const validos = tokensDe(q).filter((t) => t.length >= 3);
  if (!validos.length) return null;
  return validos.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * ¿El producto cumple TODAS las palabras de la búsqueda? (la del ancla viene
 * garantizada por el índice; aquí se exigen las demás). Se busca como subcadena
 * del nombre, marca, código, términos y slug — sin acentos.
 */
export function pasaTodosLosTokens(p: Product, tokens: string[]): boolean {
  const paja = sinAcentos(
    `${p.name} ${p.brand} ${p.code ?? ''} ${p.searchTerms.join(' ')} ${p.slug}`,
  );
  return tokens.every((t) => t.length < 3 || paja.includes(t));
}

/**
 * Términos de código a probar, en orden: tal cual (respeta guiones, porque el
 * código guardado puede traerlos) y «pelado» (solo letras y números, para
 * «es-800033» escrito sin el guion). Menos de 2 caracteres → nada que buscar.
 */
export function terminosDeCodigo(q: string): string[] {
  const base = q.trim().toUpperCase().replace(/\s+/g, ' ');
  if (base.length < 2) return [];
  const pelado = base.replace(/[^A-Z0-9]/g, '');
  if (pelado.length >= 2 && pelado !== base) return [base, pelado];
  return [base];
}

/**
 * Filtros del catálogo aplicados en código (para los resultados por código,
 * que llegan de una consulta SIN orderBy y sin cláusulas combinadas).
 */
export function pasaFiltros(p: Product, f: CatalogQuery): boolean {
  if (f.categoryIds?.length) {
    if (!f.categoryIds.includes(p.categoryId)) return false;
  } else if (f.categoryId && p.categoryId !== f.categoryId) {
    return false;
  }
  if (f.inStockOnly && p.stockTotal <= 0) return false;
  if (f.minPriceUsd !== undefined && p.basePriceUsd < f.minPriceUsd) return false;
  if (f.maxPriceUsd !== undefined && p.basePriceUsd > f.maxPriceUsd) return false;
  return true;
}
