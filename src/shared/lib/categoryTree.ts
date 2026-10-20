/**
 * SPOT 24 · Lógica pura del árbol de categorías (ronda 5.76).
 * Regla de oro: SOLO UN NIVEL — categorías principales que pueden tener
 * subcategorías, y las subcategorías nunca son padre de nadie.
 * Funciones puras (sin Firestore) para poder testearlas y reusarlas en
 * tienda (CatalogPage, FilterBar, Home) y panel (categorías, productos).
 */
import type { CategoryDef } from '../constants/categories';

/** true si es una categoría principal (bahía), false si es subcategoría. */
export function isTopLevel(c: CategoryDef): boolean {
  return !c.parentId;
}

/** Subcategorías directas de una categoría principal (orden de la lista). */
export function subcategoriesOf(list: CategoryDef[], parentId: string): CategoryDef[] {
  return list.filter((c) => c.parentId === parentId);
}

/** ¿Tiene esta categoría subcategorías? */
export function hasSubcategories(list: CategoryDef[], categoryId: string): boolean {
  return list.some((c) => c.parentId === categoryId);
}

/**
 * La subcategoría (o la propia categoría) + su padre si es subcategoría.
 * Sirve para resaltar el chip del padre cuando hay una subcategoría activa.
 */
export function branchRootId(list: CategoryDef[], categoryId: string): string {
  const target = list.find((c) => c.id === categoryId);
  return target?.parentId || categoryId;
}

/**
 * Ids de la rama completa: la categoría raíz + sus subcategorías.
 * Se usa para filtrar productos (Firestore `in`) al elegir una principal:
 * la bahía muestra lo suyo Y lo de sus subcategorías.
 */
export function subtreeIds(list: CategoryDef[], rootId: string): string[] {
  return [rootId, ...subcategoriesOf(list, rootId).map((c) => c.id)];
}

/** Candidatas a ser padre de X: solo principales, y X no puede ser su propio padre. */
export function parentOptions(list: CategoryDef[], excludeId?: string): CategoryDef[] {
  return list.filter((c) => isTopLevel(c) && c.id !== excludeId);
}

/**
 * Normaliza la lista que viene de Firestore (ronda 5.76):
 * 1) Una subcategoría cuyo padre ya no existe (borrado manual, dato viejo)
 *    vuelve a ser principal — así jamás queda invisible en la tienda.
 * 2) Asigna el número de bahía (01, 02, …) contando SOLO las principales:
 *    agregar/quitar subcategorías ya no corre los números de las bahías.
 * Mantiene el orden de la lista (createdAt asc en las consultas).
 */
export function normalizeCategoryList(list: CategoryDef[]): CategoryDef[] {
  const ids = new Set(list.map((c) => c.id));
  let n = 0;
  return list.map((c) => {
    const parentOk = c.parentId && ids.has(c.parentId) ? c.parentId : '';
    if (parentOk) return { ...c, parentId: parentOk, code: '' };
    n += 1;
    return { ...c, parentId: '', code: String(n).padStart(2, '0') };
  });
}

/**
 * Orden para el panel: cada principal seguida de sus subcategorías
 * (indentadas visualmente en la página). Huerfanos ya no existen tras
 * normalizeCategoryList, pero por defensa se cuelgan al final.
 */
export function sortAdminCategoryList(list: CategoryDef[]): CategoryDef[] {
  const normalized = normalizeCategoryList(list);
  const out: CategoryDef[] = [];
  const taken = new Set<string>();
  for (const parent of normalized.filter(isTopLevel)) {
    out.push(parent);
    for (const child of subcategoriesOf(normalized, parent.id)) {
      out.push(child);
      taken.add(child.id);
    }
  }
  for (const c of normalized) {
    if (!taken.has(c.id) && !isTopLevel(c)) out.push(c);
  }
  return out;
}
