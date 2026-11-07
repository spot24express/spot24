/**
 * SPOT 24 · Ronda 5.108 · Compartir enlaces de la tienda (app y productos).
 * · Con Web Share API (Android/iOS modernos): abre el panel NATIVO del
 *   teléfono — salen WhatsApp, Instagram, etc., sin instalar nada.
 * · Sin panel nativo (PC y navegadores viejos): copia el enlace al
 *   portapapeles con copyText (respaldo execCommand de la ronda 5.75) y
 *   avisa con toast «Enlace copiado».
 * · Nunca lanza: todo fallo se resuelve en un resultado controlado.
 *
 * Ronda 5.126 · Compartir CON FOTO (Web Share API Level 2). Al compartir la
 * APP se adjunta la foto de la fachada de la tienda y al compartir un
 * PRODUCTO la foto del producto (la que pasa cada pantalla). Solo cuando el
 * navegador confirma que sabe compartir archivos (navigator.canShare con
 * files): Android, iPhone/iPad y Chrome/Edge de PC modernos. Si no hay
 * panel, no soporta archivos o la foto no se pudo bajar, todo sigue igual
 * que antes de la 5.126: panel con solo texto o copia al portapapeles.
 *
 * Analytics: evento 'share' de GA4 (method/content_type/content_id) — sin
 * datos personales (sección 8.4 de la Política de Privacidad). Con foto el
 * método se registra como 'panel_nativo_con_foto' para medir cuántas
 * veces la foto llegó al panel.
 */
import { copyText } from './clipboard';
import { toast } from './toast';
import { trackEvent } from './analytics';

/** Foto de la tienda que se adjunta al compartir la APP (héroe del Home).
 *  Misma imagen que el preload del index.html: el service worker la sirve
 *  cache-first, así que bajarla para compartir es instantáneo y funciona
 *  incluso sin conexión. */
export const IMAGEN_COMPARTIR_APP = '/img/fachada-spot24.jpg';

/** Tope de peso de la foto a adjuntar: los paneles de compartir rechazan
 *  archivos muy grandes, así que ni intentamos con esas. */
const MAX_FOTO_BYTES = 4 * 1024 * 1024;

export interface CompartirDatos {
  /** Título del panel nativo. */
  title: string;
  /** Texto que viaja junto al enlace. */
  text: string;
  /** Enlace completo (absoluto). */
  url: string;
  /** Para analytics: qué se compartió. */
  tipo: 'app' | 'producto';
  /** Id interno del producto (analytics; nunca datos personales). */
  itemId?: string;
  /** Foto a adjuntar (ruta del propio sitio o URL absoluta). Si se omite
   *  y tipo es 'app' se usa la fachada de la tienda. Ronda 5.126. */
  imagen?: string;
  /** Alias tolerado por compatibilidad con pantallas previas. */
  imagenUrl?: string;
  /** Alias tolerado por compatibilidad con pantallas previas. */
  foto?: string;
}

export type ResultadoCompartir =
  | 'compartido'
  | 'compartido_con_foto'
  | 'copiado'
  | 'cancelado'
  | 'fallo';

/** ¿Este navegador abre el panel nativo de compartir? (móvil moderno). */
export function puedeCompartir(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** ¿El panel nativo también acepta ARCHIVOS (fotos)? Web Share Level 2.
 *  Se comprueba con un archivo de prueba (o con el archivo real que se
 *  quiera mandar, porque algunos tipos como SVG los rechaza). */
export function puedeCompartirArchivos(archivo?: File): boolean {
  if (!puedeCompartir()) return false;
  const puede = (navigator as Navigator & { canShare?: (d: ShareData) => boolean }).canShare;
  if (typeof puede !== 'function') return false;
  try {
    const prueba = archivo ?? new File([''], 'spot24.jpg', { type: 'image/jpeg' });
    return puede.call(navigator, { files: [prueba] });
  } catch {
    return false;
  }
}

/** Foto pedida por quien llama (con alias por compatibilidad), o la que
 *  venga como argumento suelto (compatibilidad con versiones previas), o,
 *  al compartir la APP, la fachada de la tienda por defecto. */
function imagenDe(datos: CompartirDatos, imagenExtra?: string): string | undefined {
  return (
    datos.imagen ??
    datos.imagenUrl ??
    datos.foto ??
    imagenExtra ??
    (datos.tipo === 'app' ? IMAGEN_COMPARTIR_APP : undefined)
  );
}

/** Baja la imagen y la convierte en File para el panel nativo. Devuelve
 *  null si no se pudo (404, sin red, tipo que no es imagen, demasiado
 *  pesada): el respaldo es compartir solo texto, como antes de la 5.126. */
async function cargarArchivoImagen(url: string): Promise<File | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/') || blob.size === 0 || blob.size > MAX_FOTO_BYTES) {
      return null;
    }
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], `spot24.${ext}`, { type: blob.type });
  } catch {
    return null;
  }
}

