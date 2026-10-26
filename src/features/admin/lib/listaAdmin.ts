/**
 * SPOT 24 · Ronda 5.102 · Lista del panel de productos (libra PURA, sin Firebase).
 * El bug del dueño: con el tope de 300 docs de 5.95, la mayoría de los 78
 * repuestos MOOG no aparecía en Admin → Productos para editarlos (la colección
 * ya tiene 789). Ahora el servicio lee la colección COMPLETA por páginas y el
 * orden + el filtro de la búsqueda viven aquí, probables sin Firestore.
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
