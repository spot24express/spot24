/**
 * SPOT 24 · Tests del árbol de categorías (ronda 5.76).
 * · Un solo nivel: principal → subcategorías (las subcategorías nunca son padre).
 * · Bahías numeradas solo con las principales (01, 02, …).
 * · Huerfanos: subcategoría cuyo padre se borró vuelve a ser principal.
 */
import { describe, expect, it } from 'vitest';
import {
  branchRootId, hasSubcategories, isTopLevel, normalizeCategoryList,
  parentOptions, sortAdminCategoryList, subtreeIds,
} from '../shared/lib/categoryTree';
import type { CategoryDef } from '../shared/constants/categories';

const cat = (id: string, name: string, parentId = ''): CategoryDef => ({
  id, code: '', name, tagline: '', active: true, parentId,
});

const LIST = [
  cat('a', 'Lubricantes'),
  cat('a1', 'Aceites sintéticos', 'a'),
  cat('a2', 'Filtros', 'a'),
  cat('b', 'Baterías'),
  cat('b1', 'Selladas', 'b'),
  cat('c', 'Accesorios'),
];

describe('isTopLevel / hasSubcategories', () => {
  it('distingue principales de subcategorías', () => {
    expect(isTopLevel(LIST[0]!)).toBe(true);
    expect(isTopLevel(LIST[1]!)).toBe(false);
  });

  it('detecta cuáles tienen subcategorías', () => {
    expect(hasSubcategories(LIST, 'a')).toBe(true);
    expect(hasSubcategories(LIST, 'a1')).toBe(false);
    expect(hasSubcategories(LIST, 'zz')).toBe(false);
  });
});

describe('subtreeIds', () => {
  it('rama completa: la categoría + todas sus subcategorías', () => {
    expect(subtreeIds(LIST, 'a')).toEqual(['a', 'a1', 'a2']);
    expect(subtreeIds(LIST, 'b')).toEqual(['b', 'b1']);
    expect(subtreeIds(LIST, 'c')).toEqual(['c']);
  });

  it('una subcategoría es hoja: solo ella misma', () => {
    expect(subtreeIds(LIST, 'a1')).toEqual(['a1']);
  });
});

describe('branchRootId', () => {
  it('subcategoría activa → resalta su padre', () => {
    expect(branchRootId(LIST, 'a1')).toBe('a');
    expect(branchRootId(LIST, 'a')).toBe('a');
  });
});

describe('parentOptions', () => {
  it('solo principales y nunca la propia categoría', () => {
    const options = parentOptions(LIST, 'a');
    expect(options.map((c) => c.id)).toEqual(['b', 'c']);
  });
});

describe('normalizeCategoryList', () => {
  it('numera solo las principales, en orden, sin correr por subcategorías', () => {
    const codes = Object.fromEntries(
      normalizeCategoryList(LIST).map((c) => [c.id, c.code]),
    );
    expect(codes).toEqual({ a: '01', a1: '', a2: '', b: '02', b1: '', c: '03' });
  });

  it('subcategoría huérfana (padre borrado) vuelve a ser principal', () => {
    const orphan = [...LIST, cat('x', 'Huerfana', 'padre-inexistente')];
    const x = normalizeCategoryList(orphan).find((c) => c.id === 'x');
    expect(x?.parentId).toBe('');
    expect(x?.code).toBe('04');
  });

  it('quitar una principal re-numera sin dejar huecos', () => {
    const withoutA = LIST.filter((c) => c.id !== 'a' && c.id !== 'a1' && c.id !== 'a2');
    const codes = normalizeCategoryList(withoutA).map((c) => c.code);
    expect(codes).toEqual(['01', '', '02']);
  });
});

describe('sortAdminCategoryList', () => {
  it('cada principal va seguida de sus subcategorías', () => {
    expect(sortAdminCategoryList(LIST).map((c) => c.id)).toEqual([
      'a', 'a1', 'a2', 'b', 'b1', 'c',
    ]);
  });
});
