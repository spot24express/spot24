/**
 * Módulo checkout · Capa de servicios.
 * TODAS las operaciones sensibles van por Cloud Functions con App Check:
 * · reserveStock → reserva 2 h al entrar al checkout (5.2)
 * · quoteTotals  → cotización autoritativa (subtotal + envío por zona/peso + Bs)
 * · createOrder  → crea la orden (el cliente NUNCA escribe en orders, 5.4)
 * En modo demo, un adaptador local simula las tres con latencia y reglas reales
 * de negocio (tasa demo, stock local, idempotencia por localStorage).
 */
import { httpsCallable } from 'firebase/functions';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { DEMO_BCV_RATE, DEMO_ZONES } from '@/shared/lib/demo/seed';
import { DEMO_PRODUCTS } from '@/shared/lib/demo/seed';
import { logger } from '@/shared/lib/logger';
import { zoneQuote } from '@/features/delivery/types';
import type {
  CheckoutItem, CreateOrderPayload, CreateOrderResponse,
  QuoteRequest, QuoteResponse, ReservationResponse,
} from '../types';

const RESERVATION_TTL_MS = 2 * 60 * 60 * 1000; // 2 horas

async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    const fn = httpsCallable<TReq, TRes>(fb.functions, name);
    const res = await fn(data);
    return res.data;
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    logger.warn(`callable ${name} falló`, e);
    if (code.includes('unauthenticated')) throw new AppError('unauthenticated');
    if (code.includes('permission-denied') || code.includes('failed-precondition')) throw new AppError('forbidden');
    if (code.includes('resource-exhausted')) throw new AppError('rate-limit');
    if (code.includes('out-of-range')) throw new AppError('stock');
    throw new AppError('generic');
  }
}

/* ────────────────────────── Modo demo (local) ────────────────────────── */

const DEMO_RESERVATION_KEY = 'spot24:demo:reservation';
const DEMO_IDEMPOTENCY_KEY = 'spot24:demo:idempotency';

function demoDelay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function demoReserve(): ReservationResponse {
  const existing = localStorage.getItem(DEMO_RESERVATION_KEY);
  if (existing) {
    const parsed = JSON.parse(existing) as ReservationResponse;
    if (parsed.expiresAt > Date.now()) return parsed;
  }
  const res: ReservationResponse = { reservationId: `demo-res-${Date.now().toString(36)}`, expiresAt: Date.now() + RESERVATION_TTL_MS };
  localStorage.setItem(DEMO_RESERVATION_KEY, JSON.stringify(res));
  return res;
}

function demoQuote(req: QuoteRequest): QuoteResponse {
  const zone = DEMO_ZONES.find((z) => z.id === req.zoneId) ?? DEMO_ZONES[0]!;
  let subtotal = 0;
  let weight = 0;
  let freeShipping = false;
  for (const line of req.items) {
    const p = DEMO_PRODUCTS.find((x) => x.id === line.productId);
    const v = p?.variants.find((x) => x.id === line.variantId);
    if (!p || !v) throw new AppError('stock');
    subtotal += v.priceUsd * line.qty;
    weight += v.weightKg * line.qty;
  }
  subtotal = Math.round(subtotal * 100) / 100;
  const quote = zoneQuote(zone, subtotal, Math.round(weight * 100) / 100);
  const totalUsd = Math.round((subtotal + quote.feeUsd) * 100) / 100;
  const rate = DEMO_BCV_RATE.usdToVes;
  freeShipping = quote.feeUsd === 0;
  return {
    subtotalUsd: subtotal,
    shippingUsd: quote.feeUsd,
    totalUsd,
    totalVes: Math.round(totalUsd * rate * 100) / 100,
    rateUsed: rate,
    weightKg: Math.round(weight * 100) / 100,
    zoneName: zone.name,
    freeShipping,
  };
}

/* ───────────────────────────── API pública ───────────────────────────── */

