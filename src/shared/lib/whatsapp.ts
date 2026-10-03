/**
 * SPOT 24 · Enlace de WhatsApp de soporte.
 * El número lo establece el admin en /admin/ajustes (settings/general,
 * campo whatsappNumber). Acepta formatos locales y lo normaliza a
 * formato internacional de Venezuela para wa.me:
 *   04241234567        → 584241234567
 *   4241234567         → 584241234567
 *   +58 424-1234567    → 584241234567
 *   584241234567       → 584241234567
 * Devuelve null si el número no es usable (así el botón se oculta).
 */
export function waHref(
  raw: string | null | undefined,
  message = 'Hola SPOT 24, tengo una consulta sobre mi pedido.',
): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  let intl = digits;
  if (intl.startsWith('00')) intl = intl.slice(2);
  else if (intl.startsWith('0')) intl = `58${intl.slice(1)}`;
  else if (!intl.startsWith('58') && intl.length === 10) intl = `58${intl}`;
  if (!/^58\d{10}$/.test(intl)) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}
