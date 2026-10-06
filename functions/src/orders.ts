/**
 * SPOT 24 · Operaciones sensibles de pedidos (5.2/5.4, 6.3).
 * · fn-reserveStock: reserva de stock 2 h al entrar al checkout. ÚNICA activa
 *   por usuario (doc u_{uid}): re-reservar libera el hold anterior (5i-b).
 * · fn-quoteTotals: cotización autoritativa (subtotal + envío por zona + IVA + Bs).
 * · fn-createOrder: ÚNICO escritor de orders. Idempotente, con App Check,
 *   validación de stock, montos calculados SOLO aquí y antifraude.
 *   FLUJO ESTRICTO (5i-k): exige el comprobante de pago (base64 → imgbb) y
 *   la orden NACE en en_verificacion con hasReceipt: true. Si la subida del
 *   comprobante falla, NO se crea la orden: no existen pedidos sin pago.
 * · fn-cancelOrder: liberación de reserva y reposición de stock.
 * El cliente NUNCA calcula precios ni escribe en orders.
 *
 * Modalidades de entrega: 'delivery' (envío por zona) y 'pickup' (retiro en
 * tienda en Maracay, Aragua — sin costo de envío).
 * IVA: porcentaje configurable por el admin en settings/general.ivaPercent
 * (0–100; 0 = sin IVA). Se aplica sobre subtotal + envío.
 */
import admin from 'firebase-admin';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { encryptField, hashReference } from './lib/crypto';
import { enforceRateLimit, tryRateLimit } from './lib/ratelimit';
import { assessRisk, MAX_ORDERS_PER_HOUR } from './lib/fraud';
import { canTransition } from './domain/order-state';
import { ORDER_NOTIFICATIONS } from './lib/notifications';
import { extractItems } from './lib/items';

void encryptField;
void hashReference;
void canTransition;

const db = () => admin.firestore(getAdminApp());

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_QTY_PER_LINE = 20;
const MAX_LINES = 50;
const MAX_PRICE_USD = 10_000;

/* Comprobante de pago: tope defensivo del base64 sin prefijo data: (el
 * cliente comprime antes) y endpoint del host de imágenes. Funciona sin
 * bucket de Storage (plan Spark): la imagen vive en imgbb. */
const MAX_RECEIPT_BASE64 = 5_500_000;
const IMGBB_ENDPOINT = 'https://api.imgbb.com/1/upload';

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

/**
 * Normaliza y valida el comprobante en base64 que envía el cliente (5i-k).
 * Compartido por fn-createOrder (obligatorio) y fn-uploadReceipt (re-subida).
 * · Defensa: si el cliente envió data:image/...;base64,XX, conservamos XX.
 * · Quita espacios, valida el cuerpo base64 y el tope de tamaño.
 * Lanza HttpsError con mensaje accionable si algo no cuadra.
 */
function requireReceiptImage(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new HttpsError('invalid-argument', 'Falta el comprobante de pago: adjunta la foto antes de confirmar.');
  }
  const image = raw.slice(raw.indexOf(',') + 1).replace(/\s/g, '');
  if (image.length > MAX_RECEIPT_BASE64) {
    throw new HttpsError('invalid-argument', 'La imagen pasa de 5 MB comprimida.');
  }
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image)) {
    throw new HttpsError('invalid-argument', 'Imagen inválida (base64 esperado).');
  }
  return image;
}

/**
 * Sube el comprobante a imgbb y devuelve la URL pública.
 * La clave IMGBB_API_KEY vive SOLO en el servidor (nunca en el cliente).
 */
async function uploadReceiptToImgbb(image: string): Promise<string> {
  const key = process.env['IMGBB_API_KEY'] ?? '';
  if (!key) {
    throw new HttpsError(
      'failed-precondition',
      'IMGBB_API_KEY no configurada en el servidor (Netlify → Environment variables) y redeploy.',
    );
  }

  let res: Response;
  try {
    res = await fetch(IMGBB_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ key, image }).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HttpsError('unavailable', 'No pudimos contactar a imgbb. Reintenta en unos segundos.');
  }
  if (!res.ok) {
    throw new HttpsError('unavailable', `imgbb rechazó la subida (HTTP ${res.status}).`);
  }
  const json = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: { url?: string } }
    | null;
  const url = json?.data?.url;
  if (json?.success !== true || typeof url !== 'string' || !url.startsWith('https://')) {
    throw new HttpsError('internal', 'imgbb no devolvió la dirección del comprobante.');
  }
  return url;
}

/* ─────────────────────── reserva de stock (2 h) ─────────────────────── */