export async function reserveStock(items: CheckoutItem[]): Promise<ReservationResponse> {
  if (DEMO_MODE) {
    await demoDelay(400);
    return demoReserve();
  }
  return callFn<CheckoutItem[], ReservationResponse>('fn-reserveStock', items);
}

export async function quoteTotals(req: QuoteRequest): Promise<QuoteResponse> {
  if (DEMO_MODE) {
    await demoDelay(500);
    return demoQuote(req);
  }
  return callFn<QuoteRequest, QuoteResponse>('fn-quoteTotals', req);
}

/**
 * Crea la orden. `itemsForTotals` alimenta el cálculo demo local; en
 * producción el backend revalida TODO contra Firestore y el carrito real.
 */
export async function createOrder(
  payload: CreateOrderPayload,
  itemsForTotals: CheckoutItem[],
): Promise<CreateOrderResponse> {
  if (DEMO_MODE) {
    await demoDelay(900);
    const quote = demoQuote({ zoneId: payload.address.zoneId, items: itemsForTotals });
    const seen = localStorage.getItem(DEMO_IDEMPOTENCY_KEY);
    if (seen) {
      const prev = JSON.parse(seen) as { key: string; response: CreateOrderResponse };
      if (prev.key === payload.idempotencyKey) return prev.response;
    }
    const now = Date.now();
    const orderId = `demo-${now.toString(36)}`;
    const code = `SP-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const response: CreateOrderResponse = { orderId, code, totals: quote, riskFlags: [] };

    // Persiste la orden completa en el almacenamiento demo de pedidos.
    const { DEMO_PRODUCTS } = await import('@/shared/lib/demo/seed');
    const { demoUpsertOrder } = await import('@/features/orders/services/orders.service');
    const zone = DEMO_ZONES.find((z) => z.id === payload.address.zoneId) ?? DEMO_ZONES[0]!;
    demoUpsertOrder({
      id: orderId,
      code,
      uid: 'demo-customer', // sesión demo (el guard no filtra por uid en demo)
      status: 'pendiente',
      lines: itemsForTotals.map((line) => {
        const p = DEMO_PRODUCTS.find((x) => x.id === line.productId);
        const v = p?.variants.find((x) => x.id === line.variantId);
        return {
          productId: line.productId,
          variantId: line.variantId,
          name: p?.name ?? line.productId,
          variantName: v?.name ?? line.variantId,
          sku: v?.sku ?? '',
          unitPriceUsd: v?.priceUsd ?? 0,
          qty: line.qty,
          lineTotalUsd: Math.round((v?.priceUsd ?? 0) * line.qty * 100) / 100,
          image: p?.images[0] ?? '/img/products/lubricantes.svg',
        };
      }),
      totals: quote,
      payment: {
        method: payload.paymentMethod,
        status: 'pendiente',
        masked: payload.paymentDetails['banco']
          ? { banco: payload.paymentDetails['banco'] }
          : {},
        referenceMasked: payload.paymentDetails['referencia']
          ? `•••${payload.paymentDetails['referencia'].slice(-3)}`
          : '',
        hasReceipt: false,
      },
      delivery: {
        zoneId: zone.id,
        zoneName: zone.name,
        window: { start: payload.deliveryWindow.start, end: payload.deliveryWindow.end, label: zone.windows[0]?.label },
        addressPreview: `${payload.address.city} · ${payload.address.details.slice(0, 40)}…`,
        trackingCode: null,
      },
      contact: {
        name: payload.contact.name,
        phoneMasked: `•••••${payload.contact.phone.slice(-4)}`,
      },
      notes: payload.notes,
      riskFlags: [],
      reservationExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    });

    localStorage.setItem(DEMO_IDEMPOTENCY_KEY, JSON.stringify({ key: payload.idempotencyKey, response }));
    return response;
  }
  return callFn<CreateOrderPayload, CreateOrderResponse>('fn-createOrder', payload);
}
