/**
 * SPOT 24 · Ronda 5.113 — fn-createOrder con evidencias BDV (pago móvil
 * automático). Firestore de mentira en memoria. Fija las reglas nuevas SIN
 * tocar las viejas: el pedido nace «pagado» cuando las evidencias cubren el
 * total, nace «en_verificacion» con su evidencia si quedó corto (tasa que se
 * movió), y NO cambia NADA cuando el suiche está apagado (comprobante
 * obligatorio como siempre).
 * 5.114 · El nacimiento DIRECTO «pagado» avisa al cajero vía sendPaidAlert
 * (mock incluido) — y NUNCA por la cola de verificación.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCtx } from '../lib/ctx';
import { coreCreateOrder } from '../orders';

/* ─────────────── Firestore de mentira (store en memoria) ─────────────── */

const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>;
  const store = new Map<string, Doc>();

  function snapFor(segments: string[]) {
    const path = segments.join('/');
    const data = store.get(path);
    return {
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      get: (key: string) => (data ? (data as Record<string, unknown>)[key] : undefined),
      ref: makeRef(segments),
      id: segments[segments.length - 1],
      path,
    };
  }

  function makeRef(segments: string[]) {
    const path = segments.join('/');
    return {
      id: segments[segments.length - 1],
      path,
      parent: { parent: segments.length >= 3 ? { id: segments[segments.length - 3] } : null },
      collection: (sub: string) => makeRef([...segments, sub]),
      doc: (id?: string) => makeRef([...segments, id ?? `x-${Math.random().toString(36).slice(2, 9)}`]),
      get: async () => snapFor(segments),
    };
  }

  const firestoreInstance = {
    collection: (name: string) => makeRef([name]),
    doc: (p: string) => makeRef(p.split('/')),
    getAll: (...refs: Array<{ path: string }>) => Promise.all(refs.map((r) => snapFor(r.path.split('/')))),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
      fn({
        async get(ref: { path: string }) {
          return snapFor(ref.path.split('/'));
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

const fns = vi.hoisted(() => ({
  send: vi.fn(async () => {}),
  sendPaymentReviewAlert: vi.fn(async () => {}),
  sendPaidAlert: vi.fn(async () => {}),
  notifyVariantStock: vi.fn(async () => {}),
  assessRisk: vi.fn(async () => ({ flags: [], needsReview: false })),
}));

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
vi.mock('../lib/fraud', () => ({ assessRisk: fns.assessRisk, MAX_ORDERS_PER_HOUR: 5 }));
vi.mock('../lib/notifications', () => ({
  ORDER_NOTIFICATIONS: {
    send: fns.send,
    sendPaymentReviewAlert: fns.sendPaymentReviewAlert,
    sendPaidAlert: fns.sendPaidAlert,
    sendDispatchAlert: vi.fn(async () => {}),
  },
  STOCK_NOTIFICATIONS: { notifyVariantStock: fns.notifyVariantStock },
}));

/* ─────────────────────────── seed y helpers ─────────────────────────── */

const RATE = 250.5;
const TOTAL_VES = 6012; // 24 USD × 1 × 250.5 — exacto (round2 estable)

const SEED_BASE = {
  'settings/general': { pagoMovilAuto: true, ivaPercent: 0, pickupAddress: 'Av. Lara, Maracay' },
  'rates/bcv': { usdToVes: RATE },
  'products/p-aceite': { active: true, name: 'Aceite Mobil 10W-40', brand: 'Mobil', images: ['https://i.ibb.co/x.jpg'], categoryId: 'c1', slug: 'aceite', code: 'ACE-001' },
  'products/p-aceite/variants/v-4l': { active: true, priceUsd: 24, stock: 8, stockReserved: 0, name: 'Bidón 4 L', sku: 'MOB-4L' },
  'users/cli-1': { createdAtMs: Date.now() - 48 * 60 * 60 * 1000 },
};

const EVIDENCIA_OK = {
  referencia: '887766',
  importe: TOTAL_VES,
  fechaPago: '2026-10-29',
  bancoOrigen: '0102',
  telefonoDestino: '04220337872',
};

function seedConEvidencia(overrides: Record<string, unknown> = {}): Record<string, Record<string, unknown>> {
  return {
    ...SEED_BASE,
    [`pagoRefs/04220337872_887766`]: { uid: 'cli-1', importe: TOTAL_VES, used: false, ...overrides },
  };
}

function ctxCrear(pagosBdv: unknown, receiptImage = ''): CoreCtx {
  return {
    auth: { uid: 'cli-1', token: { role: 'customer' } },
    data: {
      idempotencyKey: `9f1e2c3d4e5f6a7b${Math.random().toString(16).slice(2, 10)}`,
      reservationId: null,
      fulfillment: 'pickup',
      items: [{ productId: 'p-aceite', variantId: 'v-4l', qty: 1 }],
      contact: { name: 'Erick Pérez', phone: '04243036024', cedula: 'V12345678' },
      address: { state: 'Aragua', city: 'Maracay', zoneId: '', zoneName: 'Retiro en tienda', details: 'Retiro en tienda' },
      deliveryWindow: { start: '08:00', end: '20:00' },
      notes: '',
      paymentMethod: 'pago_movil',
      paymentDetails: { banco: '(0102) Banco de Venezuela', telefono: '04127141363', cedula: 'V12345678', referencia: '887766', fecha: '2026-10-29' },
      receiptImage,
      pagosBdv,
    },
  } as unknown as CoreCtx;
}

beforeEach(() => {
  h.reset(seedConEvidencia());
  fns.send.mockClear();
  fns.sendPaymentReviewAlert.mockClear();
  fns.sendPaidAlert.mockClear();
  fns.notifyVariantStock.mockClear();
  fns.assessRisk.mockClear();
});

describe('5.113 · createOrder con evidencias BDV que cubren el total', () => {
  it('nace DIRECTO «pagado»: verifiedBy bdv, evidencia cobrada, push «Pago confirmado» + aviso 5.114 al cajero', async () => {
    const res = (await coreCreateOrder(ctxCrear([EVIDENCIA_OK]))) as { orderId: string; code: string };

    const order = h.store.get(`orders/${res.orderId}`)!;
    expect(order['status']).toBe('pagado');
    const payment = order['payment'] as Record<string, unknown>;
    expect(payment['status']).toBe('pagado');
    expect(payment['verifiedBy']).toBe('bdv');
    expect(payment['hasReceipt']).toBe(false);
    expect(Array.isArray(payment['bdvValidaciones'])).toBe(true);

    // La evidencia queda COBRADA por esta orden: jamás paga dos pedidos.
    const llave = h.store.get('pagoRefs/04220337872_887766')!;
    expect(llave['used']).toBe(true);
    expect(llave['orderId']).toBe(res.orderId);

    // Push al cliente «Pago confirmado» + aviso al cajero 5.114 (nació pagado
    // por el banco) — y NUNCA por la cola de verificación (no aplica).
    // 5.135-B: el aviso lleva el «Para: …» (2º parámetro, undefined en compra
    // normal) y el flag «Sin GPS» (3º parámetro, false porque no hay tercero).
    expect(fns.send).toHaveBeenCalledWith('cli-1', res.code, 'pagado');
    expect(fns.sendPaidAlert).toHaveBeenCalledWith(res.code, undefined, false);
    expect(fns.sendPaymentReviewAlert).not.toHaveBeenCalled();

    // Stock descontado como en cualquier venta (lo que ya funcionaba, intacto).
    expect(h.store.get('products/p-aceite/variants/v-4l')!['stock']).toBe(7);
  });

  it('suiche APAGADO: las evidencias NO valen — exige comprobante como siempre (5i-k intacto)', async () => {
    h.reset({ ...seedConEvidencia(), 'settings/general': { pagoMovilAuto: false, ivaPercent: 0 } });

    await expect(coreCreateOrder(ctxCrear([EVIDENCIA_OK]))).rejects.toMatchObject({
      code: 'invalid-argument',
      message: 'Falta el comprobante de pago: adjunta la foto antes de confirmar.',
    });
    // Nada se escribió: ni orden, ni llave consumida.
    expect([...h.store.keys()].filter((k) => k.startsWith('orders/'))).toHaveLength(0);
    expect(h.store.get('pagoRefs/04220337872_887766')!['used']).toBe(false);
  });

  it('evidencia FALSA (no existe en pagoRefs) → rechazada: no hay pedido sin pago real', async () => {
    h.reset(SEED_BASE); // sin llave en pagoRefs
    await expect(coreCreateOrder(ctxCrear([EVIDENCIA_OK]))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('evidencia YA USADA → rechazada (una referencia, un pedido)', async () => {
    h.reset(seedConEvidencia({ used: true }));
    await expect(coreCreateOrder(ctxCrear([EVIDENCIA_OK]))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('evidencia de OTRO uid → rechazada (nadie confirma su pedido con pago ajeno)', async () => {
    h.reset(seedConEvidencia({ uid: 'otro-2' }));
    await expect(coreCreateOrder(ctxCrear([EVIDENCIA_OK]))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });

  it('evidencia con importe DISTINTO al validado → rechazada (el candado cuadra centavos)', async () => {
    await expect(coreCreateOrder(ctxCrear([{ ...EVIDENCIA_OK, importe: 6000 }]))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
  });
});

describe('5.113 · evidencias que NO cubren el total (tasa que se movió entre cotizar y validar)', () => {
  it('nace «en_verificacion» CON la evidencia guardada: el cajero ve el pago real y decide', async () => {
    // El cliente validó Bs 3000 (la llave en pagoRefs guarda ESE importe),
    // pero el total de la orden es 6012: no cubre → nace en verificación.
    h.reset({
      ...SEED_BASE,
      'pagoRefs/04220337872_887766': { uid: 'cli-1', importe: 3000, used: false },
    });
    const res = (await coreCreateOrder(ctxCrear([{ ...EVIDENCIA_OK, importe: 3000 }]))) as {
      orderId: string;
      code: string;
    };

    const order = h.store.get(`orders/${res.orderId}`)!;
    expect(order['status']).toBe('en_verificacion');
    const payment = order['payment'] as Record<string, unknown>;
    expect(payment['status']).toBe('pendiente');
    expect(Array.isArray(payment['bdvValidaciones'])).toBe(true);

    // Cadena de nacimiento de SIEMPRE: cliente + cola del cajero.
    // 5.135-B: «Para: …» (2º parámetro, undefined en compra normal) y flag
    // «Sin GPS» (3º parámetro, false porque no hay tercero).
    expect(fns.send).toHaveBeenCalledWith('cli-1', res.code, 'en_verificacion');
    expect(fns.sendPaymentReviewAlert).toHaveBeenCalledWith(res.code, undefined, false);
  });

  it('más de 3 pagos parciales → invalid-argument (sin agujeros de abuso)', async () => {
    const cuatro = [1, 2, 3, 4].map((i) => ({ ...EVIDENCIA_OK, referencia: `ref${i}`, importe: 10 }));
    await expect(coreCreateOrder(ctxCrear(cuatro))).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});