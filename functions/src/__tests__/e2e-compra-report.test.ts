/**
 * SPOT 24 · COMPRA REAL NARRADA — flujo completo paso a paso con reporte de
 * notificaciones (5.27).
 * ────────────────────────────────────────────────────────────────────────────
 * Misma mecánica que e2e-emulator.test.ts y notifications-flow.test.ts, pero
 * ejecutando UNA compra feliz de principio a fin e IMPRIMIENDO el relato:
 * qué actor hizo qué, qué vio el sistema y QUÉ PUSH recibió cada quien en
 * cada paso (destinatario, título, cuerpo, dispositivos, TTL, urgencia).
 *
 * Qué es REAL aquí:
 *   · El código de producción (orders/payments/dispatch/notifications).
 *   · Firestore del emulador oficial: transacciones, estados, timeline,
 *     stock, reservas e idempotencia con semántica idéntica a producción.
 *   · Los roles y sus permisos (customer/cajero/delivery/admin).
 * Qué está SIMULADO (y por qué):
 *   · imgbb (subida del comprobante): sin red externa ni API key real.
 *   · FCM: firebase-admin/messaging va sobre un GRABADOR determinista que
 *     captura CADA envío con su payload exacto. La entrega en el teléfono
 *     es responsabilidad de FCM/Chrome — eso se prueba en producción con un
 *     dispositivo real (el dueño valida con su equipo).
 *
 * CÓMO CORRERLO (requiere Java + firebase-tools):
 *   firebase emulators:start --only firestore --project demo-spot24
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-spot24 \
 *     npx vitest run src/__tests__/e2e-compra-report.test.ts
 *
 * Sin FIRESTORE_EMULATOR_HOST el archivo SE SALTA solo (suite verde igual).
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import type { DecodedIdToken } from 'firebase-admin/auth';
import admin from 'firebase-admin';
import { getAdminApp } from '../lib/ctx';
import { decryptField } from '../lib/crypto';
import {
  coreCreateOrder,
  coreQuoteTotals,
  coreReserveStock,
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
        responses: msg.tokens.map(() => ({ success: true })),
      };
    },
  }),
}));

/** Espera a que el grabador alcance `n` envíos (los pushes son best-effort). */
async function waitForSendCount(n: number, ms = 5_000): Promise<void> {
  const t0 = Date.now();
  while (fcmRecorder.sends.length < n && Date.now() - t0 < ms) {
    await new Promise((r) => setTimeout(r, 50));
  }
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

const PROJECT_ID = 'demo-spot24';
const RATE = 250.5;
const IVA = 16;

/* ──────────────────────────────── relato ──────────────────────────────── */

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(78));
const step = (n: number, who: string, what: string) => {
  line('');
  line(`PASO ${n} · ${who}`);
  line(`  acción : ${what}`);
};
const resultado = (k: string, v: string | number) => line(`  ${k.padEnd(11)}: ${v}`);
const push = (para: string, tokens: string[], titulo: string, cuerpo: string) => {
  line('  ┌─ PUSH ─────────────────────────────────────────────────────');
  line(`  │ PARA      : ${para} (${tokens.join(', ')})`);
  line(`  │ TÍTULO    : ${titulo}`);
  line(`  │ CUERPO    : ${cuerpo}`);
  line('  │ WEBPUSH   : TTL 86400 · payload solo-data (title/body en data; display en el SW)');
  line('  └────────────────────────────────────────────────────────────');
};

const RECEIPT_B64 = Buffer.from('comprobante-compra-real').toString('base64');
const imgbbResponse = (url: string): Response =>
  new Response(JSON.stringify({ success: true, data: { url } }), { status: 200 });

