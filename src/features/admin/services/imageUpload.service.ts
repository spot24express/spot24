/**
 * Subida de imágenes del panel → fn-uploadImage (Netlify) → imgbb.
 * · El cliente comprime antes de enviar (máx 1600px, JPEG 0.85).
 * · La clave IMGBB_API_KEY vive SOLO en el servidor (Netlify). Jamás aquí.
 * · Nunca lanza: siempre devuelve { ok } con mensaje amable para la UI.
 */
import { callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';

const MAX_INPUT_MB = 12;
const MAX_DIM = 1600;
const PASS_THROUGH_BYTES = 350 * 1024; // ≤350KB: se envía tal cual
const MAX_BASE64 = 5_000_000; // tope del servidor: 5.5M chars

export type UploadResult = { ok: true; url: string } | { ok: false; message: string };

/** Carga la imagen en un bitmap (createImageBitmap con respaldo a Image). */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file);
    } catch { /* respaldo abajo */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('load'));
      img.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Re-comprime a JPEG (o pasa tal cual si ya es liviana). */
async function compressToJpeg(file: File): Promise<Blob> {
  if (file.size <= PASS_THROUGH_BYTES) return file;
  const bmp = await loadBitmap(file);
  const w = 'width' in bmp ? bmp.width : 0;
  const h = 'height' in bmp ? bmp.height : 0;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, cw, ch);
  if ('close' in bmp) (bmp as ImageBitmap).close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error('encode');
  return blob;
}

/** Sube una foto del admin y devuelve la URL pública (i.ibb.co). */
export async function adminUploadImage(file: File): Promise<UploadResult> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return { ok: false, message: 'Elige una foto normal (JPG, PNG o WebP). Los SVG no se admiten por seguridad.' };
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      return { ok: false, message: `La foto pasa de ${MAX_INPUT_MB} MB. Tómala con menos resolución o elige otra.` };
    }
    const blob = await compressToJpeg(file);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('read'));
      reader.readAsDataURL(blob);
    });
    const image = base64.slice(base64.indexOf(',') + 1);
    if (!image || image.length > MAX_BASE64) {
      return { ok: false, message: 'La foto quedó muy grande incluso comprimida. Prueba con una de menos resolución.' };
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