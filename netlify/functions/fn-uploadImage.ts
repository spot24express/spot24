/**
 * SPOT 24 · POST /.netlify/functions/fn-uploadImage
 * Subida de imágenes del panel (productos, promos) → imgbb.
 * · SOLO admin (claim role). El cliente comprime antes (máx 1600px JPEG).
 * · IMGBB_API_KEY vive SOLO en el servidor (Netlify env). Jamás en el cliente.
 * · Errores con código preciso: el log de Netlify dice exactamente qué falló
 *   (clave ausente = 'failed-precondition', imgbb rechaza = 'unavailable').
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { handle, type Core } from './_backend';
import type { CoreCtx } from '../../functions/src/lib/ctx';

/** Tope defensivo: base64 sin prefijo data: (el cliente ya recorta a ~5M). */
const MAX_BASE64_CHARS = 5_500_000;
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

function requireAdmin(ctx: CoreCtx): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  if (ctx.auth.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo el administrador puede subir imágenes.');
  }
  return ctx.auth.uid;
}

export const coreUploadImage: Core = async (ctx) => {
  requireAdmin(ctx);

  const raw = ctx.data?.['image'];
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new HttpsError('invalid-argument', 'Falta la imagen.');
  }
  // Defensa: si el cliente envió data:image/...;base64,XX, conservamos XX.
  const image = raw.slice(raw.indexOf(',') + 1).replace(/\s/g, '');
  if (image.length > MAX_BASE64_CHARS) {
    throw new HttpsError('invalid-argument', 'La imagen pasa de 5 MB comprimida.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new HttpsError('invalid-argument', 'Imagen inválida (base64 esperado).');
  }

  const key = process.env['IMGBB_API_KEY'] ?? '';
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'IMGBB_API_KEY no configurada en el servidor (Netlify → Environment variables) y redeploy.',
    );
  }

  let res: Response;
  try {
    res = await fetch(IMGBB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key, image }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpsError('unavailable', 'No pudimos contactar a imgbb. Reintenta en unos segundos.');
  }
  if (!res.ok) {
    throw new HttpsError('unavailable', `imgbb rechazó la subida (HTTP ${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { url?: string; delete_url?: string } }
    | null;
  const url = json?.data?.url;
  const deleteUrl = json?.data?.delete_url ?? '';
  if (json?.success !== true || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new HttpsError('internal', 'imgbb no devolvió la dirección de la foto.');
  }
  return { url, deleteUrl };
};

export default async (req: Request): Promise<Response> => handle(coreUploadImage, req);