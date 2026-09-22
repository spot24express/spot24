/**
 * SPOT 24 · Operaciones sensibles de pedidos (5.2/5.4, 6.3).
 * · fn-reserveStock: reserva de stock 2 h al entrar al checkout.
 * · fn-quoteTotals: cotización autoritativa (subtotal + envío por zona/peso + Bs).
 * · fn-createOrder: ÚNICO escritor de orders. Idempotente, con App Check,
 *   validación de stock, montos calculados SOLO aquí y antifraude.
 * · fn-cancelOrder: liberación de reserva y reposición de stock.
 * El cliente NUNCA calcula precios ni escribe en orders.
 */
import * as admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { encryptField, hashReference } from './lib/crypto';
import { enforceRateLimit, tryRateLimit } from './lib/ratelimit';
import { assessRisk, MAX_ORDERS_PER_HOUR } from './lib/fraud';
import { canTransition } from './domain/order-state';
import { ORDER_NOTIFICATIONS } from './lib/notifications';

void encryptField;
void hashReference;
void canTransition;

const db = () => admin.firestore(getAdminApp());

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_QTY_PER_LINE = 20;
const MAX_LINES = 50;
const MAX_PRICE_USD = 10_000;

/* ─────────────────────────── utilidades ─────────────────────────── */

interface AuthedCtx {
  uid: string;
  token: DecodedIdToken;
}

function requireAuth(ctx: CoreCtx): AuthedCtx {
  if (!ctx.auth) {
    throw new HttpsError('unauthenticated', 'Sesión requerida.');
  }
  return { uid: ctx.auth.uid, token: ctx.auth.token };
}

function requireAppCheck(ctx: CoreCtx): void {
  // App Check (6.2): en Cloud Functions consumeAppCheckToken=true ya verifica.
  // En el adaptador HTTP (Netlify Lite) solo se exige si APPCHECK_ENFORCE=true;
  // en modo monitoreo la petición continúa y queda registrada en logs.
  if (ctx.app) return;
  if (process.env['APPCHECK_ENFORCE'] === 'true') {
    throw new HttpsError('failed-precondition', 'App Check requerido.');
  }
}

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, max);
}

function sanitizeDigits(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/\D/g, '').slice(0, max);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/* ─────────────────────── reserva de stock (2 h) ─────────────────────── */

interface ReserveItem {
  productId: unknown;
  variantId: unknown;
  qty: unknown;
}

export async function coreReserveStock(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid } = requireAuth(ctx);
    requireAppCheck(ctx);
    await tryRateLimit({ bucket: 'reserve', identity: uid, max: 30, windowMs: 60 * 60 * 1000 });

    const items = Array.isArray(ctx.data?.['items']) ? (ctx.data['items'] as ReserveItem[]) : [];
    if (items.length === 0 || items.length > MAX_LINES) {
      throw new HttpsError('invalid-argument', 'Carrito vacío o demasiado grande.');
    }

    const expiresAt = Date.now() + RESERVATION_TTL_MS;
    const reservationRef = db().collection('reservations').doc();

    await db().runTransaction(async (tx) => {
      for (const it of items) {
        const productId = sanitizeStr(it.productId, 120);
        const variantId = sanitizeStr(it.variantId, 140);
        const qty = sanitizeDigits(String(it.qty ?? ''), 3);
        if (!productId || !variantId || !qty) {
          throw new HttpsError('invalid-argument', 'Ítem inválido.');
        }
        const qtyN = Number(qty);
        if (qtyN < 1 || qtyN > MAX_QTY_PER_LINE) {
          throw new HttpsError('invalid-argument', 'Cantidad fuera de rango.');
        }
        const variantRef = db().doc(`products/${productId}/variants/${variantId}`);
        const vsnap = await tx.get(variantRef);
        if (!vsnap.exists) throw new HttpsError('out-of-range', 'Variante inexistente.');
        const stock = Number(vsnap.data()?.['stock'] ?? 0);
        const reserved = Number(vsnap.data()?.['stockReserved'] ?? 0);
        const available = stock - reserved;
        if (qtyN > available) {
          throw new HttpsError('out-of-range', 'Sin stock suficiente.');
        }
        tx.update(variantRef, { stockReserved: reserved + qtyN });
      }
      tx.set(reservationRef, {
        uid,
        items: items.map((it) => ({
          productId: sanitizeStr(it.productId, 120),
          variantId: sanitizeStr(it.variantId, 140),
          qty: Number(sanitizeDigits(String(it.qty ?? ''), 3)),
        })),
        status: 'activa',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt,
      });
    });

    return { reservationId: reservationRef.id, expiresAt };
  }
}

