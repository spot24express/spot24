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
 * Sin CORS abierto: la PWA y las funciones viven en el mismo dominio.
 */
import * as admin from 'firebase-admin';
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

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function errorResponse(e: unknown): Response {
  const code = (e as { code?: string }).code ?? 'internal';
  const message =
    (e as { code?: string }).code
      ? String((e as Error).message ?? 'Error interno.')
      : 'Error interno.';
  const status = STATUS_BY_CODE[code] ?? 500;
  if (status >= 500) {
    // Nunca PII: solo el código y el tipo del error.
    console.error(`[${code}]`, (e as Error)?.name ?? 'Error');
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
