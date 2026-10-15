/**
 * SPOT 24 · QA 5.71 — comportamientos NUEVOS del cajero en notificaciones.
 * (Prueba de sandbox para re-validar la reconstrucción de la ronda 5.71.
 *  NO forma parte del paquete del dueño: su suite autoritativa es
 *  notifications-flow.test.ts reestructurada.)
 *
 * Qué audita:
 *  1. createOrder → 2 envíos EN CADENA: globo del cliente («Verificando
 *     pago») + «Pago por verificar» a cajero/gerente/admin (NUNCA al
 *     delivery ni al cliente), con tag spot24-pagos-{código},
 *     clickUrl /admin/pagos y doble vía 5.67 (webpush.notification presente).
 *  2. uploadReceipt sobre pedido LEGACY «pendiente» → 1 aviso de pagos;
 *     la RE-SUBIDA no repite el aviso.
 *  3. coreUpdateOrderStatus → preparado (con envío) → cadena exacta:
 *     delivery CTA → staff informativo (cajero incluido) → globo del cliente.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getAdminApp } from '../lib/ctx';
import { coreCreateOrder, coreUploadReceipt } from '../orders';
import { coreUpdateOrderStatus } from '../dispatch';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const EMULATOR = process.env['FIRESTORE_EMULATOR_HOST'] ?? '';
const d = EMULATOR ? describe : describe.skip;

/* ── Grabador FCM (captura el payload COMPLETO incl. webpush.notification) ── */
interface RawSend {
  tokens: string[];
  notification?: { title: string; body: string };
  data: Record<string, string>;
  webpush?: {
    headers?: Record<string, string>;
    notification?: { title?: string; body?: string; icon?: string; badge?: string; tag?: string; renotify?: boolean };
  };
}

const fcmRecorder = vi.hoisted(() => {
  const sends: RawSend[] = [];
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
      return { responses: msg.tokens.map(() => ({ success: true })) };
    },
  }),
}));

