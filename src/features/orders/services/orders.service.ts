/**
 * Módulo orders · Capa de servicios.
 * Lectura de pedidos propios (owner) con listener acotado (5.5).
 * Cancelación vía Cloud Function. Comprobantes a Storage con validación.
 */
import {
  collection, doc, getDocs, limit as fbLimit, onSnapshot, orderBy, query, startAfter,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';
import { isAllowedUploadSize, isAllowedUploadType, RECEIPT_TYPES, sanitizeFileName } from '@/shared/lib/validation';
import type { Page } from '@/shared/types';
import type { Order, OrderEvent } from '../types';

const ORDERS = 'orders';
const PAGE_SIZE = 10;

function mapOrder(id: string, d: Record<string, unknown>): Order {
  return {
    id,
    code: String(d['code'] ?? id),
    uid: String(d['uid'] ?? ''),
    status: (d['status'] as Order['status']) ?? 'pendiente',
    lines: Array.isArray(d['lines']) ? (d['lines'] as Order['lines']) : [],
    totals: (d['totals'] as Order['totals']) ?? {
      subtotalUsd: 0, shippingUsd: 0, totalUsd: 0, totalVes: 0, rateUsed: 0, weightKg: 0,
    },
    payment: (d['payment'] as Order['payment']) ?? {
      method: 'pago_movil', status: 'pendiente', masked: {}, referenceMasked: '', hasReceipt: false,
    },
    delivery: (d['delivery'] as Order['delivery']) ?? {
      zoneId: '', zoneName: '', window: { start: '', end: '' }, addressPreview: '', trackingCode: null,
    },
    contact: (d['contact'] as Order['contact']) ?? { name: '', phoneMasked: '' },
    notes: String(d['notes'] ?? ''),
    riskFlags: Array.isArray(d['riskFlags']) ? (d['riskFlags'] as string[]) : [],
    reservationExpiresAt: d['reservationExpiresAt'] ? Number(d['reservationExpiresAt']) : null,
    createdAt: Number(d['createdAt'] ?? 0),
    updatedAt: Number(d['updatedAt'] ?? 0),
  };
}

/* ── Demo: pedidos simulados en localStorage ── */
const DEMO_ORDERS_KEY = 'spot24:demo:orders';

export function demoRead(): Order[] {
  try {
    return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY) ?? '[]') as Order[];
  } catch {
    return [];
  }
}

function demoWrite(orders: Order[]): void {
  localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders.slice(0, 30)));
}

export function demoUpsertOrder(order: Order): void {
  const all = demoRead().filter((o) => o.id !== order.id);
  all.unshift(order);
  demoWrite(all);
}

export function demoGetOrder(id: string): Order | null {
  return demoRead().find((o) => o.id === id) ?? null;
}

/* ───────────────────────────── API pública ───────────────────────────── */

export async function listMyOrders(cursor: string | null): Promise<Page<Order>> {
  if (DEMO_MODE) {
    const all = demoRead();
    const idx = cursor ? Number(cursor) || 0 : 0;
    const items = all.slice(idx, idx + PAGE_SIZE);
    const next = idx + PAGE_SIZE;
    return { items, cursor: next < all.length ? String(next) : null, hasMore: next < all.length };
  }
  const fb = await loadFirebase();
  if (!fb) return { items: [], cursor: null, hasMore: false };
  let q = query(
    collection(fb.db, ORDERS),
    orderBy('createdAt', 'desc'),
    fbLimit(PAGE_SIZE),
  );
  if (cursor) {
    const ts = Number(cursor) || 0;
    q = query(
      collection(fb.db, ORDERS),
      orderBy('createdAt', 'desc'),
      startAfter(ts),
      fbLimit(PAGE_SIZE),
    );
  }
  const snap = await getDocs(q);
  const items = snap.docs.map((d) => mapOrder(d.id, d.data() as Record<string, unknown>));
  const last = snap.docs[snap.docs.length - 1];
  return {
    items,
    cursor: snap.docs.length === PAGE_SIZE && last ? String(last.get('createdAt') as number) : null,
    hasMore: snap.docs.length === PAGE_SIZE,
  };
}

/** Listener acotado a UN documento: seguimiento en vivo del pedido (5.5). */
export function subscribeOrder(
  orderId: string,
  cb: (o: Order | null) => void,
): () => void {
  if (DEMO_MODE) {
    cb(demoGetOrder(orderId));
    return () => undefined;
  }
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void loadFirebase().then((fb) => {
    if (!fb || cancelled) return;
    unsub = onSnapshot(
      doc(fb.db, ORDERS, orderId),
      (snap) => cb(snap.exists() ? mapOrder(snap.id, snap.data() as Record<string, unknown>) : null),
      (err) => {
        logger.warn('subscribeOrder error', err);
        cb(null);
      },
    );
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}

/** Últimos 20 eventos del pedido (timeline). */
export async function listOrderEvents(orderId: string): Promise<OrderEvent[]> {
  if (DEMO_MODE) return [];
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, ORDERS, orderId, 'events'), orderBy('at', 'desc'), fbLimit(20)),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    status: d.data()['status'] as OrderEvent['status'],
    at: Number(d.data()['at'] ?? 0),
    by: (d.data()['by'] as OrderEvent['by']) ?? 'system',
    note: d.data()['note'] ? String(d.data()['note']) : undefined,
  }));
}

export async function cancelOrder(orderId: string, reason: string): Promise<void> {
  if (DEMO_MODE) {
    const o = demoGetOrder(orderId);
    if (!o) throw new AppError('generic');
    if (!['pendiente', 'en_verificacion', 'pagado', 'preparado'].includes(o.status)) {
      throw new AppError('generic', 'estado no cancelable');
    }
    o.status = 'cancelado';
    o.updatedAt = Date.now();
    demoUpsertOrder(o);
    return;
  }
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const { httpsCallable } = await import('firebase/functions');
  const fn = httpsCallable<{ orderId: string; reason: string }, { ok: boolean }>(fb.functions, 'fn-cancelOrder');
  try {
    await fn({ orderId, reason });
  } catch (e) {
    logger.warn('cancelOrder falló', e);
    throw new AppError('generic');
  }
}

/** Sube comprobante a Storage: orders/{uid}/{orderId}/{nombre} (5.4). */
export async function uploadReceipt(orderId: string, file: File): Promise<string> {
  if (!isAllowedUploadType(file.type, RECEIPT_TYPES)) {
    throw new AppError('generic', 'tipo de archivo no permitido');
  }
  if (!isAllowedUploadSize(file.size)) {
    throw new AppError('generic', 'archivo demasiado grande');
  }
  if (DEMO_MODE) {
    // En demo guardamos la URL local del archivo (objectURL) para el visor.
    return URL.createObjectURL(file);
  }
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const path = `orders/${fb.auth.currentUser?.uid ?? 'anon'}/${orderId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const r = ref(fb.storage, path);
  try {
    const snap = await uploadBytes(r, file, { contentType: file.type, cacheControl: 'private, max-age=3600' });
    return await getDownloadURL(snap.ref);
  } catch (e) {
    logger.warn('uploadReceipt falló', e);
    throw new AppError('generic');
  }
}
