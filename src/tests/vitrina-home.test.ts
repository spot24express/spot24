/**
 * Ronda 5.98 · Vitrina del Home que vende.
 * · D «Recién llegados» curado: máx 2 por bahía (se acabó el monotema de
 *   8 OLD MAN EMU de una sola importación). Ronda 5.103: si con el tope la
 *   vitrina no se llena (una sola importación grande), se RELLENA hasta 8 —
 *   la sección deja de quedar en 2 productos.
 * · C «Los más pedidos»: orden por vendidosTotal (empate → más nuevo), solo
 *   activos con ventas > 0 — con cero ventas la sección nace oculta.
 * · 5.107 «Recién llegados siempre lleno»: si la tanda de 24 trae menos de 8
 *   activos (productos sin publicar tapando la lista), el Home pide tandas
 *   extra (tope 3) — debeCargarMasPaginas decide, testado aquí.
 * Libra pura: src/features/catalog/lib/vitrina.ts (sin Firebase).
 */
import { describe, expect, it } from 'vitest';
import { curarRecientes, debeCargarMasPaginas, ordenarMasPedidos } from '../features/catalog/lib/vitrina';
import type { Product } from '../features/catalog/types';

function prod(id: string, partial: Partial<Product>): Product {
  return {
    id,
    slug: id,
    name: `PIEZA ${id}`,
    brand: '',
    description: '',
    categoryId: 'bahia-a',
    basePriceUsd: 10,
    images: [],
    searchTerms: [],
    stockTotal: 5,
    variantCount: 1,
    active: true,
    createdAt: 1729600000000,
    updatedAt: 1729600000000,
    ...partial,
  };
}

describe('curarRecientes (punto D)', () => {
  it('mezcla bahías con tope 2 y RELLENA hasta el máximo si quedan huecos (5.103)', () => {
    const recientes = [
      prod('a1', { categoryId: 'bahia-a', createdAt: 5 }),
      prod('a2', { categoryId: 'bahia-a', createdAt: 4 }),
      prod('a3', { categoryId: 'bahia-a', createdAt: 3 }),
      prod('b1', { categoryId: 'bahia-b', createdAt: 2 }),
      prod('b2', { categoryId: 'bahia-b', createdAt: 1 }),
      prod('b3', { categoryId: 'bahia-b', createdAt: 0 }),
    ];
    const out = curarRecientes(recientes, 8, 2);
    // Pasada 1: a1,a2,b1,b2 · relleno 5.103: a3,b3 · orden por fecha intacto.
    expect(out.map((p) => p.id)).toEqual(['a1', 'a2', 'a3', 'b1', 'b2', 'b3']);
  });

  it('caso real 5.103: 8 piezas de UNA bahía → salen las 8 (relleno), no solo 2', () => {
    const recientes = Array.from({ length: 8 }, (_, i) => prod(`ome${i}`, { categoryId: 'suspension' }));
    const out = curarRecientes(recientes, 8, 2);
    expect(out.map((p) => p.id)).toEqual(['ome0', 'ome1', 'ome2', 'ome3', 'ome4', 'ome5', 'ome6', 'ome7']);
  });

  it('el relleno no se pasa del máximo', () => {
    const recientes = Array.from({ length: 12 }, (_, i) => prod(`x${i}`, { categoryId: 'unica' }));
    expect(curarRecientes(recientes, 8, 2)).toHaveLength(8);
  });

  it('variedad primero, relleno después; el orden por fecha queda intacto', () => {
    const recientes = [
      prod('a1', { categoryId: 'bahia-a', createdAt: 9 }),
      prod('a2', { categoryId: 'bahia-a', createdAt: 8 }),
      prod('a3', { categoryId: 'bahia-a', createdAt: 7 }),
      prod('a4', { categoryId: 'bahia-a', createdAt: 6 }),
      prod('b1', { categoryId: 'bahia-b', createdAt: 5 }),
      prod('b2', { categoryId: 'bahia-b', createdAt: 4 }),
    ];
    const out = curarRecientes(recientes, 6, 2);
    expect(out.map((p) => p.id)).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'b2']);
  });

  it('el relleno también descarta inactivos', () => {
    const recientes = [
      prod('x1', { categoryId: 'c1', createdAt: 4 }),
      prod('x2', { categoryId: 'c1', active: false, createdAt: 3 }),
      prod('x3', { categoryId: 'c1', createdAt: 2 }),
      prod('x4', { categoryId: 'c1', createdAt: 1 }),
    ];
    expect(curarRecientes(recientes, 4, 2).map((p) => p.id)).toEqual(['x1', 'x3', 'x4']);
  });

  it('descarta inactivos y respeta el tope máximo', () => {
    const recientes = [
      prod('x1', { categoryId: 'c1', active: false }),
      prod('x2', { categoryId: 'c2' }),
      prod('x3', { categoryId: 'c3' }),
      prod('x4', { categoryId: 'c4' }),
    ];
    expect(curarRecientes(recientes, 2, 2).map((p) => p.id)).toEqual(['x2', 'x3']);
  });
});

describe('debeCargarMasPaginas (5.107 · recién llegados siempre lleno)', () => {
  it('pide otra tanda solo si faltan piezas Y quedan tandas disponibles', () => {
    expect(debeCargarMasPaginas(1, 5)).toBe(true); // 5 activos en la 1ª tanda → pide la 2ª
    expect(debeCargarMasPaginas(2, 5)).toBe(true); // aún corta → tanda extra final
    expect(debeCargarMasPaginas(3, 5)).toBe(false); // tope de 3 tandas (72 leídos)
  });

  it('con la vitrina llena jamás pide tandas extra (0 lecturas de más)', () => {
    expect(debeCargarMasPaginas(1, 8)).toBe(false);
    expect(debeCargarMasPaginas(2, 12)).toBe(false);
  });
});

describe('ordenarMasPedidos (punto C)', () => {
  it('ordena por vendidosTotal desc y desempata por fecha', () => {
    const list = [
      prod('poco', { vendidosTotal: 1 }),
      prod('top', { vendidosTotal: 9 }),
      prod('medio', { vendidosTotal: 4 }),
      prod('empate-viejo', { vendidosTotal: 4, createdAt: 100 }),
      prod('empate-nuevo', { vendidosTotal: 4, createdAt: 200 }),
    ];
    expect(ordenarMasPedidos(list).map((p) => p.id)).toEqual([
      'top', 'medio', 'empate-nuevo', 'empate-viejo', 'poco',
    ]);
  });

  it('oculta inactivos y productos sin ventas (arranque desde cero)', () => {
    const list = [
      prod('activo-con-ventas', { vendidosTotal: 3 }),
      prod('inactivo-con-ventas', { vendidosTotal: 99, active: false }),
      prod('sin-campo', {}),
      prod('en-cero', { vendidosTotal: 0 }),
    ];
    expect(ordenarMasPedidos(list).map((p) => p.id)).toEqual(['activo-con-ventas']);
  });

  it('respeta el tope de resultados', () => {
    const list = Array.from({ length: 12 }, (_, i) => prod(`t${i}`, { vendidosTotal: i + 1 }));
    expect(ordenarMasPedidos(list, 8)).toHaveLength(8);
  });
});