export const fnReserveStock = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreReserveStock(req as unknown as CoreCtx),
);

/* ──────────────────── cotización autoritativa ──────────────────── */

interface QuoteReq {
  zoneId: unknown;
  items: unknown;
}

export async function coreQuoteTotals(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid } = requireAuth(ctx);
    requireAppCheck(ctx);
    await tryRateLimit({ bucket: 'quote', identity: uid, max: 120, windowMs: 60 * 60 * 1000 });

    const { zoneId, lines } = await validateQuoteReq(ctx.data as QuoteReq | undefined);
    const totals = await computeTotals(uid, lines, zoneId);
    const zoneSnap = await db().collection('zones').doc(zoneId).get();
    return {
      subtotalUsd: totals.subtotalUsd,
      shippingUsd: totals.shippingUsd,
      totalUsd: totals.totalUsd,
      totalVes: totals.totalVes,
      rateUsed: totals.rateUsed,
      weightKg: totals.weightKg,
      zoneName: zoneSnap.get('name') ?? zoneId,
      freeShipping: totals.shippingUsd === 0,
    };
  }
}

export const fnQuoteTotals = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 40 },
  (req: CallableRequest) => coreQuoteTotals(req as unknown as CoreCtx),
);

interface ValidLine {
  productId: string;
  variantId: string;
  qty: number;
}

async function validateQuoteReq(data: QuoteReq | undefined): Promise<{ zoneId: string; lines: ValidLine[] }> {
  const zoneId = sanitizeStr(data?.zoneId, 80);
  if (!zoneId) throw new HttpsError('invalid-argument', 'Zona requerida.');
  const raw = Array.isArray(data?.items) ? (data['items'] as ReserveItem[]) : [];
  if (raw.length === 0 || raw.length > MAX_LINES) {
    throw new HttpsError('invalid-argument', 'Carrito vacío o demasiado grande.');
  }
  const lines: ValidLine[] = raw.map((it) => {
    const productId = sanitizeStr(it.productId, 120);
    const variantId = sanitizeStr(it.variantId, 140);
    const qty = Number(sanitizeDigits(String(it.qty ?? ''), 3));
    if (!productId || !variantId || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new HttpsError('invalid-argument', 'Ítem inválido.');
    }
    return { productId, variantId, qty };
  });
  return { zoneId, lines };
}

/** Lee precios SOLO de Firestore y calcula todos los montos. */
async function computeTotals(
  _uid: string,
  lines: ValidLine[],
  zoneId: string,
): Promise<{ subtotalUsd: number; shippingUsd: number; totalUsd: number; totalVes: number; rateUsed: number; weightKg: number; linesSnapshot: ValidLineWithPrice[] }> {
  const [zoneSnap, rateSnap] = await Promise.all([
    db().collection('zones').doc(zoneId).get(),
    db().collection('rates').doc('bcv').get(),
  ]);
  if (!zoneSnap.exists || zoneSnap.data()?.['active'] !== true) {
    throw new HttpsError('failed-precondition', 'Zona no disponible.');
  }
  const rate = Number(rateSnap.data()?.['usdToVes'] ?? 0);
  if (!isFinitePositive(rate) || rate > 10_000_000) {
    throw new HttpsError('failed-precondition', 'Tasa BCV no disponible.');
  }

  let subtotal = 0;
  let weight = 0;
  const linesSnapshot: ValidLineWithPrice[] = [];

  for (const line of lines) {
    const vsnap = await db().doc(`products/${line.productId}/variants/${line.variantId}`).get();
    const psnap = await db().doc(`products/${line.productId}`).get();
    if (!vsnap.exists || !psnap.exists) {
      throw new HttpsError('out-of-range', 'Producto inexistente.');
    }
    if (psnap.data()?.['active'] !== true || vsnap.data()?.['active'] !== true) {
      throw new HttpsError('out-of-range', 'Producto no disponible.');
    }
    const price = Number(vsnap.data()?.['priceUsd'] ?? 0);
    const w = Number(vsnap.data()?.['weightKg'] ?? 0);
    if (!isFinitePositive(price) || price > MAX_PRICE_USD) {
      throw new HttpsError('out-of-range', 'Precio inválido.');
    }
    const lineTotal = round2(price * line.qty);
    subtotal += lineTotal;
    weight += w * line.qty;
    linesSnapshot.push({
      ...line,
      name: sanitizeStr(psnap.data()?.['name'], 120),
      variantName: sanitizeStr(vsnap.data()?.['name'], 80),
      sku: sanitizeStr(vsnap.data()?.['sku'], 40),
      unitPriceUsd: price,
      lineTotalUsd: lineTotal,
      weightKg: w,
      image: Array.isArray(psnap.data()?.['images']) ? String(psnap.data()!['images'][0] ?? '') : '',
      categoryId: sanitizeStr(psnap.data()?.['categoryId'], 60),
      slug: sanitizeStr(psnap.data()?.['slug'], 140),
    });
  }

  subtotal = round2(subtotal);
  weight = round2(weight);

  // Envío por zona y peso (regla 5.5).
  const fee = Number(zoneSnap.data()?.['feeUsd'] ?? 0);
  const freeFrom = Number(zoneSnap.data()?.['freeFromUsd'] ?? 0);
  const perKg = Number(zoneSnap.data()?.['weightRateUsdPerKg'] ?? 0);
  const baseWeight = Number(zoneSnap.data()?.['baseWeightKg'] ?? 5);
  const maxWeight = Number(zoneSnap.data()?.['maxWeightKg'] ?? 40);
  if (weight > maxWeight) {
    throw new HttpsError('out-of-range', 'Peso fuera de cobertura.');
  }
  const extraKg = Math.max(0, Math.ceil(weight - baseWeight));
  let shipping = round2(fee + extraKg * perKg);
  if (freeFrom > 0 && subtotal >= freeFrom) shipping = 0;

  const totalUsd = round2(subtotal + shipping);
  const totalVes = round2(totalUsd * rate);
  return { subtotalUsd: subtotal, shippingUsd: shipping, totalUsd, totalVes, rateUsed: rate, weightKg: weight, linesSnapshot };
}

