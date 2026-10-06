/**
 * SPOT 24 · Validación y sanitización de entradas (sección 6.5)
 * Doble uso: en el cliente (feedback inmediato) y replicada en Cloud Functions.
 * Funciones puras, sin DOM, cubiertas por tests unitarios.
 */

/** Elimina caracteres de control, recorta y limita longitud. */
export function sanitizeText(value: unknown, maxLength = 300): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

/** Sanitiza texto libre conservando saltos de línea (direcciones, notas). */
export function sanitizeMultiline(value: unknown, maxLength = 500): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim()
    .slice(0, maxLength);
}

/** Solo dígitos, acotado. */
export function sanitizeDigits(value: unknown, maxLength = 20): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\D/g, '').slice(0, maxLength);
}

const EMAIL_RE = /^[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,253}\.[a-zA-Z]{2,24}$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Operadoras venezolanas: Movilnet, Movistar, Digitel (todos los prefijos móviles). */
const VE_MOBILE_PREFIXES = ['0412', '0414', '0416', '0422', '0424', '0426'];

/**
 * Normaliza CUALQUIER formato venezolano a 11 dígitos locales con 0 inicial.
 * El cliente de SPOT 24 SIEMPRE ve y escribe el teléfono en formato local
 * (ej. 04243036024); el prefijo internacional +58 nunca se muestra en la UI:
 *   04141234567      → 04141234567
 *   4141234567       → 04141234567
 *   +584141234567    → 04141234567   (E.164 guardado en users/{uid}.phoneE164)
 *   584141234567     → 04141234567
 *   0058 424-1234567 → 04241234567
 */
export function normalizePhoneVE(value: string): string {
  let d = value.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2); // marca internacional 0058…
  if (d.length === 12 && d.startsWith('58')) d = d.slice(2); // 58 + 10 dígitos
  if (d.length === 10 && d.startsWith('4')) d = `0${d}`; // 4241234567 → 0424…
  return d;
}

export function isValidPhoneVE(value: string): boolean {
  const d = normalizePhoneVE(value);
  if (d.length !== 11) return false;
  return VE_MOBILE_PREFIXES.some((p) => d.startsWith(p));
}

/**
 * Cédula venezolana SIN exigir prefijo: acepta 12345678, V-12345678,
 * E-87654321, v12345678 (con o sin puntos). 1 a 8 dígitos.
 */
export function isValidCedulaVE(value: string): boolean {
  const clean = value.trim().toUpperCase().replace(/[\s.]/g, '');
  return /^(?:[VE]-?)?\d{1,8}$/.test(clean);
}

/**
 * Normaliza conservando lo que escribió el usuario: solo añade el guion
 * V-/E- si él puso la letra; los dígitos solos quedan como dígitos.
 */
export function normalizeCedulaVE(value: string): string {
  const clean = value.trim().toUpperCase().replace(/[\s.]/g, '');
  if (/^[VE]\d{1,8}$/.test(clean)) return `${clean[0]}-${clean.slice(1)}`;
  return clean;
}

/**
 * Referencia de Pago Móvil: los ÚLTIMOS 6 dígitos (exactamente 6), tal como
 * los muestra el SMS o el resumen del banco.
 */
export function isValidPaymentReference(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

/** Números de dinero: positivo, hasta 2 decimales, tope defensivo. */
export function isValidAmount(value: number, max = 100_000): boolean {
  return Number.isFinite(value) && value > 0 && value <= max && Math.round(value * 100) === Math.round(value * 100);
}

/** Cantidad de compra: entero entre 1 y tope (defensa contra carritos absurdos). */
export function clampQuantity(qty: number, max = 20): number {
  if (!Number.isFinite(qty)) return 1;
  return Math.min(max, Math.max(1, Math.floor(qty)));
}

/** Nombre de persona: letras (unicode básico), espacios, guiones; 2–80. */
export function isValidPersonName(value: string): boolean {
  const v = value.trim();
  if (v.length < 2 || v.length > 80) return false;
  return /^[\p{L}\p{M}'’-]+( [\p{L}\p{M}'’-]+)+$/u.test(v);
}

/** Nombre de archivo seguro para Storage (comprobantes, imágenes). */
export function sanitizeFileName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
}

/** MIME permitidos para comprobantes e imágenes de producto. */
export const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
/** El comprobante del cliente va a imgbb: solo imágenes (el PDF no aplica). */
export const RECEIPT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

export function isAllowedUploadType(mime: string, allowed: readonly string[]): boolean {
  return (allowed as readonly string[]).includes(mime);
}

export function isAllowedUploadSize(bytes: number): boolean {
  return bytes > 0 && bytes <= MAX_UPLOAD_BYTES;
}