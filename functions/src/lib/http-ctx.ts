/**
 * SPOT 24 · Adaptador HTTP para Netlify Functions (modo Lite, plan gratis).
 * Vive en functions/src para resolver firebase-admin/firebase-functions desde
 * functions/node_modules (también durante el bundling de Netlify).
 * Convierte peticiones HTTP en CoreCtx y ejecuta el core correspondiente:
 *  · Autenticación: header `Authorization: Bearer <ID token>` verificado con
 *    Admin SDK (checkRevoked=true, respeta la revocación por época, 5.3).
 *  · App Check: header `X-Firebase-AppCheck`; se exige SOLO si
 *    APPCHECK_ENFORCE=true (enfoque monitorear → exigir, 6.2).
 *  · Errores: HttpsError → HTTP status + JSON { error: { code, message } }.
 *    También normaliza errores CRUDOS de Firestore/Admin SDK que llegan con
 *    código gRPC NUMÉRICO (p. ej. 9 = FAILED_PRECONDITION por un índice
 *    compuesto faltante): antes escapaban como 500 «internal» opaco.
 * Sin CORS abierto: la PWA y las funciones viven en el mismo dominio.
 */
import admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './ctx';

/* ── Respuestas ── */

const STATUS_BY_CODE: Record<string, number> = {
  'invalid-argument': 400,
  'failed-precondition': 400,
  'out-of-range': 400,
  'unauthenticated': 401,
  'permission-denied': 403,
  'not-found': 404,
  'already-exists': 409,
  'resource-exhausted': 429,
  'internal': 500,
  'unavailable': 503,
};

/**
 * Códigos gRPC numéricos → nombre canónico. Firestore/Admin SDK (vía gRPC)
 * lanza errores crudos con `code` NUMÉRICO cuando falla algo por fuera de
 * nuestros HttpsError: índice compuesto faltante = 9, transacción abortada
 * tras reintentos = 10, caída de transporte = 14, etc. Sin esta tabla el
 * errorResponse los convertía SIEMPRE en 500 con un code inservible.
 */
const NAME_BY_GRPC: Record<number, string> = {
  1: 'unavailable',         // CANCELLED
  3: 'invalid-argument',    // INVALID_ARGUMENT
  4: 'unavailable',         // DEADLINE_EXCEEDED
  5: 'not-found',           // NOT_FOUND
  6: 'already-exists',      // ALREADY_EXISTS
  7: 'permission-denied',   // PERMISSION_DENIED
  8: 'resource-exhausted',  // RESOURCE_EXHAUSTED
  9: 'failed-precondition', // FAILED_PRECONDITION (p. ej. índice faltante)
  10: 'unavailable',        // ABORTED (transacción reintentada y vencida)
  11: 'out-of-range',       // OUT_OF_RANGE
  13: 'internal',           // INTERNAL
  14: 'unavailable',        // UNAVAILABLE
  15: 'internal',           // DATA_LOSS
  16: 'unauthenticated',    // UNAUTHENTICATED
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(e: unknown): Response {
  const rawCode = (e as { code?: unknown }).code;
  // Normalización: gRPC numérico → nombre canónico; string canónico → tal
  // cual; sin código → internal (error JS no controlado por nosotros).
  const code =
    typeof rawCode === 'number' && NAME_BY_GRPC[rawCode]
      ? NAME_BY_GRPC[rawCode]
      : typeof rawCode === 'string' && rawCode
        ? rawCode
        : 'internal';
  // Con código (nuestro HttpsError o un Firestore crudo) el mensaje SÍ viaja:
  // Firestore incluye datos accionables (p. ej. el link para crear un índice).
  // Sin código es un error interno genuino: mensaje genérico, nada se filtra.
  const message =
    rawCode !== undefined ? String((e as Error).message ?? 'Error interno.') : 'Error interno.';
  const status = STATUS_BY_CODE[code] ?? 500;
  if (status >= 500) {
    // Nunca PII: código + tipo + mensaje accionable. Nuestros mensajes son
    // estáticos y sin secretos; así el log de Netlify dice QUÉ falló.
    console.error(`[${code}]`, (e as Error)?.name ?? 'Error', '-', (e as Error)?.message ?? '');
    // Stack completo (SOLO log, jamás en la respuesta): localiza archivo y
    // línea exacta del fallo en la terminal de netlify dev.
    if ((e as Error)?.stack) console.error(`[${code}] stack:`, (e as Error).stack);
  }
  return json(status, { error: { code, message } });
}

/* ── Contexto ── */

async function buildCtx(req: Request): Promise<CoreCtx> {
  const authHeader = req.headers.get('authorization') ?? '';
  let auth: CoreCtx['auth'];
  if (authHeader.startsWith('Bearer ')) {
    const idToken = authHeader.slice(7).trim();
    if (idToken) {
      const decoded = await admin.auth(getAdminApp()).verifyIdToken(idToken, true);
      auth = { uid: decoded.uid, token: decoded as DecodedIdToken };
    }
  }

  let appCheckData: CoreCtx['app'];
  const acHeader = req.headers.get('x-firebase-appcheck');
  if (acHeader && process.env['APPCHECK_ENFORCE'] === 'true') {
    try {
      const { getAppCheck } = await import('firebase-admin/app-check');
      const verified = await getAppCheck(getAdminApp()).verifyToken(acHeader);
      appCheckData = { appId: verified.appId, token: String(verified.token) };
    } catch {
      throw new HttpsError('permission-denied', 'App Check inválido.');
    }
  } else if (acHeader) {
    // Modo monitoreo: se recibe pero no se exige; se registra sin PII.
    console.warn('appcheck-monitor: token presente');
  }

  let data: Record<string, unknown> = {};
  try {
    const body = (await req.json()) as { data?: unknown } | null;
    if (body && typeof body === 'object' && body['data'] && typeof body['data'] === 'object') {
      data = body['data'] as Record<string, unknown>;
    }
  } catch {
    data = {};
  }
  return { auth, app: appCheckData, data };
}

export type Core = (ctx: CoreCtx) => Promise<unknown>;

/** Ejecuta un core con la petición HTTP convertida a CoreCtx (POST). */
export async function handle(core: Core, req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') {
      throw new HttpsError('invalid-argument', 'Método no permitido.');
    }
    const ctx = await buildCtx(req);
    const result = await core(ctx);
    return json(200, { result: result ?? { ok: true } });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Variante pública (sin sesión): acepta GET sin cuerpo o POST con data. */
export async function handlePublic(core: Core, req: Request): Promise<Response> {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      throw new HttpsError('invalid-argument', 'Método no permitido.');
    }
    let data: Record<string, unknown> = {};
    if (req.method === 'POST') {
      try {
        const body = (await req.json()) as { data?: unknown } | null;
        if (body && typeof body['data'] === 'object' && body['data'] !== null) {
          data = body['data'] as Record<string, unknown>;
        }
      } catch {
        data = {};
      }
    }
    const result = await core({ data });
    return json(200, { result: result ?? { ok: true } });
  } catch (e) {
    return errorResponse(e);
  }
}