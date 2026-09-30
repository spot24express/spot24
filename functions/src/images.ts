/**
 * SPOT 24 · Core de subida de imágenes a hosting externo (imgbb).
 * Plan Spark sin Storage: el archivo no vive en Firebase; el servidor lo
 * reenvía a la API de imgbb (cuenta gratuita del negocio) con la clave
 * IMGBB_API_KEY (Netlify env var, jamás en el código del cliente) y devuelve
 * la URL directa https://i.ibb.co/... que el panel guarda en Firestore.
 * Seguridad: requiere sesión verificada con custom claim role='admin'
 * (mismo criterio que las reglas isAdmin() y el resto de cores admin).
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { CoreCtx } from './lib/ctx';

/** Tope de seguridad en base64 (~5.5M chars ≈ 4 MB de imagen real). */
const MAX_BASE64 = 5_500_000;

interface ImgbbPayload {
  success?: { code?: number };
  data?: {
    url?: string;
    display_url?: string;
    image?: { url?: string };
    delete_url?: string;
  };
}

export async function coreUploadImage(ctx: CoreCtx): Promise<{ url: string; deleteUrl: string }> {
  if (!ctx.auth || ctx.auth.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo el administrador puede subir imágenes.');
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

  // imgbb acepta base64 por POST form-urlencoded (documentación oficial).
  const form = new URLSearchParams();
  form.set('key', key);
  form.set('image', image);

  let res: Response;
  try {
    res = await fetch('https://api.imgbb.com/1/upload', { method: 'POST', body: form });
  } catch {
    throw new HttpsError('unavailable', 'No se pudo contactar al servicio de imágenes; intenta de nuevo.');
  }
  if (!res.ok) {
    throw new HttpsError('internal', `El servicio de imágenes rechazó la subida (HTTP ${res.status}).`);
  }

  const payload = (await res.json().catch(() => null)) as ImgbbPayload | null;
  const url = payload?.data?.url || payload?.data?.image?.url || payload?.data?.display_url || '';
  if (!payload?.success?.code || !url) {
    throw new HttpsError('internal', 'El servicio de imágenes no devolvió URL; intenta de nuevo.');
  }
  // delete_url permite borrar la foto desde imgbb.com; se devuelve por si el
  // admin quiere conservarlo, la UI no depende de él.
  return { url, deleteUrl: String(payload?.data?.delete_url ?? '') };
}