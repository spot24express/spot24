/**
 * SPOT 24 · E2E de NOTIFICACIONES del flujo completo contra el EMULADOR (5i-e).
 * ────────────────────────────────────────────────────────────────────────────
 * Recorre el ciclo de negocio COMPLETO con los 4 roles y audita la voz del
 * sistema: qué push recibe cada parte en cada paso, con qué texto y a qué
 * tokens va dirigido.
 *
 *   reserveStock → quoteTotals → createOrder (FLUJO ESTRICTO 5i-k: nace
 *   en_verificacion con comprobante) → uploadReceipt (re-subida) →
 *   verifyPayment (aprobar / rechazar) → despacho por rol (cajero/delivery) →
 *   cancelOrder del cliente.
 *
 * Qué demuestra:
 *   · La notificación SIEMPRE va al CLIENTE (order.uid), nunca al personal.
 *   · Texto por estado: en_verificacion (nacimiento 5i-k)/pagado/preparado/en_camino/entregado/cancelado.
 *   · El cuerpo lleva el código de orden; data lleva {status, orderCode}.
 *   · Limpieza de tokens inválidos (registration-token-not-registered → borrado).
 *   · Replays idempotentes (5i-c) NO duplican notificaciones.
 *   · Un cliente SIN tokens registrados (push desactivado) compra en silencio
 *     y el flujo NO se rompe: la notificación es best-effort.
 *
 * FCM real NO se llama: `firebase-admin/messaging` está mockeada con un
 * GRABADOR (determinista, sin red); la lógica probada es la de producción.
 *
 * CÓMO CORRERLO (requiere Java + firebase-tools):
 *   firebase emulators:start --only firestore --project demo-spot24
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-spot24 \
 *     npx vitest run src/__tests__/notifications-flow.test.ts
 *
 * Sin FIRESTORE_EMULATOR_HOST el archivo SE SALTA solo (suite verde igual).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getAdminApp } from '../lib/ctx';
import {
  coreCancelOrder,
  coreCreateOrder,
  coreQuoteTotals,
  coreReserveStock,
  coreUploadReceipt,
} from '../orders';
import { coreVerifyPayment } from '../payments';
import { coreUpdateOrderStatus } from '../dispatch';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'] ?? '';
const d = EMULATOR ? describe : describe.skip;

/* ─────────── Grabador de envíos FCM (mock de firebase-admin/messaging) ─────────── */

interface RawSend {
  tokens: string[];
  /** 5.42: title/body viajan en `data` (payload solo-data; display SOLO en el SW). */
  notification?: { title: string; body: string };
  data: Record<string, string>;
  webpush?: { headers?: Record<string, string>; notification?: { icon?: string; badge?: string } };
}
interface RecordedSend {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, string>;
  ttl: string;
  urgency: string;
  icon: string;
  badge: string;
}

const fcmRecorder = vi.hoisted(() => {
  const sends: Array<{
    tokens: string[];
    notification?: { title: string; body: string };
    data: Record<string, string>;
    webpush?: { headers?: Record<string, string>; notification?: { icon?: string; badge?: string } };
  }> = [];
  return {
    sends,
    reset(): void {
      sends.length = 0;
    },
  };
});

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (msg: RawSend) => {
      fcmRecorder.sends.push(JSON.parse(JSON.stringify(msg)) as RawSend);
      return {
        responses: msg.tokens.map((t) =>
          t.includes('invalid')
            ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
            : { success: true },
        ),
      };
    },
  }),
}));

/** Vista normalizada de lo grabado hasta ahora. */
function recorded(): RecordedSend[] {
  // 5.42: title/body viajan en `data` (payload solo-data). El SW de mensajería
  // es la ÚNICA vía de display: sin bloque `notification` el SDK no
  // auto-muestra nada → sin notificaciones dobles.
  return fcmRecorder.sends.map((s) => ({
    tokens: s.tokens,
    title: s.data?.['title'] ?? '',
    body: s.data?.['body'] ?? '',
    data: s.data,
    ttl: s.webpush?.headers?.['TTL'] ?? '',
    urgency: s.webpush?.headers?.['Urgency'] ?? '',
    icon: s.webpush?.notification?.icon ?? '',
    badge: s.webpush?.notification?.badge ?? '',
  }));
}

