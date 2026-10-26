/**
 * Ronda 5.95 · Búsqueda de verdad en la tienda: nombre (1 o varias palabras)
 * y CÓDIGO con prefijo, sin anunciar nada al cliente.
 * Motiva la ronda: los 78 MOOG importados no aparecían — la búsqueda por
 * código NUNCA pudo funcionar (searchTerms solo guarda palabras del nombre) y
 * varias palabras jamás casan con array-contains exacto.
 * La libra es pura (sin Firebase): src/features/catalog/lib/busqueda.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  anclaDe, pasaFiltros, pasaTodosLosTokens, sinAcentos, terminosDeCodigo, tokensDe,
} from '../features/catalog/lib/busqueda';
import type { Product } from '../features/catalog/types';

function prod(partial: Partial<Product>): Product {
  return {
    id: 'p1',
    slug: 'terminal-externo-aveo',
    name: 'MOOG TERMINAL EXTERNO PILOTO AVEO 04-11',
    brand: '',
    description: '',
    categoryId: 'cat-repuesto',
    basePriceUsd: 24.23,
    images: [],
    searchTerms: ['moog', 'terminal', 'externo', 'piloto', 'aveo'],
    stockTotal: 1,
    variantCount: 1,
    active: true,
    createdAt: 1729600000000,
    updatedAt: 1729600000000,
    ...partial,
  };
}

describe('sinAcentos / tokensDe', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(sinAcentos('Batería Términál')).toBe('bateria terminal');
  });

  it('tokensDe separa por espacios (uno o varios)', () => {
    expect(tokensDe('Terminal  AVEO')).toEqual(['terminal', 'aveo']);
    expect(tokensDe('batería')).toEqual(['bateria']);
    expect(tokensDe('   ')).toEqual([]);
  });
});

describe('anclaDe (token más largo manda en el array-contains)', () => {
  it('una palabra: la misma palabra', () => {
    expect(anclaDe('moog')).toBe('moog');
  });

  it('varias palabras: la más larga (con 3+ letras)', () => {
    expect(anclaDe('aceite 5w-30 lubricante')).toBe('lubricante');
    expect(anclaDe('terminal aveo')).toBe('terminal');
  });

  it('todas cortas (<3): null — la búsqueda por nombre no aporta', () => {
    expect(anclaDe('yy ab')).toBeNull();
  });
});

describe('pasaTodosLosTokens (varias palabras: TODAS deben estar)', () => {
  it('acepta cuando las palabras viven en nombre/marca/código/términos', () => {
    const p = prod({
      name: 'MOOG TERMINAL EXTERNO PILOTO AVEO 04-11',
      code: 'ES800033',
      searchTerms: ['moog', 'terminal', 'externo', 'piloto', 'aveo'],
    });
    expect(pasaTodosLosTokens(p, ['terminal', 'aveo'])).toBe(true);
    expect(pasaTodosLosTokens(p, ['moog', 'externo'])).toBe(true);
  });

  it('rechaza si falta alguna palabra', () => {
    const p = prod({ name: 'MOOG TERMINAL EXTERNO PILOTO AVEO 04-11' });
    expect(pasaTodosLosTokens(p, ['terminal', 'corolla'])).toBe(false);
  });

  it('sin acentos y también por código (trabajadores)', () => {
    const p = prod({ code: 'ES800033', name: 'MOOG TERMINAL EXTERNO' });
    expect(pasaTodosLosTokens(p, ['es800033'])).toBe(true);
    expect(pasaTodosLosTokens(prod({ name: 'Batería 24R' }), ['bateria'])).toBe(true);
  });

  it('tokens de menos de 3 letras no bloquean (son ruido del ancla)', () => {
    const p = prod({ name: 'MOOG TERMINAL EXTERNO' });
    expect(pasaTodosLosTokens(p, ['terminal', 'de'])).toBe(true);
  });
});

describe('terminosDeCodigo (prefijo de código, con y sin guion)', () => {
  it('código limpio: uno solo, en mayúsculas', () => {
    expect(terminosDeCodigo('es800033')).toEqual(['ES800033']);
    expect(terminosDeCodigo('RK641395')).toEqual(['RK641395']);
  });

  it('con guion o espacios: prueba el tal cual y el pelado', () => {
    expect(terminosDeCodigo('es-800033')).toEqual(['ES-800033', 'ES800033']);
    expect(terminosDeCodigo('rk 641')).toEqual(['RK 641', 'RK641']);
  });

  it('corto o vacío: nada que buscar', () => {
    expect(terminosDeCodigo('a')).toEqual([]);
    expect(terminosDeCodigo('')).toEqual([]);
    expect(terminosDeCodigo('  ')).toEqual([]);
  });

  it('prefijo corto vale (2 letras: familia ES)', () => {
    expect(terminosDeCodigo('es')).toEqual(['ES']);
  });
});

describe('pasaFiltros (los resultados por código respetan los filtros del catálogo)', () => {
  it('categoría exacta y lista de categorías', () => {
    expect(pasaFiltros(prod({ categoryId: 'c1' }), { pageSize: 12, categoryId: 'c1' })).toBe(true);
    expect(pasaFiltros(prod({ categoryId: 'c2' }), { pageSize: 12, categoryId: 'c1' })).toBe(false);
    expect(pasaFiltros(prod({ categoryId: 'c2' }), { pageSize: 12, categoryIds: ['c1', 'c2'] })).toBe(true);
  });

  it('solo disponibles y rango de precio', () => {
    expect(pasaFiltros(prod({ stockTotal: 0 }), { pageSize: 12, inStockOnly: true })).toBe(false);
    expect(pasaFiltros(prod({ stockTotal: 3 }), { pageSize: 12, inStockOnly: true })).toBe(true);
    expect(pasaFiltros(prod({ basePriceUsd: 30 }), { pageSize: 12, maxPriceUsd: 25 })).toBe(false);
    expect(pasaFiltros(prod({ basePriceUsd: 5 }), { pageSize: 12, minPriceUsd: 10 })).toBe(false);
  });
});
