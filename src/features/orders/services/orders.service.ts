/**
 * Módulo orders · Capa de servicios.
 * Lectura de pedidos PROPIOS (owner) con filtro uid obligatorio (5.32).
 * Cancelación vía función de servidor. El comprobante del cliente va por
 * fn-uploadReceipt → imgbb (funciona sin bucket de Storage, plan Spark).
 */
import {
  collection, doc, getDocs, limit as fbLimit, onSnapshot, orderBy, query, startAfter, where,
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

/** Tamaño de página público: la UI lo usa para saber cuándo ofrecer «Cargar más». */
export const MY_ORDERS_PAGE_SIZE = PAGE_SIZE;

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

/**
 * Página de pedidos PROPIOS (más nuevos primero), paginada por cursor.
 *
 * FIX 5.32: el filtro where('uid') es OBLIGATORIO. Las reglas de Firestore
 * (deny by default) solo permiten leer un pedido al dueño
 * (resource.data.uid == request.auth.uid) o al personal; sin ese filtro en
 * la query, Firestore rechaza la consulta entera con permission-denied y
 * «Mis pedidos» caía a la pantalla de error para todo cliente. Además, con
 * el filtro el cliente solo descarga LO SUYO (antes la consulta apuntaba a
 * toda la colección). Igualdad + orderBy en un campo distinto se resuelve
 * con los índices automáticos: NO requiere índice compuesto.
 */
export async function listMyOrders(uid: string, cursor: string | null): Promise<Page<Order>> {
  if (!uid) return { items: [], cursor: null, hasMore: false };
  const fb = await loadFirebase();
  if (!fb) return { items: [], cursor: null, hasMore: false };
  let q = query(
    collection(fb.db, ORDERS),
    where('uid', '==', uid),
    orderBy('createdAt', 'desc'),
    fbLimit(PAGE_SIZE),
  );
  if (cursor) {
    const ts = Number(cursor) || 0;
    q = query(
      collection(fb.db, ORDERS),
      where('uid', '==', uid),
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

/**
 * Vigía 5.75: escucha EN VIVO la primera página de pedidos propios.
 * MISMA consulta que listMyOrders (where uid + orderBy createdAt desc, 5.32):
 * mismas reglas de Firestore (leer solo lo propio), mismo índice automático,
 * pero con onSnapshot en vez de getDocs. Así la lista «Mis pedidos» se
 * actualiza sola: nuevo pedido aparece arriba, el estatus cambia en la
 * tarjeta, el tracking entra — sin recargar ni reentrar.
 * Costo: la primera emisión lee lo mismo que la carga puntual de siempre
 * (hasta PAGE_SIZE lecturas); después, SOLO los documentos que cambian de
 * verdad (~1 lectura por cambio). Sin pedidos abiertos, el canal queda
 * quieto y no consume lecturas.
 */
export function subscribeMyOrders(
  uid: string,
  onData: (items: Order[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void loadFirebase().then((fb) => {
    if (cancelled) return;
    if (!fb) {
      // Sin Firebase (modo demo): primera emisión vacía para que la UI
      // resuelva en su estado de «sin pedidos» y no quede cargando.
      onData([]);
      return;
    }
    const q = query(
      collection(fb.db, ORDERS),
      where('uid', '==', uid),
      orderBy('createdAt', 'desc'),
      fbLimit(PAGE_SIZE),
    );
    unsub = onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => mapOrder(d.id, d.data() as Record<string, unknown>))),
      (err) => {
        // Fallo de transporte (QUIC/CLOSED en redes degradadas): el canal se
        // reconecta solo; aquí solo avisamos. La lista ya cargada NO se borra.
        logger.warn('subscribeMyOrders error', err);
        onError?.(err);
      },
    );
  });
  return () => {
    cancelled = true;
    unsub?.();
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