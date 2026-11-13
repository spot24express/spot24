/**
 * SPOT 24 · Ronda 5.133 · Puente para compartir con imagen (fn-shareImage).
 *
 * AUTOPSIA (bug «compartir producto llega sin imagen»):
 *   El <img> de la tarjeta baja la foto de i.ibb.co como respuesta OPACA
 *   (mode no-cors, status 0). La regla CacheFirst del service worker para
 *   i.ibb.co (vite.config.ts, ronda 5.75) acepta status [0, 200] y guarda esa
 *   copia opaca. Cuando el usuario comparte, cargarArchivoImagen hace fetch en
 *   modo legible (cors) y el SW le entrega la copia opaca cacheada →
 *   ERR_FAILED «opaque response» → modo seguro (solo texto). La prueba A/B con
 *   «Bypass for network» lo confirmó: sin SW la misma URL responde 200.
 *
 * SOLUCIÓN: puente server-side. El cliente no pide la foto a i.ibb.co
 * directamente, sino a NUESTRA función same-origin
 *   GET /.netlify/functions/fn-shareImage?url=<original>
 * que baja la foto del origen y la re-sirve tal cual. Same-origin ⇒ nunca
 * opaca ⇒ ninguna regla runtimeCaching del SW coincide con /.netlify/ ⇒ el
 * fetch del compartir recibe una respuesta legible.
 *
 * GARANTÍAS:
 *   · vite.config.ts y el service worker NO se tocan (protección 5.75 intacta).
 *   · Rutas propias (/img/…) siguen bajándose directo, sin puente.
 *   · Lista blanca EXACTA de dominios: el puente NO es un proxy abierto.
 *   · Si el puente falla, cargarArchivoImagen lanza y compartirEnlace cae al
 *     modo seguro de siempre (compartir solo texto).
 *   · Sin auth ni Firestore: lectura pura de imágenes públicas.
 *
 * Núcleo puro, sin dependencias de runtime, al estilo de lib/items.ts, para
 * poder testearlo sin emulador. Los wrappers (fn-shareImage) importan de aquí.
 */

/** Dominios desde los que la app muestra fotos de producto. */
export const DOMINIOS_PUENTE: readonly string[] = [
  'i.ibb.co',
  'firebasestorage.googleapis.com',
];

/** Espejo de MAX_FOTO_BYTES del cliente (src/shared/lib/compartir.ts). */
export const MAX_BYTES_PUENTE = 4 * 1024 * 1024;

/** Largo máximo de la URL que acepta el puente (paranoia de abuso). */
const MAX_LARGO_URL = 2048;

/**
 * ¿Es una URL que el puente está autorizado a bajar?
 * Solo https, sin puerto no estándar y con dominio EXACTO de la lista blanca.
 * Un dominio «parecido» (i.ibb.co.evil.com) o el truco de userinfo
 * (https://i.ibb.co@evil.com/) NO pasan: new URL() ya separa hostname de
 * userinfo y el includes es exacto.
 */
export function esUrlDePuente(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_LARGO_URL) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false; // relativa, data:, blob:, texto basura
  }
  if (u.protocol !== 'https:') return false;
  if (u.port !== '') return false;
  return (DOMINIOS_PUENTE as readonly string[]).includes(u.hostname);
}