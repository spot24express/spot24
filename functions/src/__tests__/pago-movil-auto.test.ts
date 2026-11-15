/**
 * SPOT 24 · Ronda 5.113 — coreCheckPagoMovil (validación automática del pago
 * móvil contra BDV). Firestore de mentira en memoria (mismo estilo que
 * dispatch-transaction.test.ts) + fetch simulado. Fija las guardas: suiche
 * del dueño, claves en el servidor, idempotencia de referencias y el
 * mensaje honesto cuando el banco no ve el pago.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCtx } from '../lib/ctx';
import { coreCheckPagoMovil, pagoRefId } from '../pagoMovil';

/* ─────────────── Firestore de mentira (store en memoria) ─────────────── */

const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>;
  const store = new Map<string, Doc>();

  function makeRef(segments: string[]) {
    const path = segments.join('/');
    return {
      id: segments[segments.length - 1],
      path,
      collection: (sub: string) => makeRef([...segments, sub]),
      doc: (id?: string) => makeRef([...segments, id ?? `x-${Math.random().toString(36).slice(2, 9)}`]),
      get: async () => {
        const data = store.get(path);
        return { exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref: makeRef(segments) };
      },
    };
  }

  const firestoreInstance = {
    collection: (name: string) => makeRef([name]),
    doc: (p: string) => makeRef(p.split('/')),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        async get(ref: { path: string }) {
          const data = store.get(ref.path);
          return { exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref };
        },
        set(ref: { path: string }, data: Doc): void {
          store.set(ref.path, { ...data });
        },
        update(ref: { path: string }, patch: Doc): void {
          store.set(ref.path, { ...(store.get(ref.path) ?? {}), ...patch });
        },
      }),
  };

  const firestoreFn = Object.assign(() => firestoreInstance, {
    FieldValue: { increment: (n: number) => ({ __op: 'increment', by: n }) },
  });

  return { store, firestoreFn, reset(seed: Record<string, Doc>): void { store.clear(); for (const [k, v] of Object.entries(seed)) store.set(k, v); } };
});

vi.mock('firebase-admin', () => ({ default: { firestore: h.firestoreFn } }));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return { HttpsError, onCall: () => undefined };
});
vi.mock('../lib/ctx', () => ({ getAdminApp: () => ({}) }));
vi.mock('../lib/ratelimit', () => ({ tryRateLimit: async () => {}, enforceRateLimit: async () => {} }));
vi.mock('../payments', () => ({ writeAudit: vi.fn(async () => {}) }));

/* ─────────────────────────── datos y contextos ─────────────────────────── */

const TEL_DESTINO = '04220337872';
const SETTINGS_ON = { 'settings/general': { pagoMovilAuto: true, pagoMovilTelefono: TEL_DESTINO, ivaPercent: 0 } };
const SETTINGS_OFF = { 'settings/general': { ivaPercent: 0 } };

function ctxCliente(data?: Record<string, unknown>): CoreCtx {
  return { auth: { uid: 'cli-1', token: { role: 'customer' } }, data } as unknown as CoreCtx;
}

function datosPago(importe = 120): Record<string, unknown> {
  return {
    referencia: '123112313',
    cedulaPagador: 'V27037606',
    telefonoPagador: '04127141363',
    bancoOrigen: '(0102) Banco de Venezuela',
    fechaPago: '2026-10-29',
    importe,
  };
}

const bdvOk = (): Response =>
  new Response(
    JSON.stringify({ code: 1000, message: 'Monto: 120.00 - estatus : Transaccion realizada', data: { status: '1000', amount: '120.00', reason: 'Transaccion realizada' }, status: 200 }),
    { status: 200 },
  );
const bdvNoExiste = (): Response =>
  new Response(
    JSON.stringify({ code: 1010, message: 'No se pudo validar el movimiento: Registro solicitado no existe', data: null, status: 200 }),
    { status: 200 },
  );

beforeEach(() => {
  h.reset(SETTINGS_ON);
  process.env['BDV_CONCILIACION_URL'] = 'http://200.11.243.176:444/getMovement';
  process.env['BDV_API_KEY'] = 'clave-de-calidad';
  vi.stubGlobal('fetch', vi.fn(async () => bdvOk()));
});

