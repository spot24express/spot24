/**
 * SPOT 24 · Ronda 5.133 · Wrapper HTTP de fn-shareImage (puente de imágenes).
 *
 * ÚNICA función que NO pasa por `handle` de _backend: no es una API JSON sino
 * un pasamanos de bytes. El cliente pide
 *
 *   GET /.netlify/functions/fn-shareImage?url=<url-original>
 *
 * y esta función baja la foto del origen autorizado (lista blanca en
 * functions/src/shareImage.ts) y la re-sirve same-origin con su Content-Type
 * original. Sin base64 ni JSON: la respuesta entra directo al blob de
 * cargarArchivoImagen (resp.ok → type image/* → ≤ 4 MB), así que la lógica de
 * compartir queda intacta y el SW no intercepta la respuesta (ninguna regla
 * runtimeCaching coincide con /.netlify/).
 */
import { esUrlDePuente, MAX_BYTES_PUENTE } from '../../functions/src/shareImage';

const TIEMPO_LIMITE_MS = 8000; // margen dentro del timeout de 10s de Netlify
const UA = 'Mozilla/5.0 (compatible; Spot24PWA)';

function respuestaError(status: number, mensaje: string): Response {
  return new Response(JSON.stringify({ error: mensaje }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default async (req: Request): Promise<Response> => {
  if (req.method !== 'GET') {
    return respuestaError(405, 'Método no permitido');
  }

  const destino = new URL(req.url).searchParams.get('url') ?? '';
  if (!esUrlDePuente(destino)) {
    // Lista blanca estricta: lo que no sea https + dominio exacto → fuera.
    // El puente NO es un proxy abierto.
    return respuestaError(403, 'URL no autorizada');
  }

  try {
    const upstream = await fetch(destino, {
      headers: { 'User-Agent': UA, Accept: 'image/*' },
      signal: AbortSignal.timeout(TIEMPO_LIMITE_MS),
    });

    if (upstream.status === 404) {
      return respuestaError(404, 'Imagen no encontrada');
    }
    if (!upstream.ok) {
      return respuestaError(502, 'La imagen no está disponible');
    }

    const tipo = (upstream.headers.get('content-type') ?? '').split(';')[0]?.trim() ?? '';
    if (!tipo.startsWith('image/')) {
      return respuestaError(415, 'El origen no devolvió una imagen');
    }

    const largo = Number(upstream.headers.get('content-length') ?? '0');
    if (Number.isFinite(largo) && largo > MAX_BYTES_PUENTE) {
      return respuestaError(413, 'Imagen demasiado grande');
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': tipo,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    // Timeout del AbortSignal o error de red hacia el origen.
    return respuestaError(504, 'No se pudo bajar la imagen a tiempo');
  }
};