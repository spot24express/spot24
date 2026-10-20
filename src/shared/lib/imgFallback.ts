/**
 * SPOT 24 · Respaldo visual cuando una foto de producto NO carga (5.87f).
 * ────────────────────────────────────────────────────────────────────
 * Los productos creados a mano o por la importación del PDF llevan de
 * portada la imagen de su categoría (/img/products/{categoryId}.svg).
 * Las categorías semilla del repo tienen SU svg; las categorías que el
 * dueño crea después NO lo tienen — el <img> quedaba ROTO (el error
 * «Failed to load resource» de su consola) hasta que le subieran foto.
 *
 * · alFallarFoto se pasa directo a onError del <img>: cambia el src al
 *   placeholder del repo y marca el elemento (dataset.fallo) para que un
 *   fallo DEL PROPIO placeholder no gire en bucle.
 * · Solo para fotos de PRODUCTO: el QR de pago y el comprobante del
 *   cliente jamás deben mostrar un placeholder de repuesto (sería
 *   engañoso), por eso no se usa ahí.
 * · No toca los DATOS: la ruta original sigue guardada en Firestore;
 *   si el dueño sube la foto, el src vuelve a la imagen real (Editar
 *   reescribe images[0]).
 */

/** Placeholder del repo (mismo estilo que los svg de categoría). */
export const FOTO_RESPALDO = '/img/products/placeholder.svg';

/**
 * onError de un <img> de producto: si la foto no carga, muestra el
 * placeholder UNA sola vez (el dataset impide el bucle si el propio
 * placeholder falla). No usa APIs del DOM más allá del elemento que
 * React entrega en el evento: testeable en node sin jsdom.
 */
export function alFallarFoto(e: { currentTarget: HTMLImageElement }): void {
  const img = e.currentTarget;
  if (img.dataset['fallo'] === '1') return;
  img.dataset['fallo'] = '1';
  img.src = FOTO_RESPALDO;
}
