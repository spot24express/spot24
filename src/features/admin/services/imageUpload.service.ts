/**
 * Subida de imágenes del panel → fn-uploadImage (Netlify) → imgbb.
 * · El cliente comprime antes de enviar (máx 1600px, JPEG 0.85) con la
 *   librería compartida shared/lib/imageCompress.
 * · La clave IMGBB_API_KEY vive SOLO en el servidor (Netlify). Jamás aquí.
 * · Nunca lanza: siempre devuelve { ok } con mensaje amable para la UI.
 */
import { callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { MAX_INPUT_MB, fileToBase64 } from '@/shared/lib/imageCompress';

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Sube una foto del admin y devuelve la URL pública (i.ibb.co). */
export async function adminUploadImage(file: File): Promise<UploadResult> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return { ok: false, message: 'Elige una foto normal (JPG, PNG o WebP). Los SVG no se admiten por seguridad.' };
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      return { ok: false, message: `La foto pasa de ${MAX_INPUT_MB} MB. Tómala con menos resolución o elige otra.` };
    }
    let image: string;
    try {
      image = await fileToBase64(file);
    } catch (e) {
      if (e instanceof Error && e.message === 'too-big') {
        return { ok: false, message: 'La foto quedó muy grande incluso comprimida. Prueba con una de menos resolución.' };
      }
      return { ok: false, message: 'No pudimos leer la foto. Prueba con otra.' };
    }
    const res = await callFunction<{ url: string; deleteUrl: string }>('fn-uploadImage', { image });
    if (!res?.url) {
      return { ok: false, message: 'El servidor no devolvió la dirección de la foto. Reintenta en unos segundos.' };
    }
    return { ok: true, url: res.url };
  } catch (e) {
    // El servidor manda motivos accionables (p. ej. «IMGBB_API_KEY no
    // configurada…»). Si llegó uno real, muéstralo al admin; si no,
    // el mensaje amable de siempre.
    if (e instanceof AppError) {
      const s = e.message;
      if (s && s !== 'Error interno.' && s !== e.userMessage) return { ok: false, message: s };
    }
    return { ok: false, message: 'No pudimos subir la foto. Para. Resuelve. Sigue: reintenta en unos segundos.' };
  }
}
