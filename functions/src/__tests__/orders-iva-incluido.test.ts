/**
 * SPOT 24 · Ronda 5.120 (B1) — IVA INCLUIDO en el precio publicado.
 * Firestore de mentira en memoria (mismo patrón del guardián orders-pago-bdv).
 * Fija las reglas nuevas del desglose SIN tocar las viejas:
 * · El priceUsd de la variante es el precio FINAL: el total en Bs NO lleva el
 *   IVA encima — la orden cobra precio publicado + envío (partida neutra).
 * · El desglose se EXTRAe (regla extractor): base + IVA = precio, suma exacta.
 * · CAMBIAR el % en Ajustes NO cambia lo que paga el cliente: solo re-reparte
 *   base/IVA (la diferencia la absorbe la tienda, no el comprador).
 * · IVA 0 = sin desglose de IVA: total idéntico al modelo anterior.
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
const PRECIO = 24; // priceUsd del producto: precio FINAL con IVA dentro (B1)
const PRODUCTO_BS = 6012; // 24 × 250.5 — exacto (round2 estable)

function seedConIva(ivaPercent: number): Record<string, Record<string, unknown>> {
  return {
    'settings/general': { ivaPercent, pickupAddress: 'Av. Lara, Maracay' },
    'rates/bcv': { usdToVes: RATE },
    'products/p-aceite': { active: true, name: 'Aceite Mobil 10W-40', brand: 'Mobil', images: ['https://i.ibb.co/x.jpg'], categoryId: 'c1', slug: 'aceite', code: 'ACE-001' },
    'products/p-aceite/variants/v-4l': { active: true, priceUsd: PRECIO, stock: 8, stockReserved: 0, name: 'Bidón 4 L', sku: 'MOB-4L' },
    'users/cli-1': { createdAtMs: Date.now() - 48 * 60 * 60 * 1000 },
  };
}

/** Contra entrega (efectivo): NO llama a imgbb ni exige comprobante —
 *  la orden nace «en_verificacion» y aislamos el cálculo del IVA. */
function ctxCrear(): CoreCtx {
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
      paymentMethod: 'efectivo',
      paymentDetails: {},
      receiptImage: '',
    },
  } as unknown as CoreCtx;
}

beforeEach(() => {
  fns.send.mockClear();
  fns.sendPaymentReviewAlert.mockClear();
  fns.sendPaidAlert.mockClear();
  fns.notifyVariantStock.mockClear();
  fns.assessRisk.mockClear();
});

interface Totales {
  totalVes: number; subtotalVes: number; shippingVes: number;
  ivaPercent: number; ivaUsd: number; ivaVes: number; baseVes: number;
  totalUsd: number; rateUsed: number;
}

async function crearConIva(ivaPercent: number): Promise<{ totals: Totales; status: string }> {
  h.reset(seedConIva(ivaPercent));
  const res = (await coreCreateOrder(ctxCrear())) as { orderId: string; totals: Totales };
  const order = h.store.get(`orders/${res.orderId}`)!;
  return { totals: res.totals, status: String(order['status']) };
}

describe('5.120 (B1) · IVA INCLUIDO en el precio publicado', () => {
  it('16%: el cliente paga el precio publicado (+ envío) y el desglose se EXTRAe del precio', async () => {
    const { totals, status } = await crearConIva(16);

    // El precio es el que manda: ni un bolívar de IVA encima.
    expect(totals.subtotalVes).toBe(PRODUCTO_BS); // 24 × 250.5, precio publicado
    expect(totals.totalVes).toBe(PRODUCTO_BS); // pickup: sin envío — total = precio

    // Extracción (extractor): base + IVA = precio, sin céntimos perdidos.
    expect(totals.ivaPercent).toBe(16);
    expect(totals.baseVes).toBe(5182.76); // 6012 / 1.16
    expect(totals.ivaVes).toBe(829.24); // 6012 − 5182.76
    expect(totals.baseVes + totals.ivaVes).toBe(totals.subtotalVes);

    // USD de referencia (panel): el IVA ya vive dentro del precio publicado.
    expect(totals.totalUsd).toBe(PRECIO);
    expect(totals.ivaUsd).toBe(3.31); // 829.24 / 250.5

    // Contra entrega nace en verificación, como siempre (flujos intactos).
    expect(status).toBe('en_verificacion');
    expect(fns.send).toHaveBeenCalledWith('cli-1', expect.any(String), 'en_verificacion');
  });

  it('cambiar el % en Ajustes NO cambia lo que paga el cliente: solo el reparto base/IVA', async () => {
    const { totals: t16 } = await crearConIva(16);
    const { totals: t18 } = await crearConIva(18);

    // Mismo precio publicado, mismo total — cambia SOLO el desglose.
    expect(t18.totalVes).toBe(t16.totalVes);
    expect(t18.subtotalVes).toBe(PRODUCTO_BS);

    // Nuevo reparto 18%: base menor, IVA mayor, suma EXACTA al precio.
    expect(t18.ivaPercent).toBe(18);
    expect(t18.baseVes).toBe(5094.92); // 6012 / 1.18
    expect(t18.ivaVes).toBe(917.08); // 6012 − 5094.92
    expect(t18.baseVes + t18.ivaVes).toBe(t18.subtotalVes);
  });

  it('IVA 0 = sin desglose: base = precio y iva 0 — idéntico al modelo anterior', async () => {
    const { totals } = await crearConIva(0);

    expect(totals.totalVes).toBe(PRODUCTO_BS);
    expect(totals.subtotalVes).toBe(PRODUCTO_BS);
    expect(totals.baseVes).toBe(PRODUCTO_BS); // base = precio (nada extraído)
    expect(totals.ivaVes).toBe(0);
    expect(totals.ivaPercent).toBe(0);
  });

  it('envío neutro: el IVA sale SOLO del producto y el envío pasa recto al total', async () => {
    h.reset({
      ...seedConIva(16),
      'zones/z-qa': { name: 'Araure', active: true, feeUsd: 1, freeFromUsd: 0 },
    });
    const res = (await coreCreateOrder({
      ...ctxCrear(),
      data: {
        ...(ctxCrear().data as Record<string, unknown>),
        fulfillment: 'delivery',
        address: { state: 'Portuguesa', city: 'Araure', zoneId: 'z-qa', zoneName: 'Araure', details: 'Calle 5, casa 12', location: null },
      },
    } as unknown as CoreCtx)) as { orderId: string; totals: Totales };

    const t = res.totals;
    expect(t.subtotalVes).toBe(PRODUCTO_BS); // producto con IVA dentro
    expect(t.shippingVes).toBe(250.5); // $1 × 250.5 — partida neutra
    expect(t.baseVes + t.ivaVes).toBe(t.subtotalVes); // la extracción solo toca el producto
    expect(t.totalVes).toBe(6262.5); // 6012 + 250.5 — el cliente paga precio + envío, sin IVA del envío
  });
});
