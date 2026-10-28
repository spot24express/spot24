/**
 * Ronda 5.111 · Cascada de tarjetas + ordenar por precio (estilo de la app
 * de farmacia de referencia, aprobado por el dueño).
 * · cascada.ts — escalonCascada / estiloCascada: el escalón que cada tarjeta
 *   recibe como variable CSS `--cascada`, que index.css consume en
 *   .card-enter (tope 12 escalones × 40 ms = 480 ms).
 * · orden.ts — esOrdenValida / ordenarPorPrecio: el orden es de CLIENTE, se
 *   recalcula sobre lo ya cargado sin tocar la consulta de Firestore (ni
 *   índices compuestos nuevos, ni lecturas extra).
 * Libras puras: src/shared/lib/cascada.ts y src/features/catalog/lib/orden.ts
 * (sin Firebase, corren en node como toda esta suite).
 */
import { describe, expect, it } from 'vitest';
import { ESCALON_MS, TOPE_ESCALONES, escalonCascada, estiloCascada } from '../shared/lib/cascada';
import { esOrdenValida, ordenarPorPrecio } from '../features/catalog/lib/orden';
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

describe('cascada · escalonCascada', () => {
  it('escalones normales pasan tal cual (0, 1, 12)', () => {
    expect(escalonCascada(0)).toBe(0);
    expect(escalonCascada(1)).toBe(1);
    expect(escalonCascada(12)).toBe(12);
  });

  it('más allá del tope queda tocado en 12 (grillas largas / «Cargar más»)', () => {
    expect(escalonCascada(13)).toBe(12);
    expect(escalonCascada(100)).toBe(12);
  });

  it('entradas raras caen a 0: esa tarjeta entra de una', () => {
    expect(escalonCascada(-3)).toBe(0);
    expect(escalonCascada(NaN)).toBe(0);
    expect(escalonCascada(Infinity)).toBe(0);
  });

  it('decimales se redondean a piso (los índices de map llegan enteros, pero a prueba de todo)', () => {
    expect(escalonCascada(2.9)).toBe(2);
  });

  it('constantes del contrato con index.css: 12 × 40 ms = 480 ms de tope', () => {
    expect(ESCALON_MS).toBe(40);
    expect(TOPE_ESCALONES).toBe(12);
  });

  it('estiloCascada devuelve la variable CSS que .card-enter consume', () => {
    expect(estiloCascada(3)).toEqual({ '--cascada': 3 });
    expect(estiloCascada(99)).toEqual({ '--cascada': 12 });
  });
});

describe('orden · esOrdenValida', () => {
  it('solo acepta asc y desc (los valores de ?orden=)', () => {
    expect(esOrdenValida('asc')).toBe(true);
    expect(esOrdenValida('desc')).toBe(true);
  });

  it('rechaza todo lo demás: ausente, vacío, mayúsculas, inventados', () => {
    expect(esOrdenValida(null)).toBe(false);
    expect(esOrdenValida('')).toBe(false);
    expect(esOrdenValida('ASC')).toBe(false);
    expect(esOrdenValida('aleatorio')).toBe(false);
  });
});

describe('orden · ordenarPorPrecio', () => {
  it('asc: menor precio primero', () => {
    const lista = [
      prod('caro', { basePriceUsd: 50 }),
      prod('barato', { basePriceUsd: 5 }),
      prod('medio', { basePriceUsd: 20 }),
    ];
    expect(ordenarPorPrecio(lista, 'asc').map((p) => p.id)).toEqual(['barato', 'medio', 'caro']);
  });

  it('desc: mayor precio primero', () => {
    const lista = [
      prod('barato', { basePriceUsd: 5 }),
      prod('medio', { basePriceUsd: 20 }),
      prod('caro', { basePriceUsd: 50 }),
    ];
    expect(ordenarPorPrecio(lista, 'desc').map((p) => p.id)).toEqual(['caro', 'medio', 'barato']);
  });

  it('sin orden (null): la lista queda tal cual — el orden de siempre', () => {
    const lista = [prod('b', { basePriceUsd: 2 }), prod('a', { basePriceUsd: 1 })];
    expect(ordenarPorPrecio(lista, null).map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('empate de precio → gana el más nuevo (createdAt descendente)', () => {
    const lista = [
      prod('viejo', { basePriceUsd: 20, createdAt: 100 }),
      prod('nuevo', { basePriceUsd: 20, createdAt: 200 }),
    ];
    expect(ordenarPorPrecio(lista, 'asc').map((p) => p.id)).toEqual(['nuevo', 'viejo']);
  });

  it('NO muta la lista original (react-query vive de la inmutabilidad)', () => {
    const lista = [prod('b', { basePriceUsd: 2 }), prod('a', { basePriceUsd: 1 })];
    ordenarPorPrecio(lista, 'asc');
    expect(lista.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('lista vacía y de una sola tarjeta no explotan', () => {
    expect(ordenarPorPrecio([], 'asc')).toEqual([]);
    const sola = [prod('unica', { basePriceUsd: 7 })];
    expect(ordenarPorPrecio(sola, 'desc')).toHaveLength(1);
  });
});