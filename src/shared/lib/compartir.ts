/**
 * SPOT 24 · Ronda 5.108 · Compartir enlaces de la tienda (app y productos).
 * · Con Web Share API (Android/iOS modernos): abre el panel NATIVO del
 *   teléfono — salen WhatsApp, Instagram, etc., sin instalar nada.
 * · Sin panel nativo (PC y navegadores viejos): copia el enlace al
 *   portapapeles con copyText (respaldo execCommand de la ronda 5.75) y
 *   avisa con toast «Enlace copiado».
 * · Nunca lanza: todo fallo se resuelve en un resultado controlado.
 * Analytics: evento 'share' de GA4 (method/content_type/content_id) — sin
 * datos personales (sección 8.4 de la Política de Privacidad).
 */
import { copyText } from './clipboard';
import { toast } from './toast';
import { trackEvent } from './analytics';

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
}

export type ResultadoCompartir = 'compartido' | 'copiado' | 'cancelado' | 'fallo';

/** ¿Este navegador abre el panel nativo de compartir? (móvil moderno). */
export function puedeCompartir(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Comparte con el panel nativo si existe; si no, copia al portapapeles.
 * Devuelve el resultado SIN toasts (el que avisa es compartirYavisar):
 * · 'compartido' — el panel nativo entregó el enlace.
 * · 'cancelado'  — el usuario cerró el panel sin compartir (no se copia nada).
 * · 'copiado'    — sin panel nativo (o falló) → enlace en el portapapeles.
 * · 'fallo'      — tampoco se pudo copiar (portapapeles bloqueado; raro).
 */
export async function compartirEnlace(datos: CompartirDatos): Promise<ResultadoCompartir> {
  if (puedeCompartir()) {
    try {
      await navigator.share({ title: datos.title, text: datos.text, url: datos.url });
      return 'compartido';
    } catch (e) {
      // El usuario cerró el panel del teléfono: no es un error ni se copia.
      if ((e as DOMException | undefined)?.name === 'AbortError') return 'cancelado';
      // El panel falló a mitad: cae al portapapeles como respaldo.
    }
  }
  const ok = await copyText(`${datos.text} ${datos.url}`.trim());
  return ok ? 'copiado' : 'fallo';
}

/** Igual que compartirEnlace(), pero registra analytics y avisa con toast. */
export async function compartirYavisar(datos: CompartirDatos): Promise<void> {
  const nativo = puedeCompartir();
  const resultado = await compartirEnlace(datos);
  void trackEvent({
    name: 'share',
    params: {
      method: nativo ? 'panel_nativo' : 'copiar_enlace',
      contentType: datos.tipo,
      itemId: datos.itemId ?? '',
    },
  });
  if (resultado === 'copiado') toast.success('Enlace copiado. Pégalo donde quieras.');
  else if (resultado === 'fallo') toast.error('No pudimos compartir. Intenta de nuevo.');
  // 'compartido' y 'cancelado': el panel del teléfono ya dio su respuesta.
}