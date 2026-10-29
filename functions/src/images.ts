/**
 * SPOT 24 · Core de subida de imágenes a hosting externo (imgbb).
 * Plan Spark sin Storage: el archivo no vive en Firebase; el servidor lo
 * reenvía a la API de imgbb (cuenta gratuita del negocio) con la clave
 * IMGBB_API_KEY (Netlify env var, jamás en el código del cliente) y devuelve
 * la URL directa https://i.ibb.co/... que el panel guarda en Firestore.
 * Seguridad: requiere sesión verificada con custom claim role='admin'
 * (mismo criterio que las reglas isAdmin() y el resto de cores admin).
 * 5.112-C: la subida pasa por imgbbConReintentos (lib/imgbb.ts) — 3 intentos
 * contra caídas del hosting (red, 5xx, 429) con tope de 5 s por intento
 * (antes este core podía quedar colgado indefinidamente) y mensaje honesto
 * al agotarse los intentos.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import { imgbbConReintentos } from './lib/imgbb';
import type { CoreCtx } from './lib/ctx';

/** Tope de seguridad en base64 (~5.5M chars ≈ 4 MB de imagen real). */
const MAX_BASE64 = 5_500_000;

export async function coreUploadImage(ctx: CoreCtx): Promise<{ url: string; deleteUrl: string }> {
  // Ronda 3: gerente también gestiona fotos del catálogo.
  const role = ctx.auth?.token['role'];
  if (!ctx.auth || (role !== 'admin' && role !== 'gerente')) {
    throw new HttpsError('permission-denied', 'Solo el administrador o gerente puede subir imágenes.');
  }

  const image = typeof ctx.data?.['image'] === 'string' ? String(ctx.data['image']).trim() : '';
  if (!image) {
    throw new HttpsError('invalid-argument', 'Falta la imagen (campo image).');
  }
  if (image.length > MAX_BASE64) {
    throw new HttpsError('invalid-argument', 'La imagen es demasiado grande.');
  }

  const key = process.env['IMGBB_API_KEY'] ?? '';
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'Falta IMGBB_API_KEY en Netlify (Environment variables). Créala y vuelve a desplegar.',
    );
  }

  // 5.112-C: la subida (con sus 3 intentos y su tope de 5 s por intento)
  // vive en lib/imgbb.ts, compartida con fn-uploadImage y el comprobante
  // del checkout. La respuesta válida siempre trae https://…
  return imgbbConReintentos(key, image);
}