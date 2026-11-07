/**
 * SPOT 24 · Enlaces de WhatsApp de soporte — dos líneas (5.132).
 *
 * Los números los fija el admin en /admin/ajustes (settings/general):
 * · whatsappAtencion → «Soporte Atención al Cliente» (con respaldo del campo
 *   viejo whatsappNumber: el número ya guardado en producción sigue sirviendo
 *   sin volver a escribirlo).
 * · whatsappVentas   → «Soporte de Ventas».
 *
 * Acepta formatos locales y los normaliza a formato internacional de
 * Venezuela para wa.me:
 *   04241234567        → 584241234567
 *   4241234567         → 584241234567
 *   +58 424-1234567    → 584241234567
 *   584241234567       → 584241234567
 * Devuelve null si el número no es usable (así la línea se oculta).
 *
 * 5.132: los enlaces son EXACTAMENTE los de producción (https://wa.me/…),
 * la misma apertura de siempre — sin pantallas blancas nuevas ni efectos
 * raros; la novedad es que pueden existir DOS líneas y el globo las
 * despliega en un panel.
 */

/** Mensaje prellenado por línea (el cliente solo pulsa enviar). */
export const MENSAJES_WHATSAPP = {
  atencion: 'Hola SPOT 24, necesito ayuda con mi pedido.',
  ventas: 'Hola SPOT 24, quiero información de un producto.',
} as const;

/** Una línea de WhatsApp visible para el cliente. */
export interface LineaWhatsapp {
  /** Rol fijo de la línea (orden y llave del panel). */
  rol: 'atencion' | 'ventas';
  /** Etiqueta corta (Atención / Ventas). */
  etiqueta: string;
  /** Nombre completo (Soporte Atención al Cliente / Soporte de Ventas). */
  nombre: string;
  /** Enlace wa.me con el mensaje prellenado, listo para el cliente. */
  href: string;
}

/** Normaliza a 58XXXXXXXXXX. null = número no usable (línea oculta). */
function waIntl(raw: string | null | undefined): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  let intl = digits;
  if (intl.startsWith('00')) intl = intl.slice(2);
  else if (intl.startsWith('0')) intl = `58${intl.slice(1)}`;
  else if (!intl.startsWith('58') && intl.length === 10) intl = `58${intl}`;
  if (!/^58\d{10}$/.test(intl)) return null;
  return intl;
}

/**
 * Enlace wa.me de una línea — el MISMO mecanismo de producción:
 * el navegador hace la transición (wa.me → WhatsApp) y Android cambia
 * de app tal cual lo viene haciendo desde siempre.
 */
export function waHref(
  raw: string | null | undefined,
  message = 'Hola SPOT 24, tengo una consulta sobre mi pedido.',
): string | null {
  const intl = waIntl(raw);
  return intl ? `https://wa.me/${intl}?text=${encodeURIComponent(message)}` : null;
}

/** Campos de WhatsApp guardados en settings/general. */
export interface AjustesWhatsapp {
  whatsappAtencion?: string;
  whatsappVentas?: string;
}

/**
 * Líneas visibles a partir de settings/general, en orden fijo:
 * Atención primero, Ventas después. Una línea con número vacío o
 * inválido simplemente no aparece (cero líneas = sin globo, igual que
 * hoy; una sola línea = globo directo a ese chat, como producción).
 */
export function lineasWhatsapp(g: AjustesWhatsapp | null | undefined): LineaWhatsapp[] {
  const lineas: LineaWhatsapp[] = [];
  const atencion = waHref(g?.whatsappAtencion, MENSAJES_WHATSAPP.atencion);
  if (atencion) {
    lineas.push({
      rol: 'atencion',
      etiqueta: 'Atención',
      nombre: 'Soporte Atención al Cliente',
      href: atencion,
    });
  }
  const ventas = waHref(g?.whatsappVentas, MENSAJES_WHATSAPP.ventas);
  if (ventas) {
    lineas.push({
      rol: 'ventas',
      etiqueta: 'Ventas',
      nombre: 'Soporte de Ventas',
      href: ventas,
    });
  }
  return lineas;
}
