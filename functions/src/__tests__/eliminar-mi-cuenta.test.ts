/**
 * SPOT 24 · Ronda 5.112-D · Guardas de la baja propia (coreDeleteMyAccount).
 * · Sin sesión → unauthenticated: la baja exige sesión verificada (el
 *   frontend nunca llega aquí sin sesión; es defensa del backend).
 * · Personal (cajero/gerente/delivery/admin) → failed-precondition: las
 *   cuentas del personal NO se auto-eliminan desde la app. El mensaje
 *   explica el camino real: coordinar la baja con administración.
 * 5.112.1 · ACTUALIZADO: la reconstrucción idempotente de la baja ajustó
 * los textos de las guardas a la convención del resto del backend
 * («Sesión requerida.» es la guarda estándar en todas las funciones);
 * este test fija los textos VIGENTES (antes esperaba las redacciones
 * de la 5.112 original y fallaba por texto, no por comportamiento).
 */
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { coreDeleteMyAccount } from '../admin';
import type { CoreCtx } from '../lib/ctx';

/** Contexto de sesión autenticada con el rol dado (custom claim). */
function ctxCon(rol: string): CoreCtx {
  return {
    auth: { uid: 'staff-1', token: { role: rol } },
  } as unknown as CoreCtx;
}

/** Ejecuta la baja y captura el error lanzado (o null si respondió ok). */
async function errorDe(ctx: CoreCtx): Promise<HttpsError | null> {
  return (await coreDeleteMyAccount(ctx).catch((e) => e)) as HttpsError | null;
}

describe('coreDeleteMyAccount (5.112-D · guardas de la baja propia)', () => {
  it('sin sesión → unauthenticated (mensaje de sesión requerida)', async () => {
    const err = await errorDe({} as CoreCtx);
    expect(err).toBeInstanceOf(HttpsError);
    expect(err?.code).toBe('unauthenticated');
    expect(err?.message).toContain('Sesión requerida');
  });

  it('cajero → failed-precondition: el personal NO se da de baja desde la app', async () => {
    const err = await errorDe(ctxCon('cajero'));
    expect(err).toBeInstanceOf(HttpsError);
    expect(err?.code).toBe('failed-precondition');
  });

  it('admin → failed-precondition: el panel no puede quedarse sin dueño', async () => {
    const err = await errorDe(ctxCon('admin'));
    expect(err?.code).toBe('failed-precondition');
  });

  it('delivery → failed-precondition (todo el personal, mismo candado)', async () => {
    const err = await errorDe(ctxCon('delivery'));
    expect(err?.code).toBe('failed-precondition');
  });

  it('el mensaje al personal explica el camino real (coordinar la baja con administración)', async () => {
    const err = await errorDe(ctxCon('gerente'));
    expect(err?.message).toContain('coordina tu baja con administración');
  });
});