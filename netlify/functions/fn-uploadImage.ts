/**
 * SPOT 24 · POST /.netlify/functions/fn-uploadImage
 * Subida de imágenes del panel (productos, promos) → imgbb.
 * · SOLO admin (claim role). El cliente comprime antes (máx 1600px JPEG).
 * · IMGBB_API_KEY vive SOLO en el servidor (Netlify env). Jamás en el cliente.
 * · 5.112-C: la subida reintenta 3 veces contra caídas del hosting de fotos
 *   (red, 5xx, 429 — el 29/10/2026 imgbb estuvo en 503 global y toda subida
 *   del panel fallaba al primer intento). Tope de 5 s por intento; agotados
 *   los intentos, el error viaja con el mensaje honesto «El servicio de
 *   imágenes está caído…» que la UI del panel muestra tal cual.
 * · Errores con código preciso: el log de Netlify dice exactamente qué falló
 *   (clave ausente = 'failed-precondition', imgbb caído/rechaza = 'unavailable').
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { handle, type Core } from './_backend';
import { imgbbConReintentos } from '../../functions/src/lib/imgbb';
import type { CoreCtx } from '../../functions/src/lib/ctx';

/** Tope defensivo: base64 sin prefijo data: (el cliente ya recorta a ~5M). */
const MAX_BASE64_CHARS = 5_500_000;

function requireStaff(ctx: CoreCtx): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  // Ronda 3: gerente también gestiona fotos de productos y promos.
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Solo el administrador o gerente puede subir imágenes.');
  }
  return ctx.auth.uid;
}

export const coreUploadImage: Core = async (ctx) => {
  requireStaff(ctx);

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

  // 5.112-C: 3 intentos, pausas de 500 ms y 1,5 s, tope de 5 s por intento.
  // Válida respuesta https://… y devuelve url + deleteUrl (el panel lo
  // conserva por si el admin quiere borrar la foto desde imgbb.com).
  return imgbbConReintentos(key, image);
};

export default async (req: Request): Promise<Response> => handle(coreUploadImage, req);