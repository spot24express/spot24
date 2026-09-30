/**
 * SPOT 24 · Subida de imágenes del panel (promos, categorías, productos).
 * Flujo (plan gratis, sin Firebase Storage):
 *  1. El admin elige la foto → el navegador la comprime (máx 1600 px, JPEG).
 *  2. Se envía a la función fn-uploadImage del propio dominio (solo admin).
 *  3. El servidor la sube a imgbb con la clave IMGBB_API_KEY guardada en
 *     Netlify — la clave JAMÁS vive en el código del navegador.
 *  4. Devuelve la URL directa https://i.ibb.co/… lista para el formulario.
 */
import { callFunction } from '@/shared/lib/backend';

/** Tope de la foto original que acepta el selector (las cámaras sacan 3-8 MB). */
const MAX_INPUT_MB = 12;
/** Lado mayor tras comprimir: sobra calidad y pesa poco. */
const MAX_DIM = 1600;
/** Las fotos de ~350 KB hacia abajo pasan tal cual (ya están comprimidas). */
const PASS_THROUGH_BYTES = 350 * 1024;
/** Tope base64 que el servidor acepta (deja margen al payload de Netlify). */
const MAX_BASE64 = 5_000_000;

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/** Convierte un Blob a base64 pelado (sin el prefijo data:…). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? '');
      const comma = data.indexOf(',');
      resolve(comma >= 0 ? data.slice(comma + 1) : data);
    };
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
}

/** Carga la imagen y la reescala a JPEG (mantiene la orientación de la cámara). */
async function compressToJpeg(file: File): Promise<Blob> {
  if (file.size <= PASS_THROUGH_BYTES) return file; // ya es ligera

  let width = 0;
  let height = 0;
  let source: ImageBitmap | HTMLImageElement;
  try {
    const bitmap = await createImageBitmap(file);
    width = bitmap.width;
    height = bitmap.height;
    source = bitmap;
  } catch {
    // Respaldo para navegadores sin createImageBitmap.
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode'));
      img.src = url;
    });
    width = img.naturalWidth;
    height = img.naturalHeight;
    source = img;
  }

  const scale = Math.min(1, MAX_DIM / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const out = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  return out ?? file;
}

/**
 * Sube una imagen elegida por el admin y devuelve la URL pública lista para
 * guardar. Nunca lanza: responde { ok:false, message } para que el panel
 * muestre el motivo exacto en el toast.
 */
export async function adminUploadImage(file: File): Promise<UploadResult> {
  try {
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return { ok: false, message: 'Ese archivo no es una foto. Sube JPG o PNG.' };
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      return { ok: false, message: `La foto supera ${MAX_INPUT_MB} MB. Elige una más ligera.` };
    }
    const blob = await compressToJpeg(file);
    const base64 = await blobToBase64(blob);
    if (base64.length > MAX_BASE64) {
      return { ok: false, message: 'La imagen sigue siendo muy grande. Prueba con otra más pequeña.' };
    }
    const res = await callFunction<{ url: string; deleteUrl: string }>('fn-uploadImage', { image: base64 });
    if (!res?.url) {
      return { ok: false, message: 'El servicio de imágenes no respondió. Intenta de nuevo.' };
    }
    return { ok: true, url: res.url };
  } catch {
    return { ok: false, message: 'No se pudo subir la imagen. Revisa tu conexión e intenta de nuevo.' };
  }
}