describe('5.113 · guardas de coreCheckPagoMovil', () => {
  it('sin sesión → unauthenticated («Sesión requerida.»)', async () => {
    await expect(coreCheckPagoMovil({} as CoreCtx)).rejects.toMatchObject({
      code: 'unauthenticated',
      message: 'Sesión requerida.',
    });
  });

  it('suiche del dueño APAGADO → failed-precondition (la app sigue como hoy)', async () => {
    h.reset(SETTINGS_OFF);
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('suiche ON sin teléfono de recaudo → failed-precondition accionable', async () => {
    h.reset({ 'settings/general': { pagoMovilAuto: true } });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sin claves del conciliador en el servidor → unavailable honesto (camino manual)', async () => {
    delete process.env['BDV_API_KEY'];
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });

  it('datos incompletos del formulario → invalid-argument sin gastar el banco', async () => {
    const d = datosPago();
    delete d['fechaPago'];
    await expect(coreCheckPagoMovil(ctxCliente(d))).rejects.toMatchObject({ code: 'invalid-argument' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('5.113 · validación feliz y candado de referencias', () => {
  it('pago confirmado: BDV 1000 → evidencia + llave en pagoRefs (used: false)', async () => {
    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as { ok: boolean; evidencia: Record<string, unknown> };

    expect(out.ok).toBe(true);
    expect(out.evidencia['referencia']).toBe('123112313');
    expect(out.evidencia['importe']).toBe(120);
    expect(out.evidencia['telefonoDestino']).toBe(TEL_DESTINO);

    const llave = h.store.get(`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`);
    expect(llave).toMatchObject({ uid: 'cli-1', importe: 120, used: false });
  });

  it('el importe viaja con punto decimal y el banco con código de 4 dígitos', async () => {
    await coreCheckPagoMovil(ctxCliente(datosPago(85.5)));
    const calls = (fetch as unknown as { mock: { calls: Array<[string, { body: string }]> } }).mock.calls;
    const body = JSON.parse(String(calls[0]![1].body)) as Record<string, string>;
    expect(body['importe']).toBe('85.50');
    expect(body['bancoOrigen']).toBe('0102');
    expect(body['telefonoDestino']).toBe(TEL_DESTINO);
  });

  it('reintento de la MISMA referencia + uid + importe → evidencia repetida SIN re-consultar al banco', async () => {
    await coreCheckPagoMovil(ctxCliente(datosPago()));
    (fetch as ReturnType<typeof vi.fn>).mockClear();

    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as { repetida: boolean };
    expect(out.repetida).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('la misma referencia por OTRO uid → already-exists (nadie roba un pago ajeno)', async () => {
    h.reset({ ...SETTINGS_ON, [`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`]: { uid: 'otro-1', importe: 120, used: false } });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({ code: 'already-exists' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('la misma referencia ya USADA en un pedido → already-exists (jamás paga dos veces)', async () => {
    h.reset({ ...SETTINGS_ON, [`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`]: { uid: 'cli-1', importe: 120, used: true } });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({ code: 'already-exists' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('la misma referencia con OTRO importe → already-exists (una referencia, un pago)', async () => {
    h.reset({ ...SETTINGS_ON, [`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`]: { uid: 'cli-1', importe: 100, used: false } });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago(120)))).rejects.toMatchObject({ code: 'already-exists' });
  });
});

describe('5.113 · cuando el banco no ve el pago', () => {
  it('code 1010 → failed-precondition con mensaje honesto; sin llave en pagoRefs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => bdvNoExiste()));

    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(h.store.get(`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`)).toBeUndefined();
  });

  it('banco caído (red) → unavailable: el checkout ofrece el camino manual', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});

/* ── 5.142 · RESPALDO DE CUENTA ÚNICA ──────────────────────────────────────
 * settings/general puede llegar SIN pagoMovilTelefono (un guardado de
 * Operación con el suiche apagado escribe el bloque completo y antes lo
 * dejaba vacío): si hay EXACTAMENTE UNA cuenta de pago móvil ACTIVA en
 * settings/payment_accounts, esa es la que concilia el banco y la
 * validación automática DEBE funcionar con su teléfono. Con varias cuentas
 * (ambigüedad real) sigue el rechazo accionable. */
describe('5.142 · respaldo de cuenta única para el teléfono de recaudo', () => {
  const CUENTA_BDV: Record<string, unknown> = {
    id: 'pm',
    method: 'pago_movil',
    active: true,
    bank: 'Banco de Venezuela',
    phone: TEL_DESTINO,
  };

  it('settings SIN teléfono + UNA cuenta de pago móvil activa → valida con el teléfono de la cuenta', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true, ivaPercent: 0 },
      'settings/payment_accounts': { accounts: [CUENTA_BDV] },
    });
    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as {
      ok: boolean;
      evidencia: Record<string, unknown>;
    };
    expect(out.ok).toBe(true);
    expect(out.evidencia['telefonoDestino']).toBe(TEL_DESTINO);
    expect(h.store.get(`pagoRefs/${pagoRefId(TEL_DESTINO, '123112313')}`)).toMatchObject({
      uid: 'cli-1',
      importe: 120,
      used: false,
    });
  });

  it('el teléfono de la cuenta con formato (guiones) se normaliza igual', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true },
      'settings/payment_accounts': { accounts: [{ ...CUENTA_BDV, phone: '0422-0337872' }] },
    });
    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as { ok: boolean };
    expect(out.ok).toBe(true);
  });

  it('documento viejo sin el campo active → cuenta como ACTIVA (criterio del checkout)', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true },
      'settings/payment_accounts': { accounts: [{ ...CUENTA_BDV, active: undefined }] },
    });
    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as { ok: boolean };
    expect(out.ok).toBe(true);
  });

  it('settings SIN teléfono + 2 cuentas de pago móvil activas → rechazo honesto (ambigüedad)', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true },
      'settings/payment_accounts': {
        accounts: [CUENTA_BDV, { ...CUENTA_BDV, id: 'pm2', phone: '04129998877' }],
      },
    });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toThrow('varias cuentas');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cuenta INACTIVA (active: false) NO respalda → rechazo como siempre', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true },
      'settings/payment_accounts': { accounts: [{ ...CUENTA_BDV, active: false }] },
    });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toThrow('teléfono de recaudo');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cuenta activa con teléfono INVÁLIDO no respalda → rechazo', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true },
      'settings/payment_accounts': { accounts: [{ ...CUENTA_BDV, phone: '123' }] },
    });
    await expect(coreCheckPagoMovil(ctxCliente(datosPago()))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('el teléfono de settings SIEMPRE manda si existe (el respaldo no lo pisa)', async () => {
    h.reset({
      'settings/general': { pagoMovilAuto: true, pagoMovilTelefono: TEL_DESTINO },
      'settings/payment_accounts': { accounts: [{ ...CUENTA_BDV, phone: '04129998877' }] },
    });
    const out = (await coreCheckPagoMovil(ctxCliente(datosPago()))) as {
      ok: boolean;
      evidencia: Record<string, unknown>;
    };
    expect(out.ok).toBe(true);
    expect(out.evidencia['telefonoDestino']).toBe(TEL_DESTINO);
  });
});
