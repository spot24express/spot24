/**
 * 5.163 · Filtro por estado en Productos del panel (features/admin/lib/
 * listaAdmin). Pedido del dueño: botones Todos / Activos / Inactivos para
 * encontrar rápido los inactivos sin leer el Chip de cada ficha — y con los
 * conteos a la vista en los propios botones. Puro y sin Firestore.
 */
import { describe, expect, it } from 'vitest';
import {
  contarPorEstado, filtrarEstadoProductosAdmin, filtrarProductosAdmin,
  type FiltroEstado,
} from '@/features/admin/lib/listaAdmin';
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

const LISTA = [
  prod({ id: 'a', name: 'AMORTIGUADOR DELANTERO', active: true }),
  prod({ id: 'b', name: 'BATERÍA 12V', active: false, code: 'BAT-12' }),
  prod({ id: 'c', name: 'CAFE EN CÁPSULA', active: true }),
  prod({ id: 'd', name: 'DISCO DE FRENO', active: false }),
  prod({ id: 'e', name: 'ACEITE SINTÉTICO 5W30', active: true, brand: 'MOBIL' }),
];

describe('filtrarEstadoProductosAdmin (5.163)', () => {
  it('«todos» devuelve la lista tal cual (mismo orden, misma referencia)', () => {
    expect(filtrarEstadoProductosAdmin(LISTA, 'todos')).toBe(LISTA);
  });

  it('«activos» deja SOLO los activos', () => {
    expect(filtrarEstadoProductosAdmin(LISTA, 'activos').map((p) => p.id)).toEqual(['a', 'c', 'e']);
  });

  it('«inactivos» deja SOLO los inactivos (el caso que motivó el pedido)', () => {
    expect(filtrarEstadoProductosAdmin(LISTA, 'inactivos').map((p) => p.id)).toEqual(['b', 'd']);
  });

  it('se combina con la búsqueda: texto primero, estado después (como en la página)', () => {
    const r = filtrarEstadoProductosAdmin(
      filtrarProductosAdmin([...LISTA, prod({ id: 'f', name: 'BATERÍA 6V', active: true })], 'batería'),
      'inactivos',
    );
    expect(r.map((p) => p.id)).toEqual(['b']);
  });

  it('no muta la lista original', () => {
    filtrarEstadoProductosAdmin(LISTA, 'inactivos');
    expect(LISTA).toHaveLength(5);
    expect(LISTA.every((p) => typeof p.active === 'boolean')).toBe(true);
  });
});

describe('contarPorEstado (5.163 · los números que viven en los botones)', () => {
  it('activos + inactivos = todos, siempre', () => {
    const c = contarPorEstado(LISTA);
    expect(c).toEqual({ todos: 5, activos: 3, inactivos: 2 });
    expect(c.activos + c.inactivos).toBe(c.todos);
  });

  it('lista vacía → 0/0/0 (botones en 0 antes de la primera carga de datos)', () => {
    expect(contarPorEstado([])).toEqual({ todos: 0, activos: 0, inactivos: 0 });
  });

  it('todos inactivos → activos 0 (la página muestra su mensaje de vacío)', () => {
    const c = contarPorEstado(LISTA.filter((p) => !p.active));
    expect(c).toEqual({ todos: 2, activos: 0, inactivos: 2 });
  });

  it('todos activos → inactivos 0', () => {
    const c = contarPorEstado(LISTA.filter((p) => p.active));
    expect(c).toEqual({ todos: 3, activos: 3, inactivos: 0 });
  });
});

describe('contrato del filtro (5.163 · lo que exige la página)', () => {
  it('los tres estados del filtro están cubiertos por la libra', () => {
    const estados: FiltroEstado[] = ['todos', 'activos', 'inactivos'];
    for (const f of estados) {
      const r = filtrarEstadoProductosAdmin(LISTA, f);
      expect(r.length).toBeLessThanOrEqual(LISTA.length);
    }
  });
});
