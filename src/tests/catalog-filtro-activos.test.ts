/**
 * Ronda 5.149 · Filtro de ACTIVOS en la consulta del listado público.
 * Hallazgo del dueño: las altas del importador «Solo stock» (5.137 — nacen
 * INACTIVAS, sin categoría y SIN precio, con createdAt de la importación)
 * quedan a la cabeza del orden createdAt desc. El filtro de activos EN CÓDIGO
 * descartaba esas páginas después de leerlas: «Recién llegados» del Home vacío
 * y «Cargar más» a ciegas en el catálogo.
 * La cura: where('active','==',true) en la consulta SOLO donde el índice
 * compuesto YA está desplegado (firestore.indexes.json 5.76/5.81):
 *   · active + createdAt                  → sin filtros
 *   · categoryId + active + createdAt     → por bahía (== y `in` de categoryIds)
 * Los combos sin índice (búsqueda q, stockTotal > 0, rangos de basePriceUsd)
 * se quedan como siempre: filtro en código (FAILED_PRECONDITION jamás).
 * Libra pura: src/features/catalog/lib/listado.ts — sin Firebase.
 */
import { describe, expect, it } from 'vitest';
import { consultaSoloActivos } from '../features/catalog/lib/listado';

describe('consultaSoloActivos · combos con índice YA desplegado', () => {
  it('listado sin filtros (Home «Recién llegados» y «Ver todo») → true', () => {
    expect(consultaSoloActivos({})).toBe(true);
  });

  it('por bahía categoryId → true (índice categoryId+active+createdAt)', () => {
    expect(consultaSoloActivos({ categoryId: 'bahia-a' })).toBe(true);
  });

  it('por rama categoryIds (soporte genérico `in`) → true', () => {
    expect(consultaSoloActivos({ categoryIds: ['a', 'b'] })).toBe(true);
  });
});

describe('consultaSoloActivos · combos SIN índice: filtro en código como siempre', () => {
  it('búsqueda q → false (searchTerms+createdAt no tiene active)', () => {
    expect(consultaSoloActivos({ q: 'amortiguador' })).toBe(false);
  });

  it('búsqueda con bahía → false (misma razón)', () => {
    expect(consultaSoloActivos({ q: 'filtro', categoryId: 'bahia-b' })).toBe(false);
  });

  it('solo disponibles (stock=1) → false', () => {
    expect(consultaSoloActivos({ inStockOnly: true })).toBe(false);
  });

  it('bahía + solo disponibles → false', () => {
    expect(consultaSoloActivos({ categoryId: 'bahia-a', inStockOnly: true })).toBe(false);
  });

  it('precio máximo → false', () => {
    expect(consultaSoloActivos({ maxPriceUsd: 50 })).toBe(false);
  });

  it('precio mínimo → false', () => {
    expect(consultaSoloActivos({ minPriceUsd: 1 })).toBe(false);
  });

  it('precio mínimo 0 también cuenta como filtro de precio → false', () => {
    expect(consultaSoloActivos({ minPriceUsd: 0 })).toBe(false);
  });

  it('precio máximo + solo disponibles → false', () => {
    expect(consultaSoloActivos({ maxPriceUsd: 20, inStockOnly: true })).toBe(false);
  });
});
