/**
 * SPOT 24 · Respaldo visual cuando una foto NO carga (5.87f productos ·
 * 5.112-C promos y bahías).
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
 * · 5.112-C · PROMOS Y BAHÍAS: durante la caída global de imgbb del
 *   29/10/2026 el carrusel «Visítanos» mostraba el cartel azul de imgbb y
 *   las bahías con foto quedaban a cuadros. alFallarFotoCon(FOTO_LOCAL)
 *   cambia el src a la foto del local con el escudo gigante (archivo DEL
 *   REPO, jamás se cae): el Home nunca muestra un cuadro roto. NO se usa
 *   en el QR de pago ni en el comprobante del cliente (un placeholder
 *   ahí sería engañoso — regla original de 5.87f, sigue en pie).
 * · No toca los DATOS: la ruta original sigue guardada en Firestore;
 *   si imgbb vuelve (o el dueño sube la foto), el src real regresa al
 *   recargar (Editar reescribe images[0]).
 */

/** Placeholder del repo (mismo estilo que los svg de categoría). */
export const FOTO_RESPALDO = '/img/products/placeholder.svg';

/**
 * Foto del local con el escudo gigante de SPOT 24 (archivo del repo,
 * /public/img/local-mural.jpg): respaldo de promos y bahías cuando su
 * foto de imgbb no carga. 5.112-C.
 */
export const FOTO_LOCAL = '/img/local-mural.jpg';

/**
 * Fábrica del onError con respaldo A MEDIDA: si la foto no carga, muestra
 * `respaldo` UNA sola vez (el dataset impide el bucle si el propio
 * respaldo falla). No usa APIs del DOM más allá del elemento que React
 * entrega en el evento: testeable en node sin jsdom.
 */
export function alFallarFotoCon(respaldo: string): (e: { currentTarget: HTMLImageElement }) => void {
  return (e) => {
    const img = e.currentTarget;
    if (img.dataset['fallo'] === '1') return;
    img.dataset['fallo'] = '1';
    img.src = respaldo;
  };
}

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
