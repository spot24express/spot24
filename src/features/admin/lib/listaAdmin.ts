/**
 * SPOT 24 · Ronda 5.102 · Lista del panel de productos (libra PURA, sin Firebase).
 * El bug del dueño: con el tope de 300 docs de 5.95, la mayoría de los 78
 * repuestos MOOG no aparecía en Admin → Productos para editarlos (la colección
 * ya tiene 789). Ahora el servicio lee la colección COMPLETA por páginas y el
 * orden + el filtro de la búsqueda viven aquí, probables sin Firestore.
 *
 * 5.163 · + filtro por estado (todos / activos / inactivos), pedido por el
 * dueño: antes había que leer el Chip «Activo/Inactivo» de cada ficha para
 * encontrar los inactivos; ahora un toque filtra la lista y los conteos
 * viven en los propios botones.
 */
import type { Product } from '@/features/catalog/types';

/**
 * Orden del listado del panel: más recientes primero (createdAt desc, ya
 * normalizado a epoch-ms con aMillis) y empate por nombre A→Z (los productos
 * de una misma importación comparten createdAt: así salen agrupados y
 * predecibles, no al orden interno de Firestore).
 */
export function ordenarProductosAdmin(items: Product[]): Product[] {
  return [...items].sort(
    (a, b) => b.createdAt - a.createdAt || a.name.localeCompare(b.name),
  );
}

/**
 * Filtro de la búsqueda del panel, ahora LOCAL: la lista completa se lee una
 * vez (adminListProducts) y el texto busca aquí, SIN re-lecturas por tecla.
 * Mismo criterio de siempre: coincide si el término aparece en el nombre, la
 * marca o el código, sin distinguir mayúsculas/minúsculas. Término vacío =
 * la lista completa, en el mismo orden.
 */
export function filtrarProductosAdmin(items: Product[], search: string): Product[] {
  const term = search.trim().toLowerCase();
  if (!term) return items;
  return items.filter(
    (p) =>
      p.name.toLowerCase().includes(term) ||
      p.brand.toLowerCase().includes(term) ||
      (p.code ?? '').toLowerCase().includes(term),
  );
}

/** Ronda 5.163 · Estados del filtro de la lista del panel. */
export type FiltroEstado = 'todos' | 'activos' | 'inactivos';

/**
 * 5.163 · Filtro por estado: «todos» devuelve la lista tal cual (mismo orden,
 * misma referencia — mismo contrato que la búsqueda con término vacío); los
 * otros dos dejan SOLO los activos o SOLO los inactivos. Se combina con la
 * búsqueda: la página aplica ambas (son independientes, el orden da igual).
 */
export function filtrarEstadoProductosAdmin(items: Product[], filtro: FiltroEstado): Product[] {
  if (filtro === 'todos') return items;
  return items.filter((p) => (filtro === 'activos' ? p.active : !p.active));
}

/**
 * 5.163 · Conteos para los botones del filtro, sobre la lista CARGADA en
 * memoria (la colección completa salvo tope de seguridad de 3000). activos +
 * inactivos = todos, siempre.
 */
export function contarPorEstado(items: Product[]): {
  todos: number;
  activos: number;
  inactivos: number;
} {
  const activos = items.filter((p) => p.active).length;
  return { todos: items.length, activos, inactivos: items.length - activos };
}