export async function coreReserveStock(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid } = requireAuth(ctx);
    requireAppCheck(ctx);
    await tryRateLimit({ bucket: 'reserve', identity: uid, max: 30, windowMs: 60 * 60 * 1000 });

    // Acepta {items:[...]} (contrato) y el array pelado (cliente antiguo).
    const items = extractItems(ctx.data);
    if (items.length === 0 || items.length > MAX_LINES) {
      throw new HttpsError('invalid-argument', 'Carrito vacío o demasiado grande.');
    }

    const expiresAt = Date.now() + RESERVATION_TTL_MS;
    // Ronda 5i-b — RESERVA ÚNICA POR USUARIO (id determinista u_{uid}).
    // Antes: doc() aleatorio → CADA llamada creaba OTRA reserva y apilaba
    // stockReserved += qty sobre las mismas variantes (el doble disparo de
    // StrictMode en dev, un reintento tras un timeout de 25 s — el servidor
    // completó la reserva igual: el 200 llegó a un cliente que ya colgó — o
    // dos pestañas del mismo usuario). Resultado: holds fantasma hasta 2 h
    // y «Sin stock suficiente» espectral. Ahora: re-reservar LIBERA los
    // holds de la reserva 'activa' previa del mismo uid y crea la nueva en
    // la MISMA transacción → resultado idempotente, a lo sumo 1 hold vivo
    // por usuario. Los doc aleatorios históricos los sigue barriendo el
    // bloque de abajo cuando vencen.
    const reservationRef = db().collection('reservations').doc(`u_${uid}`);

    // Ronda 5i — BARRIDO de reservas EXPIRADAS que siguen 'activa'.
    // Sin esto, cada checkout abandonado (cerrar pestaña, reserva vencida,
    // orden que nunca llegó a crearse) dejaba stockReserved inflado PARA
    // SIEMPRE: available = stock - stockReserved acababa en 0 y TODO
    // checkout posterior fallaba con «Sin stock suficiente.» (out-of-range).
    // Consulta por campo único (status) — NO requiere índice compuesto — y
    // el filtro de vencimiento va en código. Tope 10 por llamada para acotar
    // latencia: el resto lo barre la siguiente llamada (rate limit 30/h).
    try {
      const staleSnap = await db()
        .collection('reservations')
        .where('status', '==', 'activa')
        .limit(10)
        .get();
      const nowMs = Date.now();
      const expired = staleSnap.docs.filter(
        (d) => Number(d.data()?.['expiresAt'] ?? 0) < nowMs,
      );
      for (const stale of expired) {
        await db().runTransaction(async (tx) => {
          // Re-lectura DENTRO de la tx: pudo ser consumida/liberada mientras
          // tanto por createOrder/cancelOrder de otra petición.
          const fresh = await tx.get(stale.ref);
          if (!fresh.exists || fresh.data()?.['status'] !== 'activa') return;
          if (Number(fresh.data()?.['expiresAt'] ?? 0) >= nowMs) return;
          const held = (fresh.data()?.['items'] ?? []) as Array<{
            productId: string;
            variantId: string;
            qty: number;
          }>;
          const unreserve: Array<{
            ref: admin.firestore.DocumentReference;
            newReserved: number;
          }> = [];
          for (const item of held) {
            const vref = db().doc(`products/${item.productId}/variants/${item.variantId}`);
            const vsnap = await tx.get(vref);
            if (vsnap.exists) {
              unreserve.push({
                ref: vref,
                newReserved: Math.max(0, Number(vsnap.data()?.['stockReserved'] ?? 0) - Number(item.qty ?? 0)),
              });
            }
          }
          // ── Escrituras al final (regla de transacciones Firestore) ──
          for (const p of unreserve) {
            tx.update(p.ref, { stockReserved: p.newReserved });
          }
          tx.set(stale.ref, { status: 'vencida', liberadaEn: Date.now() }, { merge: true });
        });
      }
    } catch (sweepErr) {
      // Best-effort: si el barrido falla, la reserva sigue viva y se
      // reintentará en la próxima llamada. NUNCA bloquea la reserva nueva.
      console.warn('[reserveStock] barrido de reservas vencidas falló:', sweepErr);
    }

    await db().runTransaction(async (tx) => {
      // REGLA DE TRANSACCIONES FIRESTORE: TODAS las lecturas antes que
      // CUALQUIER escritura. Se lee la reserva previa del usuario y se leen y
      // validan TODAS las variantes (las nuevas y las del hold anterior);
      // las escrituras van al final.

      // Ronda 5i-b: hold de la reserva previa del MISMO usuario que vamos a
      // reemplazar. Solo si sigue 'activa' (consumida/liberada/vencida ya no
      // retiene stock: eso lo liquidaron createOrder/cancelOrder/barrido).
      const prevSnap = await tx.get(reservationRef);
      const prevHeld = new Map<string, { ref: admin.firestore.DocumentReference; qty: number }>();
      if (prevSnap.exists && prevSnap.data()?.['status'] === 'activa') {
        for (const item of (prevSnap.data()?.['items'] ?? []) as Array<{
          productId: string;
          variantId: string;
          qty: number;
        }>) {
          if (!item.productId || !item.variantId) continue;
          const key = `${item.productId}/${item.variantId}`;
          const cur = prevHeld.get(key) ?? {
            ref: db().doc(`products/${item.productId}/variants/${item.variantId}`),
            qty: 0,
          };
          cur.qty += Number(item.qty ?? 0);
          prevHeld.set(key, cur);
        }
      }

      // Líneas nuevas fusionadas por productId+variantId (defensivo: el
      // carrito del cliente ya deduplica desde la 5e, pero el endpoint es
      // público; sin merge, dos líneas de la misma variante pisaban su
      // propia escritura de stockReserved).
      const merged = new Map<string, { productId: string; variantId: string; qty: number }>();
      for (const it of items) {
        const productId = sanitizeStr(it.productId, 120);
        const variantId = sanitizeStr(it.variantId, 140);
        const qty = Number(sanitizeDigits(String(it.qty ?? ''), 3));
        if (!productId || !variantId || !qty) {
          throw new HttpsError('invalid-argument', 'Ítem inválido.');
        }
        if (qty < 1 || qty > MAX_QTY_PER_LINE) {
          throw new HttpsError('invalid-argument', 'Cantidad fuera de rango.');
        }
        const key = `${productId}/${variantId}`;
        const cur = merged.get(key);
        if (cur) {
          cur.qty = Math.min(MAX_QTY_PER_LINE, cur.qty + qty);
        } else {
          merged.set(key, { productId, variantId, qty });
        }
      }

      const writes: Array<{ ref: admin.firestore.DocumentReference; newReserved: number }> = [];
      for (const line of merged.values()) {
        const variantRef = db().doc(`products/${line.productId}/variants/${line.variantId}`);
        const vsnap = await tx.get(variantRef);
        if (!vsnap.exists) throw new HttpsError('out-of-range', 'Variante inexistente.');
        const stock = Number(vsnap.data()?.['stock'] ?? 0);
        const reserved = Number(vsnap.data()?.['stockReserved'] ?? 0);
        // Disponible EXCLUYENDO el hold propio anterior: fue puesto por ESTA
        // re-reserva (mismo uid) y lo estamos reemplazando, así que no
        // compite contra la nueva cantidad. Sin esto, re-entrar al checkout
        // con stock justo fallaría contra sí misma (patrón idéntico al de
        // createOrder con reservation.holdQty).
        const ownHold = prevHeld.get(`${line.productId}/${line.variantId}`)?.qty ?? 0;
        const available = stock - reserved + ownHold;
        if (line.qty > available) {
          throw new HttpsError('out-of-range', 'Sin stock suficiente.');
        }
        writes.push({ ref: variantRef, newReserved: Math.max(0, reserved - ownHold + line.qty) });
        prevHeld.delete(`${line.productId}/${line.variantId}`);
      }
      // Variantes que SOLO estaban en la reserva previa: liberar su hold.
      for (const held of prevHeld.values()) {
        const vsnap = await tx.get(held.ref);
        if (vsnap.exists) {
          writes.push({
            ref: held.ref,
            newReserved: Math.max(0, Number(vsnap.data()?.['stockReserved'] ?? 0) - held.qty),
          });
        }
      }
      // ── Escrituras: cuando ya no queda ninguna lectura pendiente ──
      for (const p of writes) {
        tx.update(p.ref, { stockReserved: p.newReserved });
      }
      tx.set(reservationRef, {
        uid,
        items: Array.from(merged.values()).map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          qty: line.qty,
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
  fulfillment: unknown;
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
    return {
      subtotalUsd: totals.subtotalUsd,
      shippingUsd: totals.shippingUsd,
      ivaPercent: totals.ivaPercent,
      ivaUsd: totals.ivaUsd,
      totalUsd: totals.totalUsd,
      totalVes: totals.totalVes,
      rateUsed: totals.rateUsed,
      subtotalVes: totals.subtotalVes,
      shippingVes: totals.shippingVes,
      ivaVes: totals.ivaVes,
      zoneName: totals.zoneName,
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

/** Líneas del carrito: validación compartida por quote y create. */
function validateLines(data: QuoteReq | undefined): ValidLine[] {
  const raw = extractItems(data);
  if (raw.length === 0 || raw.length > MAX_LINES) {
    throw new HttpsError('invalid-argument', 'Carrito vacío o demasiado grande.');
  }
  return raw.map((it) => {
    const productId = sanitizeStr(it.productId, 120);
    const variantId = sanitizeStr(it.variantId, 140);
    const qty = Number(sanitizeDigits(String(it.qty ?? ''), 3));
    if (!productId || !variantId || qty < 1 || qty > MAX_QTY_PER_LINE) {
      throw new HttpsError('invalid-argument', 'Ítem inválido.');
    }
    return { productId, variantId, qty };
  });
}

/**
 * zoneId = null → retiro en tienda (sin zona, envío 0).
 * zoneId = '' → inválido en delivery.
 */
async function validateQuoteReq(data: QuoteReq | undefined): Promise<{ zoneId: string | null; lines: ValidLine[] }> {
  const fulfillment = sanitizeStr(data?.fulfillment, 10) || 'delivery';
  if (fulfillment === 'pickup') {
    return { zoneId: null, lines: validateLines(data) };
  }
  const zoneId = sanitizeStr(data?.zoneId, 80);
  if (!zoneId) throw new HttpsError('invalid-argument', 'Zona requerida.');
  return { zoneId, lines: validateLines(data) };
}

/** IVA % desde settings/general: 0–100; fuera de rango o vacío = 0. */
function normalizeIva(v: unknown): number {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(100, Math.round(n * 100) / 100);
}

/** Lee precios SOLO de Firestore y calcula todos los montos. */
async function computeTotals(
  _uid: string,
  lines: ValidLine[],
  zoneId: string | null,
): Promise<{
  subtotalUsd: number; shippingUsd: number;
  ivaPercent: number; ivaUsd: number;
  totalUsd: number; totalVes: number; rateUsed: number;
  subtotalVes: number; shippingVes: number; ivaVes: number;
  zoneName: string;
  linesSnapshot: ValidLineWithPrice[];
}> {
  const [zoneSnap, rateSnap, genSnap] = await Promise.all([
    zoneId ? db().collection('zones').doc(zoneId).get() : Promise.resolve(null),
    db().collection('rates').doc('bcv').get(),
    db().collection('settings').doc('general').get(),
  ]);
  if (zoneId && (!zoneSnap || !zoneSnap.exists || zoneSnap.data()?.['active'] !== true)) {
    throw new HttpsError('failed-precondition', 'Zona no disponible.');
  }
  const rate = Number(rateSnap.data()?.['usdToVes'] ?? 0);
  if (!isFinitePositive(rate) || rate > 10_000_000) {
    throw new HttpsError('failed-precondition', 'Tasa BCV no disponible.');
  }

  let subtotal = 0;
  const linesSnapshot: ValidLineWithPrice[] = [];

  // ESCALABILIDAD (Ronda 3): lectura EN LOTE con getAll en vez de 2 lecturas
  // secuenciales por línea (hasta 100 round-trips con 50 líneas). Ahora son
  // como máximo 2 lotes en paralelo; mismas lecturas facturadas, una fracción
  // del tiempo. Límite duro de getAll: 100 refs por llamada → trozos de 90.
  const refs: admin.firestore.DocumentReference[] = [];
  for (const line of lines) {
    refs.push(db().doc(`products/${line.productId}/variants/${line.variantId}`));
    refs.push(db().doc(`products/${line.productId}`));
  }
  const byPath = new Map<string, admin.firestore.DocumentSnapshot>();
  const CHUNK = 90;
  for (let i = 0; i < refs.length; i += CHUNK) {
    const snaps = await db().getAll(...refs.slice(i, i + CHUNK));
    for (const s of snaps) byPath.set(s.ref.path, s);
  }

  for (const line of lines) {
    const vsnap = byPath.get(`products/${line.productId}/variants/${line.variantId}`);
    const psnap = byPath.get(`products/${line.productId}`);
    if (!vsnap || !psnap || !vsnap.exists || !psnap.exists) {
      throw new HttpsError('out-of-range', 'Producto inexistente.');
    }
    if (psnap.data()?.['active'] !== true || vsnap.data()?.['active'] !== true) {
      throw new HttpsError('out-of-range', 'Producto no disponible.');
    }
    const price = Number(vsnap.data()?.['priceUsd'] ?? 0);
    if (!isFinitePositive(price) || price > MAX_PRICE_USD) {
      throw new HttpsError('out-of-range', 'Precio inválido.');
    }
    const lineTotal = round2(price * line.qty);
    subtotal += lineTotal;
    linesSnapshot.push({
      ...line,
      brand: sanitizeStr(psnap.data()?.['brand'], 60),
      name: sanitizeStr(psnap.data()?.['name'], 120),
      variantName: sanitizeStr(vsnap.data()?.['name'], 80),
      sku: sanitizeStr(vsnap.data()?.['sku'], 40),
      unitPriceUsd: price,
      lineTotalUsd: lineTotal,
      image: Array.isArray(psnap.data()?.['images']) ? String(psnap.data()!['images'][0] ?? '') : '',
      categoryId: sanitizeStr(psnap.data()?.['categoryId'], 60),
      slug: sanitizeStr(psnap.data()?.['slug'], 140),
    });
  }

  subtotal = round2(subtotal);

  // Envío: pickup = 0; delivery = tarifa plana de zona (5.5), sin peso.
  let shipping = 0;
  if (zoneId && zoneSnap) {
    const fee = Number(zoneSnap.data()?.['feeUsd'] ?? 0);
    const freeFrom = Number(zoneSnap.data()?.['freeFromUsd'] ?? 0);
    shipping = round2(fee);
    if (freeFrom > 0 && subtotal >= freeFrom) shipping = 0;
  }

  // IVA configurable por el admin (settings/general.ivaPercent, 0–100).
  // Base imponible: subtotal + envío. 0 = sin IVA (comportamiento anterior).
  const ivaPercent = normalizeIva(genSnap?.data()?.['ivaPercent']);
  const ivaUsd = round2(((subtotal + shipping) * ivaPercent) / 100);

  const totalUsd = round2(subtotal + shipping + ivaUsd);
  const totalVes = round2(totalUsd * rate);
  // Desglose en Bs autoritativo (Ronda 3): el cliente ya NO convierte ni
  // muestra USD; cada partida viaja redondeada desde el servidor.
  const subtotalVes = round2(subtotal * rate);
  const shippingVes = round2(shipping * rate);
  const ivaVes = round2(ivaUsd * rate);
  return {
    subtotalUsd: subtotal,
    shippingUsd: shipping,
    ivaPercent,
    ivaUsd,
    totalUsd,
    totalVes,
    rateUsed: rate,
    subtotalVes,
    shippingVes,
    ivaVes,
    zoneName: zoneId && zoneSnap ? String(zoneSnap.get('name') ?? zoneId) : 'Retiro en tienda',
    linesSnapshot,
  };
}

interface ValidLineWithPrice extends ValidLine {
  brand: string;
  name: string;
  variantName: string;
  sku: string;
  unitPriceUsd: number;
  lineTotalUsd: number;
  image: string;
  categoryId: string;
  slug: string;
}

/* ─────────────────────── crear orden (idempotente) ─────────────────────── */

interface CreateOrderReq {
  idempotencyKey: unknown;
  reservationId: unknown;
  fulfillment: unknown;
  contact: unknown;
  address: unknown;
  deliveryWindow: unknown;
  notes: unknown;
  paymentMethod: unknown;
  paymentDetails: unknown;
  /** FLUJO ESTRICTO (5i-k): comprobante en base64 puro. OBLIGATORIO. */
  receiptImage: unknown;
}

const PAYMENT_METHODS = new Set(['pago_movil']);

/**
 * Etiqueta la fase de createOrder que falla. Si Firestore lanza un error crudo
 * (sin código canónico: transacción abortada tras reintentos, caída de
 * transporte, bug puntual…), el log de netlify dev dice EXACTAMENTE qué paso
 * reventó (montos / antifraude / contador-código / escritura-orden) en lugar
 * de un «internal» opaco. Los HttpsError de negocio (zona, tasa, stock,
 * reserva, idempotencia…) pasan intactos: solo etiquetamos lo desconocido.
 */
async function phase<T>(tag: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    const err = e as Error;
    console.error(`[spot24] createOrder · falló fase ${tag}:`, err?.stack ?? err?.message ?? String(e));
    throw new HttpsError('internal', `createOrder · fase ${tag}: ${err?.message ?? String(e)}`);
  }
}

export async function coreCreateOrder(ctx: CoreCtx): Promise<unknown> {
  {
    const { uid, token } = requireAuth(ctx);
    requireAppCheck(ctx);
    // Límite duro de pedidos por hora (6.4 + 6.8).
    await enforceRateLimit({ bucket: 'createOrder', identity: uid, max: MAX_ORDERS_PER_HOUR, windowMs: 60 * 60 * 1000 });

    const req = validateCreateOrderReq(ctx.data as CreateOrderReq | undefined);
    const isPickup = req.fulfillment === 'pickup';

    // Dirección del local para retiro: la fija el SERVIDOR desde settings/general
    // (el cliente no puede definir dónde retira).
    let pickupAddress = '';
    if (isPickup) {
      const genSnap = await db().collection('settings').doc('general').get();
      pickupAddress = sanitizeStr(genSnap.data()?.['pickupAddress'], 200) || 'Retiro en tienda · Maracay, Aragua';
    }

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

    // FLUJO ESTRICTO (5i-k): el comprobante se sube a imgbb ANTES de crear la
    // orden. Si imgbb falla, NO hay pedido (cero pedidos sin pago) y el
    // cliente reintenta con la misma imagen en el estado. Va DESPUÉS del
    // chequeo de idempotencia para que un replay no duplique la imagen.
    const receiptUrl = await phase('comprobante', () => uploadReceiptToImgbb(req.receiptImage));

    // Totales calculados SOLO aquí (6.3): precios, envío, IVA y Bs.
    const totals = await phase('montos', () => computeTotals(uid, req.lines, isPickup ? null : req.address['zoneId']));

    // Antifraude (6.8).
    const refRaw = req.paymentDetails['referencia'] ?? req.paymentDetails['referenciaZelle'] ?? '';
    const refHash = refRaw ? hashReference(req.paymentMethod, refRaw) : null;
    const risk = await phase('antifraude', () => assessRisk({ uid, totalUsd: totals.totalUsd, accountCreatedAtMs, refHash }));

    // Número secuencial de código visible: SP-YYMMDD-NNNN.
    const seqRef = db().collection('counters').doc('orders_seq');
    const code = await phase('contador-código', () => db().runTransaction(async (tx) => {
      const s = await tx.get(seqRef);
      const current = s.exists ? Number(s.data()?.['count'] ?? 0) : 0;
      tx.set(seqRef, { count: current + 1 }, { merge: true });
      const d = new Date();
      const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      return `SP-${ymd}-${String(current + 1).padStart(4, '0')}`;
    }));

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
      // FLUJO ESTRICTO (5i-k): nace EN VERIFICACIÓN — el cliente ya pagó y
      // su comprobante viaja en este mismo documento. El estado «pendiente»
      // queda reservado para pedidos legacy anteriores a esta ronda.
      status: 'en_verificacion' as const,
      lines: totals.linesSnapshot.map((l) => ({
        productId: l.productId,
        variantId: l.variantId,
        brand: l.brand,
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
        ivaPercent: totals.ivaPercent,
        ivaUsd: totals.ivaUsd,
        totalUsd: totals.totalUsd,
        totalVes: totals.totalVes,
        rateUsed: totals.rateUsed,
        subtotalVes: totals.subtotalVes,
        shippingVes: totals.shippingVes,
        ivaVes: totals.ivaVes,
      },
      payment: {
        method: req.paymentMethod,
        status: 'pendiente',
        refHash,
        detailsEncrypted: encPaymentDetails,
        // FLUJO ESTRICTO: nace con comprobante (pago realizado y probado).
        hasReceipt: true,
        receiptUrl,
        masked: {
          banco: req.paymentDetails['banco'] ?? req.paymentDetails['bancoOrigen'] ?? '',
          telefono: req.paymentDetails['telefono'] ? `•••${String(req.paymentDetails['telefono']).slice(-4)}` : '',
          correo: req.paymentDetails['correo'] ? '•••' + String(req.paymentDetails['correo']).slice(-12) : '',
        },
        // Ronda 5.9: la referencia COMPLETA en claro. Es el dato que el cajero
        // necesita para cotejar el pago en el banco. El propio cliente la
        // escribió y el doc solo lo leen el dueño y el panel: no expone nada
        // nuevo. referenceMasked queda como fallback para órdenes viejas.
        reference: refRaw,
        referenceMasked: refRaw ? `•••${refRaw.slice(-3)}` : '',
      },
      delivery: {
        mode: req.fulfillment,
        zoneId: req.address['zoneId'],
        zoneName: req.address['zoneName'],
        window: req.deliveryWindow,
        // GPS del cliente (delivery): punto exacto para el mensajero.
        location: isPickup ? null : (req.address['location'] ?? null),
        addressEncrypted: encAddress,
        addressPreview: isPickup
          ? pickupAddress
          : `${req.address['city']} · ${req.address['details'].slice(0, 40)}…`,
        trackingCode: null,
      },
      contact: {
        name: encContact.name,
        // Ronda 5.9: teléfono COMPLETO en claro — cajera y delivery lo usan
        // para llamar/WhatsApp al cliente (el cliente ya lo escribió y el doc
        // solo lo leen el dueño y el panel). phoneMasked queda de fallback.
        phone: req.contact['phone'],
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

    await phase('escritura-orden', () => db().runTransaction(async (tx) => {
      // Re-chequeo de idempotencia dentro de la transacción (carrera).
      // REGLA DE TRANSACCIONES FIRESTORE: TODAS las lecturas primero.
      const idemAgain = await tx.get(idemRef);
      if (idemAgain.exists) {
        throw new HttpsError('already-exists', 'Orden en proceso.');
      }
      // Leer y validar TODAS las variantes ANTES de encolar cualquier
      // escritura. El «falló fase escritura-orden: Firestore transactions
      // require all reads to be executed before all writes» venía de hacer
      // tx.get de variantes aquí abajo, después de los tx.set de la orden.
      //
      // Ronda 5i — CONTABILIDAD DE STOCK CONSISTENTE EN AMBOS FLUJOS:
      // · Fallback (sin reserva): descuenta stock directo (igual que antes).
      // · Con reserva: consumir la reserva NO descontaba NI el stock NI el
      //   hold (stockReserved): cada orden dejaba stockReserved inflado para
      //   siempre y el catálogo dejaba de poder vender («Sin stock
      //   suficiente» fantasma). Ahora consumir la reserva = venta real:
      //   stock -= qty (venta) y stockReserved -= qty (libera el hold). Con
      //   esto cuadran el rechazo del pago (repone stock) y cancelOrder.
      const stockWrites: Array<{ ref: admin.firestore.DocumentReference; newStock: number }> = [];
      const holdWrites: Array<{ ref: admin.firestore.DocumentReference; newReserved: number }> = [];
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
          stockWrites.push({ ref: vref, newStock: stock - l.qty });
        }
      } else {
        // El hold lo fijó reserveStock sobre los ítems de la RESERVA; la
        // venta es sobre las LÍNEAS de la orden. Se agrupan por variante:
        // una lectura por variante, dos escrituras coherentes.
        const perVariant = new Map<
          string,
          { ref: admin.firestore.DocumentReference; saleQty: number; holdQty: number }
        >();
        for (const l of req.lines) {
          const key = `${l.productId}/${l.variantId}`;
          const cur = perVariant.get(key) ?? {
            ref: db().doc(`products/${l.productId}/variants/${l.variantId}`),
            saleQty: 0,
            holdQty: 0,
          };
          cur.saleQty += l.qty;
          perVariant.set(key, cur);
        }
        for (const item of (reservation.data()?.['items'] ?? []) as Array<{
          productId: string;
          variantId: string;
          qty: number;
        }>) {
          const key = `${item.productId}/${item.variantId}`;
          const cur = perVariant.get(key) ?? {
            ref: db().doc(`products/${item.productId}/variants/${item.variantId}`),
            saleQty: 0,
            holdQty: 0,
          };
          cur.holdQty += Number(item.qty ?? 0);
          perVariant.set(key, cur);
        }
        for (const v of perVariant.values()) {
          const vsnap = await tx.get(v.ref);
          if (!vsnap.exists) throw new HttpsError('out-of-range', 'Variante inexistente.');
          const stock = Number(vsnap.data()?.['stock'] ?? 0);
          const reserved = Number(vsnap.data()?.['stockReserved'] ?? 0);
          // Disponible EXCLUYENDO el hold de ESTA reserva: el hold fue puesto
          // por reserveStock para ESTA compra, así que no compite contra ella.
          // (stock - reserved + holdQty): sin esto, una reserva propia de 3
          // sobre stock 5 haría fallar la confirmación con stock «insuficiente».
          if (v.saleQty > stock - reserved + v.holdQty) {
            throw new HttpsError('out-of-range', 'Sin stock suficiente.');
          }
          stockWrites.push({ ref: v.ref, newStock: stock - v.saleQty });
          holdWrites.push({ ref: v.ref, newReserved: Math.max(0, reserved - v.holdQty) });
        }
      }
      // ── A partir de aquí SOLO escrituras: ninguna lectura después ──
      tx.set(db().collection('orders').doc(orderId), orderDoc);
      tx.set(idemRef, { orderId, createdAt: now }, { merge: false });
      // Evento inicial del timeline: nace ya con pago realizado (5i-k).
      tx.set(db().collection('orders').doc(orderId).collection('events').doc('e0'), {
        status: 'en_verificacion',
        at: now,
        by: 'system',
        note: isPickup
          ? 'Pedido creado con comprobante de pago. Retiro en tienda. Pago en verificación.'
          : 'Pedido creado con comprobante de pago. Pago en verificación.',
      });
      // Consume la reserva y liquida hold + venta (Ronda 5i).
      if (reservation) {
        tx.set(db().collection('reservations').doc(req.reservationId!), { status: 'consumida', orderId }, { merge: true });
        for (const p of holdWrites) {
          tx.update(p.ref, { stockReserved: p.newReserved });
        }
      }
      // Venta real: descuenta el stock validado (ambos flujos).
      for (const p of stockWrites) {
        tx.update(p.ref, { stock: p.newStock });
      }
    }));

    void ORDER_NOTIFICATIONS.send(uid, code, 'en_verificacion');

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
      ivaPercent: Number(totals?.['ivaPercent'] ?? 0),
      ivaUsd: Number(totals?.['ivaUsd'] ?? 0),
      totalUsd: Number(totals?.['totalUsd'] ?? 0),
      totalVes: Number(totals?.['totalVes'] ?? 0),
      rateUsed: Number(totals?.['rateUsed'] ?? 0),
      subtotalVes: Number(totals?.['subtotalVes'] ?? 0),
      shippingVes: Number(totals?.['shippingVes'] ?? 0),
      ivaVes: Number(totals?.['ivaVes'] ?? 0),
    },
    riskFlags: Array.isArray(data['riskFlags']) ? (data['riskFlags'] as string[]) : [],
  };
}

function validateCreateOrderReq(data: CreateOrderReq | undefined): {
  idempotencyKey: string;
  reservationId: string | null;
  fulfillment: 'delivery' | 'pickup';
  lines: ValidLine[];
  contact: { name: string; phone: string; cedula: string };
  address: { state: string; city: string; zoneId: string; zoneName: string; details: string; location: { lat: number; lng: number } | null };
  deliveryWindow: { start: string; end: string };
  notes: string;
  paymentMethod: string;
  paymentDetails: Record<string, string>;
  receiptImage: string;
} {
  if (!data) throw new HttpsError('invalid-argument', 'Datos faltantes.');

  const idempotencyKey = sanitizeStr(data.idempotencyKey, 80);
  if (!/^[0-9a-f]{8,80}$/.test(idempotencyKey)) {
    throw new HttpsError('invalid-argument', 'Clave de idempotencia inválida.');
  }

  // Modalidad: 'pickup' (retiro) o 'delivery' (por defecto, retrocompatible).
  const fulfillment: 'delivery' | 'pickup' = sanitizeStr(data.fulfillment, 10) === 'pickup' ? 'pickup' : 'delivery';

  // Líneas: del payload o de la reserva activa.
  let lines: ValidLine[] = [];
  const raw = extractItems(data);
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
  if (contact.name.length < 2 || contact.phone.length !== 11 || !/^(?:[VE]-?)?\d{1,8}$/.test(contact.cedula)) {
    throw new HttpsError('invalid-argument', 'Datos de contacto inválidos.');
  }

  const address = {
    state: sanitizeStr(a['state'], 40),
    city: sanitizeStr(a['city'], 60),
    zoneId: sanitizeStr(a['zoneId'], 80),
    zoneName: sanitizeStr(a['zoneName'], 120),
    details: sanitizeStr(a['details'], 500),
  };
  // GPS del cliente (delivery): punto exacto para el mensajero. Opcional a
  // nivel API (retrocompatible); el cliente lo exige en su paso de entrega.
  const rawLoc = (a['location'] ?? null) as Record<string, unknown> | null;
  let location: { lat: number; lng: number } | null = null;
  if (rawLoc && typeof rawLoc === 'object') {
    const lat = Number(rawLoc['lat']);
    const lng = Number(rawLoc['lng']);
    if (
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      (lat !== 0 || lng !== 0)
    ) {
      location = { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  if (fulfillment === 'pickup') {
    // Retiro en tienda: la dirección la fija el servidor (pickupAddress desde
    // settings/general, en coreCreateOrder). Aquí solo saneamos por defecto.
    address.state = address.state || 'Aragua';
    address.city = address.city || 'Maracay';
    address.zoneId = '';
    address.zoneName = 'Retiro en tienda';
    address.details = address.details || 'Retiro en tienda';
  } else if (!address.zoneId || address.city.length < 2 || address.details.length < 8) {
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

  // FLUJO ESTRICTO (5i-k): el comprobante es OBLIGATORIO. Sin este campo la
  // creación se rechaza aquí, antes de tocar Firestore o imgbb.
  const receiptImage = requireReceiptImage(data.receiptImage);

  return { idempotencyKey, reservationId, fulfillment, lines, contact, address: { ...address, location }, deliveryWindow, notes, paymentMethod, paymentDetails, receiptImage };
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
      // REGLA DE TRANSACCIONES FIRESTORE: TODAS las lecturas primero.
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

      // Reposición de stock: reserva 'activa' → libera el hold; cualquier
      // otro caso = la orden YA descontó stock al crearse (Ronda 5i) → repone.
      // REGLA DE TRANSACCIONES FIRESTORE: las lecturas de stock van ANTES
      // de cualquier escritura (tx.get tras tx.update revienta la transacción).
      const reservationId = data['reservationId'] as string | null;
      const unreserve: Array<{ ref: admin.firestore.DocumentReference; newReserved: number }> = [];
      const restock: Array<{ ref: admin.firestore.DocumentReference; newStock: number }> = [];
      let releaseReservation = false;
      if (reservationId && status === 'pendiente') {
        const rsnap = await tx.get(db().collection('reservations').doc(reservationId));
        if (rsnap.exists && rsnap.data()?.['status'] === 'activa') {
          // Caso defensivo: createOrder consume la reserva en SU transacción,
          // así que una orden 'pendiente' con reserva 'activa' no debe existir.
          // Si apareciera (datos heredados), solo se libera el hold: bajo el
          // modelo 5i ese stock nunca llegó a descontarse.
          releaseReservation = true;
          for (const item of (rsnap.data()?.['items'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
            const vref = db().doc(`products/${item.productId}/variants/${item.variantId}`);
            const vsnap = await tx.get(vref);
            if (vsnap.exists) {
              unreserve.push({
                ref: vref,
                newReserved: Math.max(0, Number(vsnap.data()?.['stockReserved'] ?? 0) - item.qty),
              });
            }
          }
        } else {
          // Ronda 5i: reserva 'consumida' (o inexistente) en una orden
          // 'pendiente' → el stock SÍ se descontó al crear la orden.
          // Antes este camino no tocaba nada y cada cancelación filtraba stock.
          for (const line of (data['lines'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
            const vref = db().doc(`products/${line.productId}/variants/${line.variantId}`);
            const vsnap = await tx.get(vref);
            if (vsnap.exists) {
              restock.push({ ref: vref, newStock: Number(vsnap.data()?.['stock'] ?? 0) + line.qty });
            }
          }
        }
      } else if (status !== 'pendiente') {
        for (const line of (data['lines'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>) {
          const vref = db().doc(`products/${line.productId}/variants/${line.variantId}`);
          const vsnap = await tx.get(vref);
          if (vsnap.exists) {
            restock.push({ ref: vref, newStock: Number(vsnap.data()?.['stock'] ?? 0) + line.qty });
          }
        }
      }

      // ── A partir de aquí SOLO escrituras: ninguna lectura después ──
      tx.update(ref, { status: 'cancelado', updatedAt: Date.now() });
      tx.set(
        ref.collection('events').doc(),
        { status: 'cancelado', at: Date.now(), by: isAdmin ? 'admin' : 'system', note: reason.slice(0, 200) },
      );
      if (releaseReservation && reservationId) {
        for (const p of unreserve) {
          tx.update(p.ref, { stockReserved: p.newReserved });
        }
        tx.set(db().collection('reservations').doc(reservationId), { status: 'liberada' }, { merge: true });
      }
      for (const p of restock) {
        tx.update(p.ref, { stock: p.newStock });
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

/* ─────────────────── comprobante de pago (cliente) ─────────────────── */

/**
 * El CLIENTE re-subel el comprobante de pago de SU orden → imgbb → URL pública.
 * Desde la ronda 5i-k el flujo normal ya NO pasa por aquí: el comprobante viaja
 * con fn-createOrder y la orden nace con él. Este callable queda para:
 * · Pedidos LEGACY anteriores a la ronda (nacidos «pendiente» sin comprobante).
 * · Reemplazar la foto si el banco anula y emite un nuevo comprobante.
 * · Requiere sesión y propiedad de la orden (uid === order.uid).
 * · Marca payment.hasReceipt/receiptUrl y registra evento del timeline.
 */
export async function coreUploadReceipt(ctx: CoreCtx): Promise<unknown> {
  const { uid } = requireAuth(ctx);
  requireAppCheck(ctx);
  await tryRateLimit({ bucket: 'uploadReceipt', identity: uid, max: 12, windowMs: 60 * 60 * 1000 });

  const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId requerido.');
  const image = requireReceiptImage(ctx.data?.['image']);

  // Propiedad y estado de la orden: solo el dueño, y solo si aún tiene sentido.
  const ref = db().collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  if (String(snap.data()?.['uid'] ?? '') !== uid) {
    throw new HttpsError('permission-denied', 'Solo el dueño puede subir el comprobante.');
  }
  const status = String(snap.data()?.['status'] ?? '');
  if (status === 'entregado' || status === 'cancelado') {
    throw new HttpsError('failed-precondition', 'Esta orden ya no acepta comprobantes.');
  }

  const url = await uploadReceiptToImgbb(image);

  const now = Date.now();
  // Ronda 5i-j — SUBIR COMPROBANTE = PAGO REALIZADO. La orden sale de
  // «pendiente» y entra SOLA a la cola de verificación (en_verificacion):
  // el cajero jamás recibe pedidos sin pago en su cola de aprobación.
  // Lectura DENTRO de la transacción: el estado pudo cambiar entre el
  // chequeo inicial y aquí (p. ej. cancelada mientras imgbb respondía).
  await db().runTransaction(async (tx) => {
    const fresh = await tx.get(ref);
    const cur = String(fresh.data()?.['status'] ?? '');
    if (cur === 'entregado' || cur === 'cancelado') {
      throw new HttpsError('failed-precondition', 'Esta orden ya no acepta comprobantes.');
    }
    const nextStatus = cur === 'pendiente' ? 'en_verificacion' : cur;
    tx.update(ref, {
      'payment.hasReceipt': true,
      'payment.receiptUrl': url,
      ...(nextStatus !== cur ? { status: nextStatus } : {}),
      updatedAt: now,
    });
    tx.set(
      ref.collection('events').doc(),
      {
        status: nextStatus,
        at: now,
        by: 'customer',
        note: 'Comprobante de pago subido por el cliente. Pago realizado.',
      },
    );
  });

  return { ok: true, url };
}