/** El usuario cerró el panel del teléfono: no es un error ni se copia. */
function esAbort(e: unknown): boolean {
  return (e as DOMException | undefined)?.name === 'AbortError';
}

/**
 * Comparte con el panel nativo si existe (con foto si se puede); si no,
 * copia al portapapeles. Devuelve el resultado SIN toasts (el que avisa
 * es compartirYavisar):
 * · 'compartido_con_foto' — el panel entregó el enlace CON la foto adjunta.
 * · 'compartido'          — el panel entregó el enlace (sin foto).
 * · 'cancelado'           — el usuario cerró el panel (no se copia nada).
 * · 'copiado'             — sin panel nativo (o falló) → enlace copiado.
 * · 'fallo'               — tampoco se pudo copiar (raro).
 */
export async function compartirEnlace(
  datos: CompartirDatos,
  imagenExtra?: string,
): Promise<ResultadoCompartir> {
  const imagen = imagenDe(datos, imagenExtra);
  // 1) Con foto: solo si el navegador de verdad comparte archivos.
  if (imagen && puedeCompartirArchivos()) {
    const archivo = await cargarArchivoImagen(imagen);
    if (archivo && puedeCompartirArchivos(archivo)) {
      try {
        await navigator.share({
          files: [archivo],
          title: datos.title,
          text: datos.text,
          url: datos.url,
        } as ShareData);
        return 'compartido_con_foto';
      } catch (e) {
        if (esAbort(e)) return 'cancelado';
        // El panel falló a mitad con la foto: cae al intento sin foto.
      }
    }
  }
  // 2) Solo texto (comportamiento de la ronda 5.108, intacto).
  if (puedeCompartir()) {
    try {
      await navigator.share({ title: datos.title, text: datos.text, url: datos.url });
      return 'compartido';
    } catch (e) {
      if (esAbort(e)) return 'cancelado';
      // El panel falló a mitad: cae al portapapeles como respaldo.
    }
  }
  const ok = await copyText(`${datos.text} ${datos.url}`.trim());
  return ok ? 'copiado' : 'fallo';
}

/** Igual que compartirEnlace(), pero registra analytics y avisa con toast.
 *  imagenExtra: compatibilidad con versiones que pasaban la foto aparte. */
export async function compartirYavisar(
  datos: CompartirDatos,
  imagenExtra?: string,
): Promise<void> {
  const nativo = puedeCompartir();
  const resultado = await compartirEnlace(datos, imagenExtra);
  void trackEvent({
    name: 'share',
    params: {
      method:
        resultado === 'compartido_con_foto'
          ? 'panel_nativo_con_foto'
          : nativo
            ? 'panel_nativo'
            : 'copiar_enlace',
      contentType: datos.tipo,
      itemId: datos.itemId ?? '',
    },
  });
  if (resultado === 'copiado') toast.success('Enlace copiado. Pégalo donde quieras.');
  else if (resultado === 'fallo') toast.error('No pudimos compartir. Intenta de nuevo.');
  // 'compartido', 'compartido_con_foto' y 'cancelado': el panel del teléfono
  // ya dio su respuesta.
}
