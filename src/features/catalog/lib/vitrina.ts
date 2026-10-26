/**
 * SPOT 24 · Ronda 5.98 · Vitrina del Home que vende (libra PURA, sin Firebase).
 * · Punto D — curar «Recién llegados»: de los últimos productos, máximo 2 por
 *   bahía (categoryId) para que la sección deje de salir monotemática (el caso
 *   que la motivó: 8 piezas OLD MAN EMU seguidas por una sola importación).
 *   Ronda 5.103 — el tope por bahía YA NO deja la sección casi vacía: si con
 *   el tope no se llena la vitrina (UNA importación grande de una sola bahía
 *   dejaba solo 2 piezas visibles), se RELLENA hasta el máximo con los más
 *   recientes que faltaron.
 * · Punto C — «Los más pedidos»: orden de los vendedores (empate → fecha).
 * · Punto G — reseñas: recálculo del promedio SOLO con las visibles y
 *   saneamiento del texto (el mismo criterio del backend en functions/src/reviews.ts).
 * Las funciones backend (dispatch/reviews) re-implementan esta lógica en su
 * runtime; aquí vive la versión única que la tienda puede probar sin Firestore.
 */
import type { Product, ProductReview } from '../types';

/**
 * Punto D · Toma los últimos productos (YA vienen ordenados por createdAt desc
 * desde la consulta) y devuelve hasta `max` piezas, respetando el orden por
 * fecha. Los inactivos se descartan. Curado en 2 pasadas (5.103):
 * 1) VARIEDAD — hasta `maxPorBahia` por categoryId, para que la vitrina no
 *    salga monotemática cuando hay varias bahías nuevas.
 * 2) RELLENO — si con el tope por bahía no se llena la vitrina (p. ej. UNA
 *    importación grande de una sola bahía), completa hasta `max` con los más
 *    recientes que faltaron, sin tope por bahía. Así la sección muestra
 *    SIEMPRE hasta `max` piezas (o todas, si hay menos).
 */
export function curarRecientes(
  recientes: Product[],
  max = 8,
  maxPorBahia = 2,
): Product[] {
  const porBahia = new Map<string, number>();
  const vistos = new Set<string>();
  const elegidos: Product[] = [];
  const pasar = (conTope: boolean) => {
    for (const p of recientes) {
      if (elegidos.length >= max) return;
      if (!p.active || vistos.has(p.id)) continue;
      if (conTope) {
        const usadas = porBahia.get(p.categoryId) ?? 0;
        if (usadas >= maxPorBahia) continue;
        porBahia.set(p.categoryId, usadas + 1);
      }
      vistos.add(p.id);
      elegidos.push(p);
    }
  };
  pasar(true); // 1ª pasada: variedad (tope por bahía)
  if (elegidos.length < max) pasar(false); // 2ª pasada: relleno 5.103
  // El relleno puede adelantar piezas nuevas de la misma bahía: se restaura
  // el orden por fecha (la posición original de la lista ya viene desc).
  return [...elegidos].sort(
    (a, b) => recientes.indexOf(a) - recientes.indexOf(b),
  );
}

/**
 * Ronda 5.107 · ¿Pide otra tanda de recientes para llenar la vitrina?
 * «Recién llegados» quiere mostrar SIEMPRE hasta `max` piezas (8). Con muchas
 * piezas recientes inactivas (p. ej. una tanda de productos sin publicar que
 * tapa la lista), la primera tanda de 24 puede traer menos de 8 activos:
 * se permiten hasta `maxPaginas` tandas antes de rendirse con lo que haya.
 * Si en TODO el catálogo no hay `max` activos, la sección muestra los que
 * existan (correcto, no es un error).
 */
export function debeCargarMasPaginas(
  nPaginas: number,
  curados: number,
  max = 8,
  maxPaginas = 3,
): boolean {
  return curados < max && nPaginas < maxPaginas;
}

/**
 * Punto C · Orden de «Los más pedidos»: vendidosTotal desc; empate por fecha
 * (más nuevo primero — el orden natural del catálogo). SOLO activos y con al
 * menos 1 unidad vendida; tope de `max` resultados.
 */
export function ordenarMasPedidos(productos: Product[], max = 8): Product[] {
  return productos
    .filter((p) => p.active && (p.vendidosTotal ?? 0) > 0)
    .sort((a, b) => {
      const dif = (b.vendidosTotal ?? 0) - (a.vendidosTotal ?? 0);
      return dif !== 0 ? dif : b.createdAt - a.createdAt;
    })
    .slice(0, max);
}

/** Sanea el texto de una reseña (misma regla que el backend): sin caracteres
 *  de control, recortada a 400. */
export function limpiarTextoResena(raw: string): string {
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 400);
}

/** Media de las reseñas visibles, redondeada a 1 decimal (0 si no hay). */
export function calcularPromedio(reviews: ProductReview[]): number {
  const visibles = reviews.filter((r) => r.visible);
  if (visibles.length === 0) return 0;
  const suma = visibles.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((suma / visibles.length) * 10) / 10;
}

/** Cantidad de reseñas visibles. */
export function contarVisibles(reviews: ProductReview[]): number {
  return reviews.filter((r) => r.visible).length;
}

/**
 * Recalcula ratingAvg/ratingCount SOLO sobre las visibles (la moderación
 * cambia el promedio al instante). Devuelve los campos para el doc producto.
 */
export function camposRating(
  reviews: ProductReview[],
): { ratingAvg: number; ratingCount: number } {
  return {
    ratingAvg: calcularPromedio(reviews),
    ratingCount: contarVisibles(reviews),
  };
}