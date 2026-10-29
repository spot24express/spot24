/**
 * SPOT 24 · Parche imgbb (5.112-C) — subida al servicio de imágenes CON
 * REINTENTOS y mensaje honesto para el usuario.
 * ────────────────────────────────────────────────────────────────────
 * El 29/10/2026 imgbb (el hosting gratuito de TODAS las fotos del negocio)
 * sufrió una caída global (HTTP 503 «service unavailable»): la subida de
 * comprobantes y fotos del panel fallaba al primer intento y el Home veía
 * promos rotas. Este módulo concentra la subida en UNA función con:
 *
 * · 3 intentos por petición (1 original + 2 reintentos) con pausas de
 *   500 ms y 1,5 s. Reintenta SOLO caídas reales: error de red, HTTP 5xx
 *   y 429 (límite de tasa). Un 4xx (foto inválida) NO se reintenta: sería
 *   quemar tiempo con una foto que imgbb jamás aceptará.
 * · Tope de 5 s POR intento: el peor caso completo (~17 s) sigue dentro
 *   del timeout de 26 s de las funciones Netlify y del tope de 25 s del
 *   cliente (backend.ts). Antes cada sitio tenía su propio fetch suelto
 *   (15 s en orders.ts, SIN tope en images.ts): una imgbb colgada mataba
 *   la lambda o dejaba el checkout girando.
 * · Mensaje HONESTO y estable: cuando imgbb sigue caído tras los 3
 *   intentos se lanza 'unavailable' con un texto que EMPIEZA por «El
 *   servicio de imágenes está caído». backend.ts reconoce ese prefijo
 *   (mismo mecanismo del «Reserva vencida» de la ronda 5i-b) y lo mapea
 *   al código de app 'images': el cliente ve la verdad en el toast en
 *   lugar del genérico «Algo salió fuera de línea».
 *
 * Los tres puntos de subida del negocio pasan por aquí:
 * · functions/src/orders.ts (comprobante del cliente dentro de
 *   fn-createOrder y re-subida por fn-uploadReceipt).
 * · netlify/functions/fn-uploadImage.ts (fotos de productos/promos del
 *   panel, modo Lite Netlify).
 * · functions/src/images.ts (mismo core en modo Cloud Functions).
 */
import { HttpsError } from 'firebase-functions/v2/https';

export const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

/** Pausas entre intentos: 1º→2º 500 ms, 2º→3º 1,5 s. */
const ESPERAS_MS = [500, 1500] as const;

/** Tope de cada intento: imgbb sano responde en < 2 s. */
const TIMEOUT_POR_INTENTO_MS = 5_000;

/**
 * Mensaje honesto de caída. SU PREFIJO ES CONTRATO: backend.ts lo
 * reconoce (startsWith) para mapear el error al código 'images' de la
 * app. No cambiar el arranque del texto sin ajustar ese mapeo.
 */
export const MSG_IMGBB_CAIDO =
  'El servicio de imágenes está caído. Intenta de nuevo en unos minutos: tu carrito y tu comprobante están a salvo.';

/** Mensaje cuando imgbb respondió algo que no es una URL utilizable. */
export const MSG_IMGBB_RESPUESTA = 'imgbb no devolvió la dirección de la foto.';

/** Caída real (red, 5xx, 429): SÍ se reintenta. */
class CaidaImgbb extends Error {}

/** Rechazo definitivo (4xx o respuesta sin URL): NO se reintenta. */
class RechazoImgbb extends Error {
  constructor(readonly status: number) {
    super(`imgbb HTTP ${status}`);
  }
}

interface SubidaImgbb {
  url: string;
  deleteUrl: string;
}

interface RespuestaImgbb {
  success?: boolean | { code?: number };
  data?: {
    url?: string;
    display_url?: string;
    image?: { url?: string };
    delete_url?: string;
  };
}

function pausar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Un intento de subida. Lanza CaidaImgbb (reintentable) o RechazoImgbb (no). */
async function unIntento(key: string, image: string): Promise<SubidaImgbb> {
  let res: Response;
  try {
    res = await fetch(IMGBB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key, image }).toString(),
      signal: AbortSignal.timeout(TIMEOUT_POR_INTENTO_MS),
    });
  } catch {
    throw new CaidaImgbb(); // red caída o timeout del intento
  }
  if (!res.ok) {
    if (res.status >= 500 || res.status === 429) throw new CaidaImgbb();
    throw new RechazoImgbb(res.status);
  }
  const json = (await res.json().catch(() => null)) as RespuestaImgbb | null;
  const exito = json?.success === true || Boolean((json?.success as { code?: number } | undefined)?.code);
  const url = json?.data?.url || json?.data?.image?.url || json?.data?.display_url || '';
  if (!exito || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new RechazoImgbb(0); // respondió, pero sin foto utilizable
  }
  return { url, deleteUrl: String(json?.data?.delete_url ?? '') };
}

/**
 * Sube una imagen (base64 pelado) a imgbb con 3 intentos. Reintenta solo
 * caídas (red, 5xx, 429); un 4xx o una respuesta vacía falla al momento.
 * Errores finales:
 * · HttpsError('unavailable', MSG_IMGBB_CAIDO) — imgbb siguió caído.
 * · HttpsError('unavailable', 'imgbb rechazó la subida (HTTP N).') — 4xx.
 * · HttpsError('internal', MSG_IMGBB_RESPUESTA) — respondió sin URL.
 */
export async function imgbbConReintentos(key: string, image: string): Promise<SubidaImgbb> {
  for (let intento = 0; ; intento++) {
    try {
      return await unIntento(key, image);
    } catch (e) {
      if (e instanceof CaidaImgbb) {
        if (intento < ESPERAS_MS.length) {
          await pausar(ESPERAS_MS[intento] as number);
          continue;
        }
        throw new HttpsError('unavailable', MSG_IMGBB_CAIDO);
      }
      if (e instanceof RechazoImgbb) {
        if (e.status === 0) throw new HttpsError('internal', MSG_IMGBB_RESPUESTA);
        throw new HttpsError('unavailable', `imgbb rechazó la subida (HTTP ${e.status}).`);
      }
      throw e; // imprevisto: mismo tratamiento de siempre
    }
  }
}
