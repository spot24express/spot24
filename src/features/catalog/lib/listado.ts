/**
 * SPOT 24 · Ronda 5.149 · ¿Cuándo el listado público puede filtrar activos EN
 * LA CONSULTA de Firestore (where('active','==',true)) en vez de en código?
 *
 * PROBLEMA (hallazgo del dueño tras importar con «Solo stock» + «Solo precios»):
 * el modo stock del importador (5.137) crea INACTIVOS, SIN categoría y SIN
 * precio todo código del PDF que no exista en la tienda (altas pendientes de
 * completar). Esos docs nacen con createdAt = el momento de la importación, así
 * que quedan a la CABEZA del orden createdAt desc: la consulta pública los trae
 * primero, el filtro de activos en código los descarta, y el resultado es:
 *   · «Recién llegados» del Home vacío (el pool de ≤72 docs sale inactivo) y
 *   · «Cargar más» a ciegas en el catálogo (páginas de 12 que quedan vacías
 *     hasta pasar el bloque de inactivos).
 *
 * LA CURA BARATA: where('active','==',true) directo en la consulta. Los índices
 * compuestos necesarios YA EXISTEN en firestore.indexes.json (ronda 5.76/5.81):
 *   · active ASC + createdAt DESC                       → listado sin filtros
 *   · categoryId ASC + active ASC + createdAt DESC      → listado por bahía
 *   · categoryId ASC + active ASC + createdAt DESC también cubre categoryIds
 *     (un `in` corre como varias igualdades sobre el mismo índice).
 * Combinaciones SIN índice aún (fallarían con FAILED_PRECONDITION) y por eso
 * este predicado devuelve false y se queda como hoy con el filtro en código:
 *   · búsqueda (q): searchTerms CONTAINS + active + createdAt no existe.
 *   · stockTotal > 0 / rangos de basePriceUsd: los índices activos viven sin
 *     el campo active (si el dueño los quiere, se agregan a firestore.indexes
 *     y se despliegan — decisión aparte).
 *
 * Libra PURA (sin Firebase): la usa buildProductsQuery del servicio y la suite
 * la prueba sin Firestore, mismo patrón de busqueda.ts / orden.ts.
 */
import type { CatalogFilters } from '../types';

/** ¿La consulta puede llevar where('active','==',true) con los índices YA
 *  desplegados? true = la consulta lo incluye (páginas SIEMPRE con activos);
 *  false = comportamiento de siempre (el activo se filtra en código). */
export function consultaSoloActivos(q: CatalogFilters): boolean {
  // Búsqueda: el índice searchTerms+createdAt no tiene active. El filtro de
  // activos de buscarPorCodigo y del ancla ya cubre al cliente.
  if (q.q) return false;
  // Filtros de precio/stock: exigen índices compuestos que aún no existen.
  if (q.inStockOnly) return false;
  if (q.minPriceUsd !== undefined || q.maxPriceUsd !== undefined) return false;
  // Sin búsqueda y sin precio/stock: sin filtros, categoryId o categoryIds —
  // los tres combos quedan servidos por índices que ya están en producción.
  return true;
}
