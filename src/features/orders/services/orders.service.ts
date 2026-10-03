/**
 * Módulo orders · Capa de servicios.
 * Lectura de pedidos propios (owner) con listener acotado (5.5).
 * Cancelación vía función de servidor. El comprobante del cliente va por
 * fn-uploadReceipt → imgbb (funciona sin bucket de Storage, plan Spark).
 */
import {
  collection, doc, getDocs, limit as fbLimit, onSnapshot, orderBy, query, startAfter,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';
import { isAllowedUploadType, RECEIPT_IMAGE_TYPES } from '@/shared/lib/validation';
import { MAX_INPUT_MB, fileToBase64 } from '@/shared/lib/imageCompress';
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
      subtotalUsd: 0, shippingUsd: 0, totalUsd: 0, totalVes: 0, rateUsed: 0,
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

/* ───────────────────────────── API pública ───────────────────────────── */

export async function listMyOrders(cursor: string | null): Promise<Page<Order>> {
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
  await callFunction<{ ok: boolean }>('fn-cancelOrder', { orderId, reason: reason.slice(0, 300) });
}

/**
 * Sube el comprobante de pago de UNA orden propia → fn-uploadReceipt → imgbb.
 * Solo imágenes (los bancos entregan capturas): si el cliente tiene un PDF,
 * le pedimos captura de pantalla. La URL queda en payment.receiptUrl y el
 * admin la ve directo en la cola de verificación.
 */
export async function uploadReceipt(orderId: string, file: File): Promise<string> {
  if (!isAllowedUploadType(file.type, RECEIPT_IMAGE_TYPES)) {
    throw new AppError('generic', 'Solo imágenes JPG, PNG o WebP. Si tu comprobante es PDF, toma una captura de pantalla.');
  }
  if (file.size > MAX_INPUT_MB * 1024 * 1024) {
    throw new AppError('generic', `La imagen pasa de ${MAX_INPUT_MB} MB. Toma una captura más liviana.`);
  }
  let image: string;
  try {
    image = await fileToBase64(file);
  } catch (e) {
    if (e instanceof Error && e.message === 'too-big') {
      throw new AppError('generic', 'La imagen quedó muy grande incluso comprimida. Toma una captura de menos resolución.');
    }
    throw new AppError('generic', 'No pudimos leer la imagen. Prueba con otra.');
  }
  const res = await callFunction<{ ok: boolean; url: string }>('fn-uploadReceipt', { orderId, image });
  if (!res?.url) throw new AppError('generic');
  return res.url;
}