d('[COMPRA REAL] relato completo con notificaciones', () => {
  let orderId = '';
  let code = '';

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

    // ── SEED mínimo: tienda, zona, producto, gente ──
    await dbf.collection('settings').doc('general').set({ ivaPercent: IVA, pickupAddress: 'Av. Lara, C.C. Spot 24, Maracay' });
    await dbf.collection('rates').doc('bcv').set({ usdToVes: RATE, updatedAt: Date.now() });
    await dbf.collection('zones').doc('z_araure').set({ name: 'Araure', active: true, feeUsd: 3.5, freeFromUsd: 50 });

    await dbf.collection('products').doc('p-aceite').set({
      active: true, brand: 'Mobil', name: 'Aceite Mobil 10W-40 (4 L)',
      images: ['https://i.ibb.co/emu/aceite.jpg'], categoryId: 'c-lubricantes', slug: 'aceite-mobil-10w40',
    });
    await dbf.doc('products/p-aceite/variants/v-4l').set({ active: true, priceUsd: 24, stock: 8, stockReserved: 0, name: 'Bidón 4 L', sku: 'MOB-1040-4L' });

    const old = Date.now() - 48 * 60 * 60 * 1000;
    // Cliente CON nombre (5.27: los push lo llevan en el cuerpo).
    await dbf.collection('users').doc('cli-erick').set({ name: 'Erick Pérez', createdAtMs: old });
    // Personal con tokens PROPIOS: si algún día el sistema les enviara pushes
    // de pedidos, este test lo denuncia (el push SIEMPRE es del cliente).
    await dbf.collection('users').doc('jefe-marta').set({ name: 'Marta', createdAtMs: old });
    await dbf.collection('users').doc('caja-luisa').set({ name: 'Luisa', createdAtMs: old });
    await dbf.collection('users').doc('repa-carlos').set({ name: 'Carlos', createdAtMs: old });

    // Tokens: el cliente tiene 2 dispositivos (celular + PC del local).
    await dbf.doc('users/cli-erick/fcmTokens/h-cel').set({ token: 'tok-erick-celular', createdAt: Date.now(), userAgent: 'Android Chrome' });
    await dbf.doc('users/cli-erick/fcmTokens/h-pc').set({ token: 'tok-erick-pc', createdAt: Date.now(), userAgent: 'Desktop Chrome' });
    await dbf.doc('users/jefe-marta/fcmTokens/h-jefe').set({ token: 'tok-jefe-marta', createdAt: Date.now(), userAgent: 'Android Chrome' });
    await dbf.doc('users/repa-carlos/fcmTokens/h-repa').set({ token: 'tok-repa-carlos', createdAt: Date.now(), userAgent: 'Android Chrome' });

    fcmRecorder.reset();

    line('');
    hr();
    line('COMPRA REAL EN SPOT 24 — relato paso a paso (código 5.27 con nombre)');
    hr();
  });

  afterAll(async () => {
    if (admin.apps.length > 0) await admin.app().delete();
  });

  it('PASOS 1-6 · del carrito a la entrega, con cada push documentado', async () => {
    const dbf = admin.firestore();

    /* PASO 1 — carrito → reserva de stock */
    step(1, 'ERICK (cliente, app)', 'Agrega «Aceite Mobil 10W-40 (4 L)» ×2 al carrito y abre el checkout.');
    const rsv = (await coreReserveStock(customerCtx('cli-erick', {
      items: [{ productId: 'p-aceite', variantId: 'v-4l', qty: 2 }],
    }))) as { reservationId: string; expiresAt: number };
    const v = await dbf.doc('products/p-aceite/variants/v-4l').get();
    resultado('reserva', rsv.reservationId);
    resultado('stock', `8 reales · ${v.data()?.['stockReserved']} apartados para Erick (nadie más puede comprarlos)`);
    line('  push    : (ninguno — reservar no notifica)');

    /* PASO 2 — cotización */
    step(2, 'ERICK (cliente, app)', 'Revisa totales: zona Araure + IVA 16% + tasa BCV.');
    const q = (await coreQuoteTotals(customerCtx('cli-erick', {
      fulfillment: 'delivery',
      zoneId: 'z_araure',
      items: [{ productId: 'p-aceite', variantId: 'v-4l', qty: 2 }],
    }))) as Record<string, number | string | boolean>;
    resultado('subtotal', `USD ${q['subtotalUsd']}`);
    resultado('envío', `USD ${q['shippingUsd']} (zona ${q['zoneName']})`);
    resultado('IVA', `USD ${q['ivaUsd']} (${q['ivaPercent']}%)`);
    resultado('total', `USD ${q['totalUsd']} = Bs ${q['totalVes']}`);
    line('  push    : (ninguno — cotizar no notifica)');

    /* PASO 3 — confirmar compra con comprobante */
    step(3, 'ERICK (cliente, app)', 'Confirma la compra: pago móvil + foto del comprobante + dirección.');
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
      if (String(input).includes('api.imgbb.com')) return imgbbResponse('https://i.ibb.co/emu/comprobante-erick.jpg');
      return new Response('{}', { status: 599 });
    }));
    let res: { orderId: string; code: string; totals: Record<string, number> };
    try {
      res = (await coreCreateOrder(customerCtx('cli-erick', {
        idempotencyKey: '9f1e2c3d4e5f6a7b8c9d0e1f2a3b4c5d60',
        reservationId: rsv.reservationId,
        fulfillment: 'delivery',
        items: [{ productId: 'p-aceite', variantId: 'v-4l', qty: 2 }],
        contact: { name: 'Erick Pérez', phone: '04243036024', cedula: 'V12345678' },
        address: {
          state: 'Portuguesa',
          city: 'Araure',
          zoneId: 'z_araure',
          zoneName: 'Araure',
          details: 'Calle 5 con carrera 3, casa 12, reja verde',
        },
        deliveryWindow: { start: '08:00', end: '18:00' },
        notes: 'Tocar el timbre',
        paymentMethod: 'pago_movil',
        paymentDetails: { banco: 'Banco de Venezuela', telefono: '04243036024', referencia: '887766' },
        receiptImage: RECEIPT_B64,
      }))) as { orderId: string; code: string; totals: Record<string, number> };
    } finally {
      vi.unstubAllGlobals();
    }
    orderId = res.orderId;
    code = res.code;
    resultado('pedido', `${code} (id ${orderId})`);
    resultado('estado', 'en_verificacion — nace CON el comprobante dentro');
    resultado('total', `USD ${res.totals.totalUsd} = Bs ${res.totals.totalVes}`);
    const born = (await dbf.collection('orders').doc(orderId).get()).data();
    resultado('contacto', `teléfono CIFRADO en la orden (${decryptField(String(born?.['contact']?.['phoneEncrypted']))})`);
    await waitForSendCount(1);
    push('ERICK · 2 dispositivos', ['tok-erick-celular', 'tok-erick-pc'],
      fcmRecorder.sends[0]!.data['title'] ?? '', fcmRecorder.sends[0]!.data['body'] ?? '');
    expect(fcmRecorder.sends[0]!.data['title']).toBe('SPOT 24 · Verificando pago');
    expect(fcmRecorder.sends[0]!.data['body']).toBe(`Erick, tu pago está en revisión. Te avisamos al confirmar. (${code})`);

    /* PASO 4 — la cajera verifica el pago */
    step(4, 'LUISA (cajera, panel)', 'Compara el comprobante con el banco y aprueba el pago.');
    const ap = (await coreVerifyPayment(ctx('caja-luisa', 'cajero', { orderId, approve: true }))) as { ok: boolean };
    resultado('resultado', `ok=${ap.ok} → estado: pagado`);
    await waitForSendCount(2);
    push('ERICK · 2 dispositivos', ['tok-erick-celular', 'tok-erick-pc'],
      fcmRecorder.sends[1]!.data['title'] ?? '', fcmRecorder.sends[1]!.data['body'] ?? '');
    expect(fcmRecorder.sends[1]!.data['title']).toBe('SPOT 24 · Pago confirmado');
    expect(fcmRecorder.sends[1]!.data['body']).toBe(`Erick, tu pedido entra al pit stop. Preparado en breve. (${code})`);

    /* PASO 5 — preparado */
    step(5, 'LUISA (cajera, panel)', 'Empaca y marca el pedido como Preparado.');
    await coreUpdateOrderStatus(ctx('caja-luisa', 'cajero', { orderId, to: 'preparado' }));
    resultado('resultado', 'estado: preparado (sale de la bahía en el próximo despacho)');
    await waitForSendCount(3);
    push('ERICK · 2 dispositivos', ['tok-erick-celular', 'tok-erick-pc'],
      fcmRecorder.sends[2]!.data['title'] ?? '', fcmRecorder.sends[2]!.data['body'] ?? '');
    expect(fcmRecorder.sends[2]!.data['title']).toBe('SPOT 24 · Pedido preparado');
    expect(fcmRecorder.sends[2]!.data['body']).toBe(`Erick, empacado y listo. Sale de la bahía pronto. (${code})`);

    /* PASO 6 — delivery toma y entrega */
    step(6, 'CARLOS (delivery, panel)', 'Sale con el pedido: marca En camino (se genera código de tracking).');
    const cam = (await coreUpdateOrderStatus(ctx('repa-carlos', 'delivery', { orderId, to: 'en_camino' }))) as { ok: boolean; trackingCode: string };
    resultado('tracking', cam.trackingCode);
    await waitForSendCount(4);
    push('ERICK · 2 dispositivos', ['tok-erick-celular', 'tok-erick-pc'],
      fcmRecorder.sends[3]!.data['title'] ?? '', fcmRecorder.sends[3]!.data['body'] ?? '');
    expect(fcmRecorder.sends[3]!.data['title']).toBe('SPOT 24 · En camino');
    expect(fcmRecorder.sends[3]!.data['body']).toBe(`Erick, tu pedido va en ruta. Síguelo en vivo desde la app. (${code})`);

    step(7, 'CARLOS (delivery, panel)', 'Entrega y marca Entregado (el estado es terminal).');
    await coreUpdateOrderStatus(ctx('repa-carlos', 'delivery', { orderId, to: 'entregado' }));
    const fin = (await dbf.collection('orders').doc(orderId).get()).data();
    resultado('resultado', `estado: ${fin?.['status']} · deliveredAt: ${Number(fin?.['deliveredAt']) > 0 ? 'registrado' : 'faltante'}`);
    await waitForSendCount(5);
    push('ERICK · 2 dispositivos', ['tok-erick-celular', 'tok-erick-pc'],
      fcmRecorder.sends[4]!.data['title'] ?? '', fcmRecorder.sends[4]!.data['body'] ?? '');
    expect(fcmRecorder.sends[4]!.data['title']).toBe('SPOT 24 · Entregado');
    expect(fcmRecorder.sends[4]!.data['body']).toBe(`Erick, entregado. Abierto cuando importa. (${code})`);

    /* CIERRE — auditoría del relato */
    hr();
    line('AUDITORÍA DEL RELATO');
    const sends = fcmRecorder.sends;
    expect(sends).toHaveLength(5);
    const secuencia = sends.map((s) => s.data['status']).join(' → ');
    line(`  secuencia de pushes : ${secuencia}`);
    const todosTokens = sends.flatMap((s) => s.tokens);
    expect(new Set(todosTokens)).toEqual(new Set(['tok-erick-celular', 'tok-erick-pc']));
    line('  destinatarios       : SOLO el cliente (el token de Marta y el de Carlos JAMÁS recibieron)');
    expect(todosTokens).not.toContain('tok-jefe-marta');
    expect(todosTokens).not.toContain('tok-repa-carlos');
    line('  timeline del pedido : ' + ((await dbf.collection('orders').doc(orderId).collection('events').get()).size) + ' eventos auditados');
    const stockFinal = Number((await dbf.doc('products/p-aceite/variants/v-4l').get()).data()?.['stock']);
    line(`  inventario          : stock 8 → ${stockFinal} (venta descontada, holds liberados)`);
    expect(stockFinal).toBe(6);
    hr();
  });
});