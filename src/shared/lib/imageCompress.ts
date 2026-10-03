/**
 * SPOT 24 · Compresión de imágenes en el cliente (compartida).
 * La usan el panel admin (productos, categorías, promos) y la subida del
 * comprobante de pago del cliente. Todo local: canvas → JPEG.
 * · El cliente comprime ANTES de enviar: la función de servidor recibe base64.
 * · La clave IMGBB vive SOLO en el servidor; aquí jamás.
 */

export const MAX_INPUT_MB = 12;
const PASS_THROUGH_BYTES = 350 * 1024; // ≤350KB: se envía tal cual
export const MAX_BASE64 = 5_000_000; // tope defensivo (el servidor admite 5.5M)

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
async function compressToJpeg(file: File, maxDim: number, quality: number): Promise<Blob> {
  if (file.size <= PASS_THROUGH_BYTES) return file;
  const bmp = await loadBitmap(file);
  const w = 'width' in bmp ? bmp.width : 0;
  const h = 'height' in bmp ? bmp.height : 0;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, cw, ch);
  if ('close' in bmp) (bmp as ImageBitmap).close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('encode');
  return blob;
}

/**
 * Archivo → base64 PURO (sin el prefijo data:), comprimido si hace falta.
 * Lanza Error('too-big') si incluso comprimida supera el tope del servidor.
 */
export async function fileToBase64(
  file: File,
  opts?: { maxDim?: number; quality?: number },
): Promise<string> {
  const blob = await compressToJpeg(file, opts?.maxDim ?? 1600, opts?.quality ?? 0.85);
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read'));
    reader.readAsDataURL(blob);
  });
  const bare = base64.slice(base64.indexOf(',') + 1);
  if (!bare || bare.length > MAX_BASE64) throw new Error('too-big');
  return bare;
}