/** Espera (sin colgar el test) a que el grabador alcance `n` envíos. */
async function waitForSendCount(n: number, ms = 5_000): Promise<void> {
  const t0 = Date.now();
  while (fcmRecorder.sends.length < n && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** Confirma que NO sale nada nuevo: margen de gracia y comparación de conteo. */
async function expectNoNewSends(before: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
  expect(fcmRecorder.sends.length).toBe(before);
}

/* ─────────────────────────── helpers de contexto ─────────────────────────── */

function ctx(uid: string, role: string, data?: Record<string, unknown>) {
  return {
    auth: { uid, token: { role, sub: uid, aud: PROJECT_ID } as unknown as DecodedIdToken },
    data,
  };
}

function customerCtx(uid: string, data?: Record<string, unknown>) {
  return ctx(uid, 'customer', data);
}

interface OrderOverrides {
  idempotencyKey?: string;
  reservationId?: string | null;
  fulfillment?: string;
  items?: Array<{ productId: string; variantId: string; qty: number }>;
  referencia?: string;
  paymentMethod?: string;
}

/** Comprobante base64 válido (cuerpo [A-Za-z0-9+/]) para todas las órdenes. */
const RECEIPT_B64 = Buffer.from('comprobante-emulador').toString('base64');

/** Respuesta imgbb estándar para los stubs de fetch. */
function imgbbResponse(url: string): Response {
  return new Response(JSON.stringify({ success: true, data: { url } }), { status: 200 });
}

function orderReq(uid: string, o: OrderOverrides = {}): Record<string, unknown> {
  return {
    idempotencyKey: o.idempotencyKey ?? 'e1e2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
    reservationId: o.reservationId ?? `u_${uid}`,
    fulfillment: o.fulfillment ?? 'delivery',
    items: o.items ?? [
      { productId: 'p9', variantId: 'w1', qty: 2 },
      { productId: 'p9', variantId: 'w2', qty: 1 },
    ],
    contact: { name: 'Erick Pérez', phone: '04141234567', cedula: 'V12345678' },
    address: {
      state: 'Portuguesa',
      city: 'Araure',
      zoneId: 'z_notif',
      zoneName: 'Araure',
      details: 'Calle 5 con carrera 3, casa 12',
    },
    deliveryWindow: { start: '08:00', end: '18:00' },
    notes: 'Casa de reja verde',
    paymentMethod: o.paymentMethod ?? 'pago_movil',
    paymentDetails: { banco: 'Banco de Venezuela', telefono: '04141234567', referencia: o.referencia ?? '770102030' },
    // FLUJO ESTRICTO (5i-k): el comprobante viaja con la orden.
    receiptImage: RECEIPT_B64,
  };
}

async function waitForEmulator(): Promise<void> {
  const dbf = admin.firestore();
  for (let i = 0; i < 30; i++) {
    try {
      await dbf.collection('settings').doc('general').get();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error('El emulador de Firestore no respondió en 15 s.');
}

const PROJECT_ID = 'demo-spot24';
const RATE = 250.5;
const IVA = 16;

d('[E2E notificaciones] flujo completo con push por rol', () => {
  let orderAId = '';
  let codeA = '';

  beforeAll(async () => {
    // Credencial de servicio DUMMY (solo válida contra el emulador).
    if (!process.env['FIREBASE_SERVICE_ACCOUNT']) {
      const { privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
        publicKeyEncoding: { type: 'spki', format: 'pem' },
      });
      process.env['FIREBASE_SERVICE_ACCOUNT'] = JSON.stringify({
        type: 'service_account',
        project_id: PROJECT_ID,
        private_key: privateKey,
        client_email: `emu@${PROJECT_ID}.iam.gserviceaccount.com`,
        client_id: '000000000000000000000',
      });
    }
    process.env['GCLOUD_PROJECT'] = process.env['GCLOUD_PROJECT'] ?? PROJECT_ID;
    process.env['ENC_KEY_HEX'] = process.env['ENC_KEY_HEX'] ?? 'a'.repeat(64);
    process.env['IMGBB_API_KEY'] = process.env['IMGBB_API_KEY'] ?? 'emu-imgbb-key';

    const app = getAdminApp();
    const dbf = admin.firestore(app);
    // Transporte REST: mismo motivo que la E2E principal (gRPC colgado en sandbox).
    dbf.settings({ preferRest: true });
    await waitForEmulator();

    // ── SEED ──
    await dbf.collection('settings').doc('general').set({ ivaPercent: IVA, pickupAddress: 'Av. Lara, C.C. Spot 24, Maracay' });
    await dbf.collection('rates').doc('bcv').set({ usdToVes: RATE, updatedAt: Date.now() });
    await dbf.collection('zones').doc('z_notif').set({ name: 'Araure', active: true, feeUsd: 3.5, freeFromUsd: 50 });

    await dbf.collection('products').doc('p9').set({
      active: true, brand: 'Nike', name: 'Zapatilla Air',
      images: ['https://cdn.example/1.jpg'], categoryId: 'c1', slug: 'zapatilla-air',
    });
    await dbf.doc('products/p9/variants/w1').set({ active: true, priceUsd: 10, stock: 5, stockReserved: 0, name: 'Rojo 42', sku: 'SKU-1' });
    await dbf.doc('products/p9/variants/w2').set({ active: true, priceUsd: 20, stock: 3, stockReserved: 0, name: 'Azul 43', sku: 'SKU-2' });

    // Cuentas "viejas" (>24 h) para no ensuciar riskFlags con cuenta_nueva.
    const old = Date.now() - 48 * 60 * 60 * 1000;
    for (const u of ['cli-a', 'cli-b', 'cli-c', 'jefe-1', 'caja-1', 'repa-1']) {
      await dbf.collection('users').doc(u).set({ createdAtMs: old });
    }

    // ── Tokens FCM: cli-a (1 válido + 1 inválido), cli-b (1 válido) y
    //    jefe-1 (un token que JAMÁS debe recibir nada de pedidos). ──
    await dbf.doc('users/cli-a/fcmTokens/tok-a-1').set({ token: 'tok-a-valid-1', createdAt: Date.now(), userAgent: 'vitest' });
    await dbf.doc('users/cli-a/fcmTokens/tok-a-2').set({ token: 'tok-a-invalid-1', createdAt: Date.now(), userAgent: 'vitest' });
    await dbf.doc('users/cli-b/fcmTokens/tok-b-1').set({ token: 'tok-b-valid-1', createdAt: Date.now(), userAgent: 'vitest' });
    await dbf.doc('users/jefe-1/fcmTokens/tok-s-1').set({ token: 'tok-jefe-1', createdAt: Date.now(), userAgent: 'vitest' });

    fcmRecorder.reset();
  });

  afterAll(async () => {
    if (admin.apps.length > 0) await admin.app().delete();
  });

  it('FASE 0 · reserveStock y quoteTotals NO notifican nada', async () => {
    await coreReserveStock(customerCtx('cli-a', {
      items: [{ productId: 'p9', variantId: 'w1', qty: 2 }],
    }));
    await coreQuoteTotals(customerCtx('cli-a', {
      fulfillment: 'delivery',
      zoneId: 'z_notif',
      items: [
        { productId: 'p9', variantId: 'w1', qty: 2 },
        { productId: 'p9', variantId: 'w2', qty: 1 },
      ],
    }));
    await expectNoNewSends(0);
  });

  it('FASE 1 · createOrder (5i-k) → push «Verificando pago» al cliente en SUS 2 tokens + limpia el token inválido', async () => {
    const dbf = admin.firestore();

    // imgbb simulada: el comprobante viaja con la orden (FLUJO ESTRICTO).
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('api.imgbb.com')) return imgbbResponse('https://i.ibb.co/emu/comprobante-a.jpg');
      return new Response('{}', { status: 599 });
    }));
    let res: { orderId: string; code: string };
    try {
      res = (await coreCreateOrder(customerCtx('cli-a', orderReq('cli-a', {
        idempotencyKey: 'a1a1c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      })))) as { orderId: string; code: string };
    } finally {
      vi.unstubAllGlobals();
    }
    orderAId = res.orderId;
    codeA = res.code;
    expect(codeA).toMatch(/^SP-\d{6}-\d{4}$/);

    await waitForSendCount(1);
    const sends = recorded();
    expect(sends).toHaveLength(1);
    const s1 = sends[0]!;
    expect([...s1.tokens].sort()).toEqual(['tok-a-invalid-1', 'tok-a-valid-1']);
    // FLUJO ESTRICTO: la orden nace EN VERIFICACIÓN (el cliente ya pagó).
    expect(s1.title).toBe('SPOT 24 · Verificando pago');
    expect(s1.body).toBe(`Tu pago está en revisión. Te avisamos al confirmar. (${codeA})`);
    // 5.67: data EXACTO — title/body viajan ahí + clickUrl del destino al
    // tocar (lo hereda el globo nativo y lo usa notificationclick).
    expect(s1.data).toEqual({
      status: 'en_verificacion',
      orderCode: codeA,
      clickUrl: '/pedidos',
      title: 'SPOT 24 · Verificando pago',
      body: `Tu pago está en revisión. Te avisamos al confirmar. (${codeA})`,
    });
    expect(s1.ttl).toBe('86400');
    // 5.67 · DOBLE VÍA: el globo nativo de respaldo viaja en webpush.notification
    // (icon/badge/tag/renotify) — NO en la raíz del mensaje. La vía de display
    // primaria sigue siendo el SW (data.title/body): el SDK no auto-muestra nada.
    expect(fcmRecorder.sends[0]?.notification).toBeUndefined();
    expect(s1.icon).toBe('/icons/icon-192.png');
    expect(s1.badge).toBe('/icons/badge-96.png');

    // El token inválido (registration-token-not-registered) quedó BORRADO.
    const left = await dbf.collection('users/cli-a/fcmTokens').get();
    expect(left.docs.map((x) => String(x.data()['token']))).toEqual(['tok-a-valid-1']);
  });

  it('FASE 2 · uploadReceipt (re-subida) NO notifica y la orden sigue en en_verificacion', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { url: 'https://i.ibb.co/emu/comprobante.jpg' } }), { status: 200 }),
    ));
    try {
      const r = (await coreUploadReceipt(customerCtx('cli-a', {
        orderId: orderAId,
        image: Buffer.from('comprobante-emulador').toString('base64'),
      }))) as { ok: boolean };
      expect(r.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    // Reemplazo de foto sobre una orden que ya nació en verificación (5i-k):
    // el estado se mantiene y NO hay push extra.
    const after = await admin.firestore().collection('orders').doc(orderAId).get();
    expect(after.data()?.['status']).toBe('en_verificacion');
    await expectNoNewSends(1);
  });

  it('FASE 3 · verifyPayment aprobar → push «pagado»; el REPLAY no re-notifica (5i-c)', async () => {
    const r1 = (await coreVerifyPayment(ctx('jefe-1', 'admin', { orderId: orderAId, approve: true }))) as { ok: boolean };
    expect(r1.ok).toBe(true);

    await waitForSendCount(2);
    let sends = recorded();
    const s2 = sends[1]!;
    expect(s2.tokens).toEqual(['tok-a-valid-1']); // el inválido ya se limpió
    expect(s2.title).toBe('SPOT 24 · Pago confirmado');
    expect(s2.body).toBe(`Tu pedido entra al pit stop. Preparado en breve. (${codeA})`);
    expect(s2.data.status).toBe('pagado');

    // REPLAY (doble clic): ok idempotente y SIN segunda notificación.
    const before = fcmRecorder.sends.length;
    const r2 = (await coreVerifyPayment(ctx('jefe-1', 'admin', { orderId: orderAId, approve: true }))) as { ok: boolean; alreadyApplied: boolean };
    expect(r2).toMatchObject({ ok: true, alreadyApplied: true });
    await expectNoNewSends(before);
    sends = recorded();
    expect(sends).toHaveLength(2);
  });

  it('FASE 4 · despacho por rol → «preparado», «en_camino», «entregado»; replays sin duplicar', async () => {
    // admin: pagado → preparado (push #3).
    await coreUpdateOrderStatus(ctx('jefe-1', 'admin', { orderId: orderAId, to: 'preparado' }));
    await waitForSendCount(3);
    let sends = recorded();
    const s3 = sends[2]!;
    expect(s3.title).toBe('SPOT 24 · Pedido preparado');
    expect(s3.data.status).toBe('preparado');

    // Replay exacto X → X: ok, sin push duplicado.
    let before = fcmRecorder.sends.length;
    const replay = (await coreUpdateOrderStatus(ctx('jefe-1', 'admin', { orderId: orderAId, to: 'preparado' }))) as { ok: boolean; alreadyApplied: boolean };
    expect(replay).toMatchObject({ ok: true, alreadyApplied: true });
    await expectNoNewSends(before);

    // El cajero NO puede sacar de bahía: sin push y con rechazo.
    await expect(coreUpdateOrderStatus(ctx('caja-1', 'cajero', { orderId: orderAId, to: 'en_camino' })))
      .rejects.toThrow(/Tu rol no permite/);
    await expectNoNewSends(before);

    // delivery: preparado → en_camino (push #4, con tracking).
    const r = (await coreUpdateOrderStatus(ctx('repa-1', 'delivery', { orderId: orderAId, to: 'en_camino' }))) as { ok: boolean; trackingCode: string };
    expect(r.ok).toBe(true);
    expect(r.trackingCode).toMatch(/^SP-TRK-\d{6}$/);
    await waitForSendCount(4);
    sends = recorded();
    const s4 = sends[3]!;
    expect(s4.title).toBe('SPOT 24 · En camino');
    expect(s4.data.status).toBe('en_camino');

    // delivery: en_camino → entregado (push #5). Terminal.
    await coreUpdateOrderStatus(ctx('repa-1', 'delivery', { orderId: orderAId, to: 'entregado' }));
    await waitForSendCount(5);
    sends = recorded();
    const s5 = sends[4]!;
    expect(s5.title).toBe('SPOT 24 · Entregado');
    expect(s5.data.status).toBe('entregado');

    // Replay de estado terminal: sin push extra.
    before = fcmRecorder.sends.length;
    const replayFin = (await coreUpdateOrderStatus(ctx('jefe-1', 'admin', { orderId: orderAId, to: 'entregado' }))) as { ok: boolean; alreadyApplied: boolean };
    expect(replayFin).toMatchObject({ ok: true, alreadyApplied: true });
    await expectNoNewSends(before);
  });

  it('FASE 5 · order B: el CAJERO verifica y prepara; cada paso notifica al cliente', async () => {
    const dbf = admin.firestore();

    await coreReserveStock(customerCtx('cli-b', { items: [{ productId: 'p9', variantId: 'w1', qty: 1 }] }));
    // imgbb simulada: B nace con comprobante (FLUJO ESTRICTO 5i-k).
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('api.imgbb.com')) return imgbbResponse('https://i.ibb.co/emu/comprobante-b.jpg');
      return new Response('{}', { status: 599 });
    }));
    let res: { orderId: string };
    try {
      res = (await coreCreateOrder(customerCtx('cli-b', orderReq('cli-b', {
        idempotencyKey: 'b5b5c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        referencia: '770203040',
        items: [{ productId: 'p9', variantId: 'w1', qty: 1 }],
      })))) as { orderId: string };
    } finally {
      vi.unstubAllGlobals();
    }
    const orderBId = res.orderId;

    await waitForSendCount(6);
    let sends = recorded();
    const s6 = sends[5]!;
    expect(s6.tokens).toEqual(['tok-b-valid-1']);
    expect(s6.data.status).toBe('en_verificacion');

    // Guardia 5i-j (regresión): pedido LEGACY sin comprobante no se aprueba.
    // Los nuevos ya nacen con comprobante (5i-k): escribimos el legacy directo.
    await dbf.collection('orders').doc('legacy-notif-sin-comprobante').set({
      code: 'SP-000000-0002',
      uid: 'cli-b',
      status: 'en_verificacion',
      lines: [{ productId: 'p9', variantId: 'w1', qty: 1 }],
      payment: { method: 'pago_movil', status: 'pendiente', hasReceipt: false },
      totals: { subtotalUsd: 10, shippingUsd: 3.5, ivaUsd: 2.16, totalUsd: 15.66, totalVes: 3922.83, rateUsed: RATE, subtotalVes: 2505, shippingVes: 876.75, ivaVes: 541.08 },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await expect(coreVerifyPayment(ctx('caja-1', 'cajero', { orderId: 'legacy-notif-sin-comprobante', approve: true })))
      .rejects.toThrow(/comprobante/);
    await expectNoNewSends(6); // el guardia NO notifica nada

    // Re-subida de comprobante (reemplazo de foto): sin push y estado intacto
    // (imgbb simulada; uploadReceipt NO genera push).
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ success: true, data: { url: 'https://i.ibb.co/emu/comprobante-b2.jpg' } }), { status: 200 }),
    ));
    try {
      await coreUploadReceipt(customerCtx('cli-b', {
        orderId: orderBId,
        image: Buffer.from('comprobante-emulador-b').toString('base64'),
      }));
    } finally {
      vi.unstubAllGlobals();
    }
    expect((await dbf.collection('orders').doc(orderBId).get()).data()?.['status']).toBe('en_verificacion');
    await expectNoNewSends(6);

    // cajero aprueba el pago (en_verificacion → pagado vía verifyPayment).
    const ok = (await coreVerifyPayment(ctx('caja-1', 'cajero', { orderId: orderBId, approve: true }))) as { ok: boolean };
    expect(ok.ok).toBe(true);
    await waitForSendCount(7);
    sends = recorded();
    expect(sends[6]!.data.status).toBe('pagado');

    // cajero prepara (pagado → preparado está en SU matriz de rol).
    await coreUpdateOrderStatus(ctx('caja-1', 'cajero', { orderId: orderBId, to: 'preparado' }));
    await waitForSendCount(8);
    sends = recorded();
    expect(sends[7]!.data.status).toBe('preparado');
    expect((await dbf.collection('orders').doc(orderBId).get()).data()?.['status']).toBe('preparado');
  });

  it('FASE 6 · cliente SIN tokens (push desactivado): compra y rechazo funcionan en silencio', async () => {
    const dbf = admin.firestore();
    const before = fcmRecorder.sends.length;

    // cli-c no tiene NINGÚN token registrado → la push se omite entera.
    await coreReserveStock(customerCtx('cli-c', { items: [{ productId: 'p9', variantId: 'w1', qty: 1 }] }));
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('api.imgbb.com')) return imgbbResponse('https://i.ibb.co/emu/comprobante-c.jpg');
      return new Response('{}', { status: 599 });
    }));
    let res: { orderId: string };
    try {
      res = (await coreCreateOrder(customerCtx('cli-c', orderReq('cli-c', {
        idempotencyKey: 'c6c6c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        referencia: '770304050',
        items: [{ productId: 'p9', variantId: 'w1', qty: 1 }],
      })))) as { orderId: string };
    } finally {
      vi.unstubAllGlobals();
    }
    expect(res.orderId).toBeTruthy();
    await expectNoNewSends(before);

    // El admin rechaza el pago → repone stock; sin tokens, sin push, sin error.
    const stockAntes = Number((await dbf.doc('products/p9/variants/w1').get()).data()?.['stock']);
    const rej = (await coreVerifyPayment(ctx('jefe-1', 'admin', { orderId: res.orderId, approve: false, note: 'No coincide' }))) as { ok: boolean };
    expect(rej.ok).toBe(true);
    const order = (await dbf.collection('orders').doc(res.orderId).get()).data();
    expect(order?.['status']).toBe('cancelado');
    expect(order?.['payment']?.['status']).toBe('rechazado');
    expect(Number((await dbf.doc('products/p9/variants/w1').get()).data()?.['stock'])).toBe(stockAntes + 1);
    await expectNoNewSends(before);
  });

  it('FASE 7 · cancelación por el CLIENTE → push «cancelado»', async () => {
    const dbf = admin.firestore();

    await coreReserveStock(customerCtx('cli-b', { items: [{ productId: 'p9', variantId: 'w2', qty: 1 }] }));
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('api.imgbb.com')) return imgbbResponse('https://i.ibb.co/emu/comprobante-d.jpg');
      return new Response('{}', { status: 599 });
    }));
    let res: { orderId: string };
    try {
      res = (await coreCreateOrder(customerCtx('cli-b', orderReq('cli-b', {
        idempotencyKey: 'd7d7c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        referencia: '770405060',
        items: [{ productId: 'p9', variantId: 'w2', qty: 1 }],
      })))) as { orderId: string };
    } finally {
      vi.unstubAllGlobals();
    }
    await waitForSendCount(9);

    // POLÍTICA 5.15/5.26 (regresión): la orden nace CON comprobante → el
    // cliente NO puede cancelarla él mismo (la cajera la resuelve). Sin push
    // y sin cambios de estado.
    const beforePolitica = fcmRecorder.sends.length;
    await expect(coreCancelOrder(customerCtx('cli-b', { orderId: res.orderId, reason: 'x' })))
      .rejects.toThrow(/pago ya está registrado/);
    await expectNoNewSends(beforePolitica);

    // Pedido LEGACY (era pre-flujo estricto): status 'pendiente' sin
    // comprobante → el dueño SÍ puede cancelarlo y recibe el push
    // «cancelado». Al cancelar se repone el stock.
    await dbf.collection('orders').doc(res.orderId).update({ 'payment.hasReceipt': false, status: 'pendiente' });
    const c = (await coreCancelOrder(customerCtx('cli-b', { orderId: res.orderId, reason: 'Ya no lo necesito' }))) as { ok: boolean };
    expect(c.ok).toBe(true);
    expect((await dbf.collection('orders').doc(res.orderId).get()).data()?.['status']).toBe('cancelado');
    await waitForSendCount(10);
    const sends = recorded();
    const s10 = sends[9]!;
    expect(s10.tokens).toEqual(['tok-b-valid-1']);
    expect(s10.title).toBe('SPOT 24 · Pedido cancelado');
    expect(s10.data.status).toBe('cancelado');
  });

  it('CIERRE · auditoría global: solo clientes reciben, secuencia correcta, inventario consistente', async () => {
    const dbf = admin.firestore();
    const sends = recorded();
    expect(sends).toHaveLength(10);

    // SOLO tokens de clientes; el token del staff JAMÁS fue destinatario.
    const allTokens = sends.flatMap((s) => s.tokens);
    expect(new Set(allTokens)).toEqual(new Set(['tok-a-valid-1', 'tok-a-invalid-1', 'tok-b-valid-1']));
    expect(allTokens).not.toContain('tok-jefe-1');
    // El token del staff sigue intacto en Firestore (nunca se tocó).
    expect((await dbf.collection('users/jefe-1/fcmTokens').get()).size).toBe(1);

    // Secuencia EXACTA de pushes del cliente A, de pedido a entrega.
    // 5i-k: el nacimiento ES «en_verificacion» (la orden ya lleva el pago).
    const seqA = sends.filter((s) => s.tokens.includes('tok-a-valid-1')).map((s) => s.data.status);
    expect(seqA).toEqual(['en_verificacion', 'pagado', 'preparado', 'en_camino', 'entregado']);

    // Secuencia del cliente B: pedido(B), pagado, preparado, pedido(F7), cancelado.
    const seqB = sends.filter((s) => s.tokens.includes('tok-b-valid-1')).map((s) => s.data.status);
    expect(seqB).toEqual(['en_verificacion', 'pagado', 'preparado', 'en_verificacion', 'cancelado']);

    // Todo envío: TTL 86400, código válido, título del mapa de marca.
    const TITULOS: Record<string, string> = {
      en_verificacion: 'SPOT 24 · Verificando pago',
      pagado: 'SPOT 24 · Pago confirmado',
      preparado: 'SPOT 24 · Pedido preparado',
      en_camino: 'SPOT 24 · En camino',
      entregado: 'SPOT 24 · Entregado',
      cancelado: 'SPOT 24 · Pedido cancelado',
    };
    for (const s of sends) {
      expect(s.ttl).toBe('86400');
      // 5.67: icon/badge viajan en el bloque nativo de respaldo (webpush.notification).
      expect(s.icon).toBe('/icons/icon-192.png');
      expect(s.badge).toBe('/icons/badge-96.png');
      expect(s.data.orderCode).toMatch(/^SP-\d{6}-\d{4}$/);
      const tituloEsperado = TITULOS[s.data.status ?? ''] ?? '';
      expect(tituloEsperado).toBeDefined();
      expect(s.title).toBe(tituloEsperado);
      expect(s.body.endsWith(`(${s.data.orderCode})`)).toBe(true);
    }

    // Inventario consistente con el historial completo:
    // v1: 5 -2(A) -1(B) -1(C) +1(rechazo C) = 2 · v2: 3 -1(A) -1(F7) +1(cancel) = 2.
    expect(Number((await dbf.doc('products/p9/variants/w1').get()).data()?.['stock'])).toBe(2);
    expect(Number((await dbf.doc('products/p9/variants/w2').get()).data()?.['stock'])).toBe(2);
    expect(Number((await dbf.doc('products/p9/variants/w1').get()).data()?.['stockReserved'])).toBe(0);
    expect(Number((await dbf.doc('products/p9/variants/w2').get()).data()?.['stockReserved'])).toBe(0);
  });
});
