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
  else if (code.includes('permission-denied') || code.includes('failed-precondition')) mapped = 'forbidden';
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
    });
  } catch (e) {
    logger.warn(`fn ${name} inaccesible`, e);
    throw new AppError('offline');
  }

  const payload = (await res.json().catch(() => null)) as
    | { result?: TRes; error?: { code?: string; message?: string } }
    | null;

  if (!res.ok || !payload || payload.error) {
    const code = payload?.error?.code ?? '';
    logger.warn(`fn ${name} falló`, code || res.status);
    throw toAppError(code, payload?.error?.message);
  }
  return payload.result as TRes;
}