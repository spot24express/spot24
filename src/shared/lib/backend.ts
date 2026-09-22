/**
 * SPOT 24 · Modo de backend y transporte de funciones.
 * ────────────────────────────────────────────────────────────────────
 * · DEMO_MODE se activa cuando no hay credenciales VITE_FIREBASE_*: la app
 *   navega completa con datos semilla locales (catálogo, carrito, checkout
 *   simulado) para desarrollo, previews y demostraciones sin datos reales.
 * · En modo real, TODAS las operaciones sensibles van por HTTP a las
 *   Netlify Functions del propio dominio (/.netlify/functions/*), que
 *   ejecutan la misma lógica de negocio que los callables de Cloud Functions:
 *   token de sesión Bearer + header App Check + errores canónicos.
 * · STORAGE_AVAILABLE indica si hay bucket de Storage configurado; en el
 *   plan Spark (sin tarjeta) no lo hay y la UI oculta la subida de archivos.
 */
import { isFirebaseConfigured, loadFirebase, type FirebaseBundle } from './firebase';
import { AppError } from './errors';
import { logger } from './logger';

export const DEMO_MODE: boolean = !isFirebaseConfigured();

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

/** Mapea el error canónico del servidor a un AppError de la app. */
function toAppError(code: string): AppError {
  if (code.includes('unauthenticated')) return new AppError('unauthenticated');
  if (code.includes('permission-denied') || code.includes('failed-precondition')) return new AppError('forbidden');
  if (code.includes('resource-exhausted')) return new AppError('rate-limit');
  if (code.includes('out-of-range')) return new AppError('stock');
  return new AppError('generic');
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
    throw toAppError(code);
  }
  return payload.result as TRes;
}
