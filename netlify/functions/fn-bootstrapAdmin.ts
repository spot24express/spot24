/**
 * SPOT 24 · GET /.netlify/functions/fn-bootstrapAdmin?key=...&email=...
 * Bootstrap ÚNICO del primer admin (FASE 4, sin terminal):
 *  · Protegido por ADMIN_SETUP_KEY (Netlify env var) + marcador Firestore.
 *  · Tras usarlo, ELIMINAR ADMIN_SETUP_KEY en Netlify › Site configuration.
 * Solo GET: se invoca pegando la URL en el navegador.
 */
import { coreBootstrapFirstAdmin } from '../../functions/src/admin';
import type { CoreCtx } from '../../functions/src/lib/ctx';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'GET') {
      return json(405, { error: { code: 'invalid-argument', message: 'Usa GET en el navegador.' } });
    }
    const url = new URL(req.url);
    const ctx: CoreCtx = {
      data: {
        key: url.searchParams.get('key') ?? '',
        email: url.searchParams.get('email') ?? '',
      },
    };
    const result = await coreBootstrapFirstAdmin(ctx);
    return json(200, { result });
  } catch (e) {
    const code = String((e as { code?: string }).code ?? 'internal');
    const raw = (e as Error).message ?? 'Error interno.';
    const message = code.startsWith('auth/')
      ? 'No existe cuenta con ese email. Regístrate primero en la app.'
      : raw;
    return json(400, { error: { code, message } });
  }
};