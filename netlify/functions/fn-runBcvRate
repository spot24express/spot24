/**
 * SPOT 24 · GET /.netlify/functions/fn-runBcvRate?key=...
 * Disparo MANUAL de la actualización de la tasa BCV (diagnóstico FASE 4C):
 *  · Protegido por BCV_RUN_KEY (Netlify env var, jamás en el chat).
 *  · Ejecuta el MISMO core que la función programada @hourly.
 *  · Responde el estado real: tasa capturada o fuente 'fallback' + motivo.
 * Solo GET: se invoca pegando la URL en el navegador.
 */
import { timingSafeEqual, createHash } from 'node:crypto';
import { coreUpdateBcvRate, coreGetBcvRate } from '../../functions/src/rates';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** Comparación en tiempo constante vía SHA-256 (inmune a longitudes distintas). */
function safeEq(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'GET') {
      return json(405, { error: { code: 'invalid-argument', message: 'Usa GET en el navegador.' } });
    }
    const expected = process.env['BCV_RUN_KEY'] ?? '';
    if (!expected) {
      return json(
        503,
        { error: { code: 'unavailable', message: 'Configura BCV_RUN_KEY en Netlify (Environment variables) y redeploy.' } },
      );
    }
    const key = new URL(req.url).searchParams.get('key') ?? '';
    if (!safeEq(key, expected)) {
      return json(403, { error: { code: 'permission-denied', message: 'Clave inválida.' } });
    }
    // Mismo cuerpo que la función programada @hourly: si el fetch al BCV
    // falla, el core conserva la última tasa y marca source 'fallback'.
    await coreUpdateBcvRate();
    const state = await coreGetBcvRate({});
    return json(200, { result: state });
  } catch (e) {
    const code = String((e as { code?: string }).code ?? 'internal');
    const message = (e as Error).message ?? 'Error interno.';
    return json(500, { error: { code, message } });
  }
};