async function waitForSendCount(n: number, ms = 5_000): Promise<void> {
  const t0 = Date.now();
  while (fcmRecorder.sends.length < n && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function expectNoNewSends(before: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
  expect(fcmRecorder.sends.length).toBe(before);
}

function ctx(uid: string, role: string, data?: Record<string, unknown>) {
  return {
    auth: { uid, token: { role, sub: uid, aud: PROJECT_ID } as unknown as DecodedIdToken },
    data,
  };
}

const RECEIPT_B64 = Buffer.from('comprobante-emulador').toString('base64');

function imgbbResponse(url: string): Response {
  return new Response(JSON.stringify({ success: true, data: { url } }), { status: 200 });
}

const PROJECT_ID = 'demo-spot24';

d('[QA 5.71] aviso de pagos al cajero + cadena de despacho', () => {
  beforeAll(async () => {
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
    dbf.settings({ preferRest: true });

    for (let i = 0; i < 30; i++) {
      try {
        await dbf.collection('settings').doc('general').get();
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }

    // ── SEED ──
    await dbf.collection('settings').doc('general').set({ ivaPercent: 16, pickupAddress: 'Av. Lara, C.C. Spot 24, Maracay' });
    await dbf.collection('rates').doc('bcv').set({ usdToVes: 250.5, updatedAt: Date.now() });
    await dbf.collection('zones').doc('z_qa').set({ name: 'Araure', active: true, feeUsd: 3.5, freeFromUsd: 50 });
    await dbf.collection('products').doc('p9').set({
      active: true, brand: 'Nike', name: 'Zapatilla Air',
      images: ['https://cdn.example/1.jpg'], categoryId: 'c1', slug: 'zapatilla-air',
    });
    await dbf.doc('products/p9/variants/w1').set({ active: true, priceUsd: 10, stock: 5, stockReserved: 0, name: 'Rojo 42', sku: 'SKU-1' });
    await dbf.doc('products/p9/variants/w2').set({ active: true, priceUsd: 20, stock: 3, stockReserved: 0, name: 'Azul 43', sku: 'SKU-2' });

    const old = Date.now() - 48 * 60 * 60 * 1000;
    const seedUsers: Array<[string, string]> = [
      ['cli-qa', 'customer'],
      ['jefe-1', 'admin'],
      ['gere-1', 'gerente'],
      ['caja-1', 'cajero'],
      ['repa-1', 'delivery'],
    ];
    for (const [u, role] of seedUsers) {
      await dbf.collection('users').doc(u).set({ createdAtMs: old, name: u === 'cli-qa' ? 'Erick Pérez' : u, role });
    }
    await dbf.doc('users/cli-qa/fcmTokens/tok-cli').set({ token: 'tok-cli-1', createdAt: Date.now() });
    await dbf.doc('users/jefe-1/fcmTokens/tok-jefe').set({ token: 'tok-jefe-1', createdAt: Date.now() });
    await dbf.doc('users/gere-1/fcmTokens/tok-gere').set({ token: 'tok-gere-1', createdAt: Date.now() });
    await dbf.doc('users/caja-1/fcmTokens/tok-caja').set({ token: 'tok-caja-1', createdAt: Date.now() });
    await dbf.doc('users/repa-1/fcmTokens/tok-repa').set({ token: 'tok-repa-1', createdAt: Date.now() });

    fcmRecorder.reset();
  });

  afterAll(async () => {
    if (admin.apps.length > 0) await admin.app().delete();
  });

  it('QA-1 · createOrder → cliente + «Pago por verificar» a cajero/gerente/admin', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => imgbbResponse('https://i.ibb.co/emu/qa-comprobante.jpg')));
    let res: { orderId: string; code: string };
    try {
      res = (await coreCreateOrder(ctx('cli-qa', 'customer', {
        idempotencyKey: 'b1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
        reservationId: null,
        fulfillment: 'delivery',
        items: [
          { productId: 'p9', variantId: 'w1', qty: 2 },
          { productId: 'p9', variantId: 'w2', qty: 1 },
        ],
        contact: { name: 'Erick Pérez', phone: '04141234567', cedula: 'V12345678' },
        address: { state: 'Portuguesa', city: 'Araure', zoneId: 'z_qa', zoneName: 'Araure', details: 'Calle 5 con carrera 3, casa 12' },
        deliveryWindow: { start: '08:00', end: '18:00' },
        notes: '',
        paymentMethod: 'pago_movil',
        paymentDetails: { banco: 'Banco de Venezuela', telefono: '04141234567', referencia: '770102030' },
        receiptImage: RECEIPT_B64,
      }))) as { orderId: string; code: string };
    } finally {
      vi.unstubAllGlobals();
    }
    const code = res.code;
    expect(code).toMatch(/^SP-\d{6}-\d{4}$/);

    await waitForSendCount(2);
    const sends = fcmRecorder.sends;
    expect(sends).toHaveLength(2);

    // Envío 1: globo del CLIENTE (en cadena va primero).
    const sCliente = sends[0]!;
    expect(sCliente.tokens).toEqual(['tok-cli-1']);
    expect(sCliente.data['title']).toBe('SPOT 24 · Verificando pago');
    expect(sCliente.data['status']).toBe('en_verificacion');
    expect(sCliente.data['orderCode']).toBe(code);
    expect(sCliente.data['clickUrl']).toBe('/pedidos');
    // Doble vía 5.67: bloque nativo con la MISMA tag (por pedido+estado, 5.73-f) y renotify.
    expect(sCliente.webpush?.notification?.tag).toBe(`spot24-order-${code}-en_verificacion`);
    expect(sCliente.webpush?.notification?.renotify).toBe(true);
    expect(sCliente.webpush?.notification?.icon).toBe('/icons/icon-192.png');
    expect(sCliente.webpush?.notification?.badge).toBe('/icons/badge-96.png');
    expect(sCliente.webpush?.headers?.['TTL']).toBe('86400');

    // Envío 2: «Pago por verificar» → cajero + gerente + admin (NUNCA delivery).
    const sPagos = sends[1]!;
    expect([...sPagos.tokens].sort()).toEqual(['tok-caja-1', 'tok-gere-1', 'tok-jefe-1']);
    expect(sPagos.data['title']).toBe('SPOT 24 · Pago por verificar');
    expect(sPagos.data['body']).toBe(`${code}. Revísalo en el panel de pagos.`);
    expect(sPagos.data['aud']).toBe('pagos');
    expect(sPagos.data['orderCode']).toBe(code);
    expect(sPagos.data['clickUrl']).toBe('/admin/pagos');
    expect(sPagos.webpush?.notification?.tag).toBe(`spot24-pagos-${code}`);
    expect(sPagos.webpush?.notification?.renotify).toBe(true);
  });

  it('QA-2 · uploadReceipt legacy «pendiente» avisa UNA vez; re-subida no repite', async () => {
    const dbf = admin.firestore();
    // Pedido LEGACY: nacido «pendiente» sin comprobante (rondas anteriores).
    const ref = dbf.collection('orders').doc('qa-legacy-1');
    await ref.set({
      code: 'SP-QALEG-0001',
      uid: 'cli-qa',
      status: 'pendiente',
      lines: [{ productId: 'p9', variantId: 'w1', qty: 1 }],
      payment: { method: 'pago_movil', status: 'pendiente', hasReceipt: false },
      delivery: { mode: 'pickup' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 1.ª subida: pendiente → en_verificacion → aviso al cajero.
    vi.stubGlobal('fetch', vi.fn(async () => imgbbResponse('https://i.ibb.co/emu/qa-legacy-1.jpg')));
    try {
      const r = (await coreUploadReceipt(ctx('cli-qa', 'customer', {
        orderId: 'qa-legacy-1',
        image: RECEIPT_B64,
      }))) as { ok: boolean };
      expect(r.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    await waitForSendCount(3); // 2 previos + 1 nuevo
    const alerta = fcmRecorder.sends[2]!;
    expect(alerta.tokens.sort()).toEqual(['tok-caja-1', 'tok-gere-1', 'tok-jefe-1']);
    expect(alerta.data['title']).toBe('SPOT 24 · Pago por verificar');
    expect(alerta.data['aud']).toBe('pagos');
    expect(alerta.data['clickUrl']).toBe('/admin/pagos');
    const after = await ref.get();
    expect(after.data()?.['status']).toBe('en_verificacion');

    // 2.ª subida (reemplazo de foto sobre orden ya en verificación): SIN aviso.
    const before = fcmRecorder.sends.length;
    vi.stubGlobal('fetch', vi.fn(async () => imgbbResponse('https://i.ibb.co/emu/qa-legacy-2.jpg')));
    try {
      const r2 = (await coreUploadReceipt(ctx('cli-qa', 'customer', {
        orderId: 'qa-legacy-1',
        image: RECEIPT_B64,
      }))) as { ok: boolean };
      expect(r2.ok).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
    await expectNoNewSends(before);
  });

  it('QA-3 · preparado con envío → cadena delivery CTA → staff (cajero) → cliente', async () => {
    const dbf = admin.firestore();
    // Pedido pagado con envío, listo para pasar a PREPARADO por el admin.
    await dbf.collection('orders').doc('qa-desp-1').set({
      code: 'SP-QADESP-0001',
      uid: 'cli-qa',
      status: 'pagado',
      lines: [{ productId: 'p9', variantId: 'w1', qty: 1 }],
      payment: { method: 'pago_movil', status: 'aprobado', hasReceipt: true },
      delivery: { mode: 'delivery', zoneName: 'Araure' },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    await coreUpdateOrderStatus(ctx('jefe-1', 'admin', { orderId: 'qa-desp-1', to: 'preparado' }));
    await waitForSendCount(6); // 3 previos + delivery + staff + cliente

    const sDelivery = fcmRecorder.sends[3]!;
    expect(sDelivery.tokens).toEqual(['tok-repa-1']);
    expect(sDelivery.data['title']).toBe('SPOT 24 · Pedido listo para salir');
    expect(sDelivery.data['aud']).toBe('dispatch');
    expect(sDelivery.data['clickUrl']).toBe('/admin/despacho');
    expect(sDelivery.webpush?.notification?.tag).toBe('spot24-disp-SP-QADESP-0001');

    const sStaff = fcmRecorder.sends[4]!;
    expect([...sStaff.tokens].sort()).toEqual(['tok-caja-1', 'tok-gere-1', 'tok-jefe-1']);
    expect(sStaff.data['body']).toBe('SP-QADESP-0001 · Zona Araure. Disponible en el panel de despacho.');
    expect(sStaff.data['aud']).toBe('dispatch');

    const sCliente = fcmRecorder.sends[5]!;
    expect(sCliente.tokens).toEqual(['tok-cli-1']);
    expect(sCliente.data['title']).toBe('SPOT 24 · Pedido preparado');
    expect(sCliente.data['status']).toBe('preparado');
    expect(sCliente.data['clickUrl']).toBe('/pedidos');
  });
});