interface ValidLineWithPrice extends ValidLine {
  name: string;
  variantName: string;
  sku: string;
  unitPriceUsd: number;
  lineTotalUsd: number;
  weightKg: number;
  image: string;
  categoryId: string;
  slug: string;
}

/* ─────────────────────── crear orden (idempotente) ─────────────────────── */

interface CreateOrderReq {
  idempotencyKey: unknown;
  reservationId: unknown;
  contact: unknown;
  address: unknown;
  deliveryWindow: unknown;
  notes: unknown;
  paymentMethod: unknown;
  paymentDetails: unknown;
}

const PAYMENT_METHODS = new Set(['pago_movil', 'transferencia', 'zelle', 'efectivo']);

export async function coreCreateOrder(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid, token } = requireAuth(ctx);
    requireAppCheck(ctx);
    // Límite duro de pedidos por hora (6.4 + 6.8).
    await enforceRateLimit({ bucket: 'createOrder', identity: uid, max: MAX_ORDERS_PER_HOUR, windowMs: 60 * 60 * 1000 });

    const req = validateCreateOrderReq(ctx.data as CreateOrderReq | undefined);

    // Idempotencia: misma clave → misma orden, sin duplicados (5.4).
    const idemRef = db().collection('idempotency').doc(`${uid}_${req.idempotencyKey}`);
    const existing = await idemRef.get();
    if (existing.exists) {
      const orderId = String(existing.data()?.['orderId'] ?? '');
      if (orderId) {
        const osnap = await db().collection('orders').doc(orderId).get();
        if (osnap.exists) {
          return buildCreateResponse(orderId, osnap.data() ?? {});
        }
      }
      throw new HttpsError('already-exists', 'Orden en proceso.');
    }

    const userSnap = await db().collection('users').doc(uid).get();
    const accountCreatedAtMs = Number(userSnap.data()?.['createdAtMs'] ?? 0) || Date.now();

    // Reserva válida: dueño correcto, activa, no vencida (2 h).
    let reservation: admin.firestore.DocumentSnapshot | null = null;
    if (req.reservationId) {
      const rsnap = await db().collection('reservations').doc(req.reservationId).get();
      if (!rsnap.exists || rsnap.data()?.['uid'] !== uid || rsnap.data()?.['status'] !== 'activa' || Number(rsnap.data()?.['expiresAt'] ?? 0) < Date.now()) {
        throw new HttpsError('failed-precondition', 'Reserva vencida. Confirma de nuevo.');
      }
      reservation = rsnap;
    }

    // Totales calculados SOLO aquí (6.3): precios, envío y Bs.
    const totals = await computeTotals(uid, req.lines, req.address['zoneId']);

    // Antifraude (6.8).
    const refRaw = req.paymentDetails['referencia'] ?? req.paymentDetails['referenciaZelle'] ?? '';
    const refHash = refRaw ? hashReference(req.paymentMethod, refRaw) : null;
    const risk = await assessRisk({ uid, totalUsd: totals.totalUsd, accountCreatedAtMs, refHash });

    // Número secuencial de código visible: SP-YYMMDD-NNNN.
    const seqRef = db().collection('counters').doc('orders_seq');
    const code = await db().runTransaction(async (tx) => {
      const s = await tx.get(seqRef);
      const current = s.exists ? Number(s.data()?.['count'] ?? 0) : 0;
      tx.set(seqRef, { count: current + 1 }, { merge: true });
      const d = new Date();
      const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      return `SP-${ymd}-${String(current + 1).padStart(4, '0')}`;
    });

    const orderId = db().collection('orders').doc().id;
    const now = Date.now();

    // Campos sensibles cifrados en reposo (6.7).
    const encContact = {
      name: req.contact['name'],
      phone: encryptField(req.contact['phone']),
      cedula: encryptField(req.contact['cedula']),
    };
    const encAddress = {
      state: req.address['state'],
      city: req.address['city'],
      zoneId: req.address['zoneId'],
      zoneName: req.address['zoneName'],
      details: encryptField(req.address['details']),
    };
    const encPaymentDetails: Record<string, string> = {};
    for (const [k, v] of Object.entries(req.paymentDetails)) {
      encPaymentDetails[k] = encryptField(String(v));
    }

    const orderDoc = {
      code,
      uid,
      status: 'pendiente' as const,
      lines: totals.linesSnapshot.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        name: l.name,
        variantName: l.variantName,
        sku: l.sku,
        unitPriceUsd: l.unitPriceUsd,
        qty: l.qty,
        lineTotalUsd: l.lineTotalUsd,
        image: l.image,
      })),
      totals: {
        subtotalUsd: totals.subtotalUsd,
        shippingUsd: totals.shippingUsd,
        totalUsd: totals.totalUsd,
        totalVes: totals.totalVes,
        rateUsed: totals.rateUsed,
        weightKg: totals.weightKg,
      },
      payment: {
        method: req.paymentMethod,
        status: 'pendiente',
        refHash,
        detailsEncrypted: encPaymentDetails,
        hasReceipt: false,
        masked: {
          banco: req.paymentDetails['banco'] ?? req.paymentDetails['bancoOrigen'] ?? '',
          telefono: req.paymentDetails['telefono'] ? `•••${String(req.paymentDetails['telefono']).slice(-4)}` : '',
          correo: req.paymentDetails['correo'] ? '•••' + String(req.paymentDetails['correo']).slice(-12) : '',
        },
        referenceMasked: refRaw ? `•••${refRaw.slice(-3)}` : '',
      },
      delivery: {
        zoneId: req.address['zoneId'],
        zoneName: req.address['zoneName'],
        window: req.deliveryWindow,
        addressEncrypted: encAddress,
        addressPreview: `${req.address['city']} · ${req.address['details'].slice(0, 40)}…`,
        trackingCode: null,
      },
      contact: {
        name: encContact.name,
        phoneMasked: `•••••${req.contact['phone'].slice(-4)}`,
        phoneEncrypted: encContact.phone,
        cedulaEncrypted: encContact.cedula,
      },
      notes: req.notes,
      riskFlags: risk.flags,
      needsReview: risk.needsReview,
      reservationId: req.reservationId ?? null,
      reservationExpiresAt: reservation ? Number(reservation.data()?.['expiresAt'] ?? 0) : null,
      claimRole: typeof token['role'] === 'string' ? token['role'] : 'customer',
      createdAt: now,
      updatedAt: now,
    };

    await db().runTransaction(async (tx) => {
      // Re-chequeo de idempotencia dentro de la transacción (carrera).
      const idemAgain = await tx.get(idemRef);
      if (idemAgain.exists) {
        throw new HttpsError('already-exists', 'Orden en proceso.');
      }
      tx.set(db().collection('orders').doc(orderId), orderDoc);
      tx.set(idemRef, { orderId, createdAt: now }, { merge: false });
      // Evento inicial del timeline.
      tx.set(db().collection('orders').doc(orderId).collection('events').doc('e0'), {
        status: 'pendiente',
        at: now,
        by: 'system',
        note: 'Pedido creado. Espera comprobante de pago.',
      });
      // Consume la reserva.
      if (reservation) {
        tx.set(db().collection('reservations').doc(req.reservationId!), { status: 'consumida', orderId }, { merge: true });
      }
      // Sin reserva explícita (flujo fallback): reserva y descuenta en el mismo paso.
      if (!reservation) {
        for (const l of req.lines) {
          const vref = db().doc(`products/${l.productId}/variants/${l.variantId}`);
          const vsnap = await tx.get(vref);
          if (!vsnap.exists) throw new HttpsError('out-of-range', 'Variante inexistente.');
          const stock = Number(vsnap.data()?.['stock'] ?? 0);
          const reserved = Number(vsnap.data()?.['stockReserved'] ?? 0);
          if (l.qty > stock - reserved) {
            throw new HttpsError('out-of-range', 'Sin stock suficiente.');
          }
          tx.update(vref, { stock: stock - l.qty });
        }
      }
    });

    void ORDER_NOTIFICATIONS.send(uid, code, 'pendiente');

    const after = await db().collection('orders').doc(orderId).get();
    return buildCreateResponse(orderId, after.data() ?? {});
  }
}

