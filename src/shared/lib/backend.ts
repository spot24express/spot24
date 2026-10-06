/**
 * SPOT 24 · Transporte de funciones de servidor.
 * ────────────────────────────────────────────────────────────────────
 * TODAS las operaciones sensibles van por HTTP a las Netlify Functions del
 * propio dominio (/.netlify/functions/*), que ejecutan la misma lógica de
 * negocio que los callables de Cloud Functions: token de sesión Bearer +
 * header App Check + errores canónicos.
 * · STORAGE_AVAILABLE indica si hay bucket de Storage configurado; en el
 *   plan Spark (sin tarjeta) no lo hay y la UI oculta la subida de archivos.
 */
import { loadFirebase, type FirebaseBundle } from './firebase';
import { AppError, type AppErrorCode } from './errors';
import { logger } from './logger';

/** true solo si hay bucket de Storage (plan Blaze). En Lite es false. */
export const STORAGE_AVAILABLE: boolean = Boolean(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET);

/** Base de las funciones de servidor (mismo dominio, sin CORS). */
const FUNCTIONS_BASE = '/.netlify/functions';

/**
 * Obtiene el token App Check actual; null si App Check no está configurado
 * o aún no hay token (modo monitoreo: la petición sigue sin el header).
 */
async function appCheckToken(): Promise<string | null> {
  try {
    const { getAppCheckToken } = await import('./appCheck');
    return await getAppCheckToken();
  } catch {
    return null;
  }
}

/** Mapea el error canónico del servidor a un AppError de la app.
 *  El mensaje accionable del servidor (si lo hay) viaja como detalle técnico:
 *  userMessage() lo ignora, así la UI de cliente no cambia; los flujos de
 *  administrador pueden optar por mostrarlo (p. ej. config faltante). */
function toAppError(code: string, serverMessage?: string): AppError {
  let mapped: AppErrorCode = 'generic';
  if (code.includes('unauthenticated')) mapped = 'unauthenticated';
  else if (code.includes('permission-denied') || code.includes('failed-precondition')) {
    // Ronda 5i-b: la reserva vencida viaja como failed-precondition y el
    // cliente TIENE un código propio para ella ('reservation': CheckoutPage
    // re-reserva y pide confirmar de nuevo), pero nunca se mapeaba → el
    // cliente veía el genérico «No tienes acceso a esta área.» (mismo vicio
    // que el 5g corrigió en AdminPaymentsPage).
    mapped = serverMessage?.startsWith('Reserva vencida') ? 'reservation' : 'forbidden';
  }
  else if (code.includes('resource-exhausted')) mapped = 'rate-limit';
  else if (code.includes('out-of-range')) mapped = 'stock';
  return new AppError(mapped, serverMessage);
}

export interface CallOptions {
  /** true: la operación funciona sin sesión (p. ej. tasa BCV). */
  public?: boolean;
}

/**
 * Llama a una función de servidor del mismo dominio y devuelve `result`.
 * Lanza AppError con el significado del código canónico del backend.
 */
export async function callFunction<TRes = unknown>(
  name: string,
  data?: unknown,
  options?: CallOptions,
): Promise<TRes> {
  const fb: FirebaseBundle | null = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!options?.public) {
    const idToken = await fb.auth.currentUser?.getIdToken();
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
  }
  const ac = await appCheckToken();
  if (ac) headers['X-Firebase-AppCheck'] = ac;

  let res: Response;
  try {
    res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: data ?? {} }),
      // Red de seguridad UI: si la función no responde abortamos y la
      // interfaz muestra error accionable en vez de quedarse colgada.
      // Ronda 5i-c: en DEV el tope sube a 60 s. netlify dev ejecuta las
      // funciones EN SERIE (1 worker lambda-compat): la 2ª petición queda
      // EN COLA detrás de la 1ª y su tiempo real = espera + ejecución
      // (aquí: reserveStock 28 s + quoteTotals 5 s = 33 s, ambas «200») →
      // el tope de 25 s abortaba respuestas que el servidor SÍ procesó y
      // convertía reintentos seguros en errores fantasmas. En producción no
      // hay cola y el arranque en frío es 1-3 s: se mantienen 25 s.
      // (fn-uploadReceipt tiene 15 s internos de imgbb → margen suficiente.)
      signal: AbortSignal.timeout(import.meta.env.DEV ? 60_000 : 25_000),
    });
  } catch (e) {
    // Ronda 5i-b: este catch solo ve fallos de RED o del timeout (25 s en
    // prod, 60 s en dev). AbortSignal.timeout lanza un DOMException que en
    // consola serializa como
    // «{}» (inútil para diagnosticar). Motivo legible:
    // · TimeoutError/AbortError → el servidor no respondió a tiempo. En
    //   netlify dev la 1ª llamada tras reiniciar (arranque en frío) puede
    //   tardar 10-30 s y el servidor SÍ la procesa: la respuesta 200 llegó a
    //   un cliente que ya había colgado. Reintentar es seguro.
    // · Cualquier otro → red caída/offline.
    const err = e as { name?: string; message?: string };
    const esTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    logger.warn(`fn ${name} inaccesible`, {
      motivo: esTimeout
        ? 'sin respuesta a tiempo (timeout del cliente; en netlify dev suele ser el arranque en frío tras reiniciar). Reintenta.'
        : err?.message || String(e),
    });
    throw new AppError('offline');
  }

  const payload = (await res.json().catch(() => null)) as
    | { result?: TRes; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok || !payload || payload.error) {
    const code = payload?.error?.code ?? '';
    // Ronda 5i: el mensaje REAL del servidor viaja en la respuesta HTTP
    // («Sin stock suficiente.», «Variante inexistente.», etc.). Antes solo
    // se registraba el código y diagnosticar un 400 obligaba a adivinar.
    // El mensaje es estático y sin PII (lo controla nuestro propio backend).
    logger.warn(`fn ${name} falló`, {
      code: code || res.status,
      motivo: payload?.error?.message ?? '(sin mensaje del servidor)',
    });
    throw toAppError(code, payload?.error?.message);
  }
  return payload.result as TRes;
}