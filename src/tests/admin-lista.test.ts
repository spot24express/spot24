/**
 * 5.102 · Lista del panel de productos (features/admin/lib/listaAdmin).
 * Caso del dueño: con el tope de 300 docs de 5.95, la mayoría de los 78 MOOG
 * no aparecía en Admin → Productos para editarlos. El servicio ahora lee la
 * colección completa; el orden y el filtro de la búsqueda son puros.
 */
import { describe, expect, it } from 'vitest';
import { filtrarProductosAdmin, ordenarProductosAdmin } from '@/features/admin/lib/listaAdmin';
import type { Product } from '@/features/catalog/types';

function prod(parcial: Partial<Product> & { id: string; name: string }): Product {
  return {
    slug: parcial.slug ?? parcial.id,
    brand: '',
    description: '',
    categoryId: 'cat',
    basePriceUsd: 1,
    images: [],
    searchTerms: [],
    stockTotal: 0,
    variantCount: 1,
    active: true,
    createdAt: 0,
    updatedAt: 0,
    ...parcial,
  };
}

const MOOG = [
  prod({ id: 'a', name: 'MOOG CRUCETA CHEVY SILVERADO', code: 'LMG285', brand: '', createdAt: 100 }),
  prod({ id: 'b', name: 'CRUCETA PARA CAMION F250/F350', code: 'LMG330', brand: 'MOOG', createdAt: 100 }),
  prod({ id: 'c', name: 'TERMINAL EXTERNO PILOTO AVEO 04-11', code: 'ES800033', brand: 'MOOG', createdAt: 100 }),
];

describe('ordenarProductosAdmin', () => {
  it('ordena por createdAt desc (más recientes primero)', () => {
    const items = [
      prod({ id: 'viejo', name: 'Viejo', createdAt: 10 }),
      prod({ id: 'nuevo', name: 'Nuevo', createdAt: 50 }),
    ];
    expect(ordenarProductosAdmin(items).map((p) => p.id)).toEqual(['nuevo', 'viejo']);
  });

  it('empate de createdAt se resuelve por nombre A→Z (importaciones agrupadas)', () => {
    const items = [
      prod({ id: 'b', name: 'CRUCETA PARA CAMION', createdAt: 100 }),
      prod({ id: 'a', name: 'CRUCETA CHEVY', createdAt: 100 }),
    ];
    expect(ordenarProductosAdmin(items).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('no muta la lista original', () => {
    const items = [prod({ id: 'a', name: 'B', createdAt: 1 }), prod({ id: 'b', name: 'A', createdAt: 2 })];
    ordenarProductosAdmin(items);
    expect(items.map((p) => p.id)).toEqual(['a', 'b']);
  });
});

describe('filtrarProductosAdmin', () => {
  it('término vacío devuelve la lista completa en el mismo orden', () => {
    expect(filtrarProductosAdmin(MOOG, '')).toHaveLength(3);
    expect(filtrarProductosAdmin(MOOG, '   ')).toHaveLength(3);
  });

  it('busca por NOMBRE sin distinguir mayúsculas (el caso MOOG)', () => {
    const r = filtrarProductosAdmin(MOOG, 'cruceta');
    expect(r.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('busca por MARCA (los editados con marca MOOG también salen)', () => {
    const r = filtrarProductosAdmin(MOOG, 'moog');
    expect(r).toHaveLength(3); // 2 con marca MOOG + 1 con MOOG en el nombre
  });

  it('busca por CÓDIGO (ES800033, es800033 o fragmento)', () => {
    expect(filtrarProductosAdmin(MOOG, 'ES800033').map((p) => p.id)).toEqual(['c']);
    expect(filtrarProductosAdmin(MOOG, 'es800').map((p) => p.id)).toEqual(['c']);
  });

  it('sin coincidencias devuelve vacío', () => {
    expect(filtrarProductosAdmin(MOOG, 'polar')).toEqual([]);
  });
});