export const fnCreateOrder = onCall(
  {
    region: 'us-central1',
    consumeAppCheckToken: true,
    cors: true,
    maxInstances: 30,
  },
  (req: CallableRequest) => coreCreateOrder(req as unknown as CoreCtx),
);

function buildCreateResponse(orderId: string, data: admin.firestore.DocumentData) {
  const totals = data['totals'] as Record<string, number>;
  return {
    orderId,
    code: String(data['code'] ?? ''),
    totals: {
      subtotalUsd: Number(totals?.['subtotalUsd'] ?? 0),
      shippingUsd: Number(totals?.['shippingUsd'] ?? 0),
      totalUsd: Number(totals?.['totalUsd'] ?? 0),
      totalVes: Number(totals?.['totalVes'] ?? 0),
      rateUsed: Number(totals?.['rateUsed'] ?? 0),
      weightKg: Number(totals?.['weightKg'] ?? 0),
    },
    riskFlags: Array.isArray(data['riskFlags']) ? (data['riskFlags'] as string[]) : [],
  };
}

function validateCreateOrderReq(data: CreateOrderReq | undefined): {
  idempotencyKey: string;
  reservationId: string | null;
  lines: ValidLine[];
  contact: { name: string; phone: string; cedula: string };
  address: { state: string; city: string; zoneId: string; zoneName: string; details: string };
  deliveryWindow: { start: string; end: string };
  notes: string;
  paymentMethod: string;
  paymentDetails: Record<string, string>;
} {
  if (!data) throw new HttpsError('invalid-argument', 'Datos faltantes.');

  const idempotencyKey = sanitizeStr(data.idempotencyKey, 80);
  if (!/^[0-9a-f]{8,80}$/.test(idempotencyKey)) {
    throw new HttpsError('invalid-argument', 'Clave de idempotencia inválida.');
  }

  // Líneas: del payload o de la reserva activa.
  let lines: ValidLine[] = [];
  const raw = Array.isArray((data as unknown as Record<string, unknown>)['items']) ? ((data as unknown as Record<string, unknown>)['items'] as ReserveItem[]) : [];
  if (raw.length > 0) {
    lines = raw.map((it) => ({
      productId: sanitizeStr(it.productId, 120),
      variantId: sanitizeStr(it.variantId, 140),
      qty: Number(sanitizeDigits(String(it.qty ?? ''), 3)),
    }));
    if (lines.some((l) => !l.productId || !l.variantId || l.qty < 1 || l.qty > MAX_QTY_PER_LINE)) {
      throw new HttpsError('invalid-argument', 'Ítem inválido.');
    }
    if (lines.length > MAX_LINES) throw new HttpsError('invalid-argument', 'Demasiadas líneas.');
  } else {
    // La fuente del carrito es la reserva (creada con los ítems al entrar).
    // Para simplicidad, exigimos items explícitos siempre.
    throw new HttpsError('invalid-argument', 'Carrito vacío.');
  }

  const c = (data.contact ?? {}) as Record<string, unknown>;
  const a = (data.address ?? {}) as Record<string, unknown>;
  const w = (data.deliveryWindow ?? {}) as Record<string, unknown>;
  const pd = (data.paymentDetails ?? {}) as Record<string, unknown>;
  const paymentMethod = sanitizeStr(data.paymentMethod, 20);

  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw new HttpsError('invalid-argument', 'Método de pago inválido.');
  }

  const contact = {
    name: sanitizeStr(c['name'], 80),
    phone: sanitizeDigits(c['phone'], 11),
    cedula: sanitizeStr(c['cedula'], 12).toUpperCase(),
  };
  if (contact.name.length < 2 || contact.phone.length !== 11 || !/^[VE]-?\d{1,8}$/.test(contact.cedula)) {
    throw new HttpsError('invalid-argument', 'Datos de contacto inválidos.');
  }

  const address = {
    state: sanitizeStr(a['state'], 40),
    city: sanitizeStr(a['city'], 60),
    zoneId: sanitizeStr(a['zoneId'], 80),
    zoneName: sanitizeStr(a['zoneName'], 120),
    details: sanitizeStr(a['details'], 500),
  };
  if (!address.zoneId || address.city.length < 2 || address.details.length < 8) {
    throw new HttpsError('invalid-argument', 'Dirección incompleta.');
  }

  const deliveryWindow = {
    start: sanitizeStr(w['start'], 5) || '08:00',
    end: sanitizeStr(w['end'], 5) || '20:00',
  };

  const paymentDetails: Record<string, string> = {};
  for (const [k, v] of Object.entries(pd)) {
    if (typeof k === 'string' && k.length <= 40) {
      paymentDetails[sanitizeStr(k, 40)] = sanitizeStr(v, 120);
    }
  }

  const notes = sanitizeStr(data.notes, 300);
  const reservationId = data.reservationId ? sanitizeStr(data.reservationId, 120) || null : null;

  return { idempotencyKey, reservationId, lines, contact, address, deliveryWindow, notes, paymentMethod, paymentDetails };
}

/* ─────────────────────────── cancelar orden ─────────────────────────── */

export async function coreCancelOrder(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid } = requireAuth(ctx);
    requireAppCheck(ctx);
    await tryRateLimit({ bucket: 'cancel', identity: uid, max: 20, windowMs: 60 * 60 * 1000 });

    const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
    const reason = sanitizeStr(ctx.data?.['reason'], 300) || 'cancelado';
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId requerido.');

    const ref = db().collection('orders').doc(orderId);
    let ownerUid = uid;
    let orderCode = '';
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
      const data = snap.data()!;
      ownerUid = String(data['uid'] ?? uid);
      orderCode = String(data['code'] ?? '');
      const isAdmin = (ctx.auth?.token as Record<string, unknown> | undefined)?.['role'] === 'admin';
      if (data['uid'] !== uid && !isAdmin) {
        throw new HttpsError('permission-denied', 'No autorizado.');
      }
      const status = data['status'] as string;
      if (!canTransition(status as never, 'cancelado')) {
        throw new HttpsError('failed-precondition', 'Estado no cancelable.');
      }
      tx.update(ref, { status: 'cancelado', updatedAt: Date.now() });
      tx.set(
        ref.collection('events').doc(),
        { status: 'cancelado', at: Date.now(), by: isAdmin ? 'admin' : 'system', note: reason.slice(0, 200) },
      );

      // Reposición de stock: reserva viva → libera; si no, repone directo.
      const reservationId = data['reservationId'] as string | null;
      if (reservationId && data['status'] === 'pendiente') {
        const rsnap = await tx.get(db().collection('reservations').doc(reservationId));
        if (rsnap.exists && rsnap.data()?.['status'] === 'activa') {
          for (const item of (rsnap.data()?.['items'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
            const vref = db().doc(`products/${item.productId}/variants/${item.variantId}`);
            const vsnap = await tx.get(vref);
            if (vsnap.exists) {
              tx.update(vref, {
                stockReserved: Math.max(0, Number(vsnap.data()?.['stockReserved'] ?? 0) - item.qty),
              });
            }
          }
          tx.set(db().collection('reservations').doc(reservationId), { status: 'liberada' }, { merge: true });
        }
      } else if (data['status'] !== 'pendiente') {
        for (const line of (data['lines'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
          const vref = db().doc(`products/${line.productId}/variants/${line.variantId}`);
          const vsnap = await tx.get(vref);
          if (vsnap.exists) {
            tx.update(vref, { stock: Number(vsnap.data()?.['stock'] ?? 0) + line.qty });
          }
        }
      }
    });

    void ORDER_NOTIFICATIONS.send(ownerUid, orderCode, 'cancelado');
    return { ok: true };
  }
}

export const fnCancelOrder = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreCancelOrder(req as unknown as CoreCtx),
);
