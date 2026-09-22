/**
 * Módulo admin · Capa de servicios del panel.
 * · Metadatos de producto, zonas: escritura directa por admin (reglas con claim).
 * · Stock, verificación de pago, estados, métricas, roles: SOLO Cloud Functions (6.3).
 */
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit as fbLimit, orderBy,
  query, serverTimestamp, setDoc, where, updateDoc,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';
import { DEMO_PRODUCTS } from '@/shared/lib/demo/seed';
import { DEMO_ZONES } from '@/shared/lib/demo/seed';
import { demoGetOrder, demoRead, demoUpsertOrder } from '@/features/orders/services/orders.service';
import { PRODUCT_IMAGE_TYPES, isAllowedUploadSize, isAllowedUploadType, sanitizeFileName } from '@/shared/lib/validation';
import type { Product, ProductVariant } from '@/features/catalog/types';
import type { Zone } from '@/features/delivery/types';
import type { Order, OrderStatus } from '@/features/orders/types';

async function callFn<TReq, TRes>(name: string, data: TReq): Promise<TRes> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    const fn = httpsCallable<TReq, TRes>(fb.functions, name);
    const res = await fn(data);
    return res.data;
  } catch (e) {
    logger.warn(`admin callable ${name} falló`, e);
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('unauthenticated')) throw new AppError('unauthenticated');
    if (code.includes('permission-denied')) throw new AppError('forbidden');
    if (code.includes('resource-exhausted')) throw new AppError('rate-limit');
    throw new AppError('generic');
  }
}

/* ── Productos ── */

export async function adminListProducts(search: string): Promise<Product[]> {
  if (DEMO_MODE) {
    const term = search.trim().toLowerCase();
    return DEMO_PRODUCTS.filter(
      (p) => !term || p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term),
    ).slice(0, 60);
  }
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, 'products'), orderBy('createdAt', 'desc'), fbLimit(60)),
  );
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Product, 'id'>) }));
  const term = search.trim().toLowerCase();
  return items.filter((p) => !term || p.name.toLowerCase().includes(term) || p.brand.toLowerCase().includes(term));
}

export interface ProductDraftInput {
  id?: string;
  name: string;
  brand: string;
  categoryId: string;
  description: string;
  active: boolean;
  variants: Array<{ id?: string; name: string; sku: string; priceUsd: number; stock: number; weightKg: number }>;
}

/** Crea/actualiza producto + subcolección variants (transacción lógica). */
export async function adminSaveProduct(draft: ProductDraftInput): Promise<string> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 400));
    return draft.id ?? `demo-nuevo-${Date.now().toString(36)}`;
  }
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');

  const slug =
    draft.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `producto-${Date.now().toString(36)}`;

  const prices = draft.variants.map((v) => v.priceUsd);
  const now = Date.now();
  const payload = {
    slug,
    name: draft.name.trim().slice(0, 120),
    brand: draft.brand.trim().slice(0, 60),
    description: draft.description.trim().slice(0, 1000),
    categoryId: draft.categoryId,
    basePriceUsd: prices.length ? Math.min(...prices) : 0,
    stockTotal: draft.variants.reduce((a, v) => a + v.stock, 0),
    variantCount: draft.variants.length,
    active: draft.active,
    updatedAt: now,
  };

  let productId = draft.id;
  if (!productId) {
    const created = await addDoc(collection(fb.db, 'products'), {
      ...payload,
      images: [`/img/products/${draft.categoryId}.svg`],
      searchTerms: [],
      createdAt: serverTimestamp(),
    });
    productId = created.id;
  } else {
    await updateDoc(doc(fb.db, 'products', productId), payload);
  }

  // Variantes: sobrescribe la subcolección (catálogo pequeño, operación admin).
  for (const [i, v] of draft.variants.entries()) {
    const variantId = v.id ?? `v${i + 1}-${Date.now().toString(36)}`;
    await setDoc(doc(fb.db, 'products', productId, 'variants', variantId), {
      name: v.name.trim().slice(0, 80),
      sku: v.sku.trim().slice(0, 40).toUpperCase(),
      priceUsd: Math.round(v.priceUsd * 100) / 100,
      stock: Math.max(0, Math.floor(v.stock)),
      weightKg: Math.max(0, v.weightKg),
      active: true,
    });
  }
  return productId;
}

/** Ajuste de stock: SOLO vía Cloud Function con auditoría (6.3). */
export async function adminAdjustStock(
  productId: string,
  variantId: string,
  delta: number,
  reason: string,
): Promise<void> {
  if (DEMO_MODE) {
    const p = DEMO_PRODUCTS.find((x) => x.id === productId);
    const v = p?.variants.find((x) => x.id === variantId);
    if (v) v.stock = Math.max(0, v.stock + delta);
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  await callFn<{ productId: string; variantId: string; delta: number; reason: string }, { ok: boolean }>(
    'fn-adjustStock',
    { productId, variantId, delta: Math.trunc(delta), reason: reason.slice(0, 200) },
  );
}

/** Sube imagen de producto a Storage con validación de tipo y tamaño (5.6). */
export async function adminUploadProductImage(productId: string, file: File): Promise<string> {
  if (!isAllowedUploadType(file.type, PRODUCT_IMAGE_TYPES)) throw new AppError('generic', 'tipo no permitido');
  if (!isAllowedUploadSize(file.size)) throw new AppError('generic', 'máximo 5 MB');
  if (DEMO_MODE) return URL.createObjectURL(file);
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const path = `products/${productId}/${Date.now()}-${sanitizeFileName(file.name)}`;
  const r = ref(fb.storage, path);
  const snap = await uploadBytes(r, file, { contentType: file.type });
  return getDownloadURL(snap.ref);
}

/* ── Pedidos (colas de pagos y despacho) ── */

const ACTIVE_STATUSES: OrderStatus[] = ['pendiente', 'en_verificacion', 'pagado', 'preparado', 'en_camino'];

export async function adminListOrders(statuses?: OrderStatus[]): Promise<Order[]> {
  if (DEMO_MODE) {
    const all = demoRead();
    return all.filter((o) => (statuses ? statuses.includes(o.status) : true));
  }
  const fb = await loadFirebase();
  if (!fb) return [];
  const wanted = statuses ?? ACTIVE_STATUSES;
  const snap = await getDocs(
    query(
      collection(fb.db, 'orders'),
      where('status', 'in', wanted.slice(0, 5)), // límite de Firestore: in ≤ 5 valores
      orderBy('createdAt', 'desc'),
      fbLimit(60),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<Order, 'id'>) }));
}

export async function adminVerifyPayment(orderId: string, approve: boolean, note: string): Promise<void> {
  if (DEMO_MODE) {
    const o = demoGetOrder(orderId);
    if (!o) throw new AppError('generic');
    o.status = approve ? 'pagado' : 'cancelado';
    o.payment.status = approve ? 'pagado' : 'rechazado';
    o.payment.verifiedAt = Date.now();
    o.updatedAt = Date.now();
    demoUpsertOrder(o);
    await new Promise((r) => setTimeout(r, 400));
    return;
  }
  await callFn<{ orderId: string; approve: boolean; note: string }, { ok: boolean }>('fn-verifyPayment', {
    orderId,
    approve,
    note: note.slice(0, 300),
  });
}

export async function adminSetOrderStatus(orderId: string, to: OrderStatus, note: string): Promise<void> {
  if (DEMO_MODE) {
    const o = demoGetOrder(orderId);
    if (!o) throw new AppError('generic');
    o.status = to;
    o.updatedAt = Date.now();
    if (to === 'en_camino') o.delivery.trackingCode = `SP-TRK-${Math.floor(100000 + Math.random() * 899999)}`;
    demoUpsertOrder(o);
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  await callFn<{ orderId: string; to: OrderStatus; note: string }, { ok: boolean }>('fn-updateOrderStatus', {
    orderId,
    to,
    note: note.slice(0, 300),
  });
}

/* ── Zonas ── */

export async function adminListZones(): Promise<Zone[]> {
  if (DEMO_MODE) return [...DEMO_ZONES];
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(query(collection(fb.db, 'zones'), orderBy('name', 'asc'), fbLimit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<Zone, 'id'>) }));
}

export async function adminSaveZone(zone: Omit<Zone, 'id'> & { id?: string }): Promise<void> {
  if (DEMO_MODE) {
    await new Promise((r) => setTimeout(r, 300));
    return;
  }
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  if (zone.id) {
    await setDoc(doc(fb.db, 'zones', zone.id), zone, { merge: true });
  } else {
    await addDoc(collection(fb.db, 'zones'), { ...zone, createdAt: serverTimestamp() });
  }
}

export async function adminDeleteZone(zoneId: string): Promise<void> {
  if (DEMO_MODE) return;
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'zones', zoneId));
}

/* ── Métricas (agregaciones del backend) ── */

export interface AdminMetrics {
  ordersByStatus: Record<string, number>;
  revenueUsd30d: number;
  ordersLast7d: number[];
  topProducts: Array<{ name: string; qty: number }>;
}

export async function adminGetMetrics(): Promise<AdminMetrics> {
  if (DEMO_MODE) {
    const all = demoRead();
    const byStatus: Record<string, number> = {};
    all.forEach((o) => {
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
    });
    const productQty = new Map<string, number>();
    all.forEach((o) => o.lines.forEach((l) => productQty.set(l.name, (productQty.get(l.name) ?? 0) + l.qty)));
    return {
      ordersByStatus: byStatus,
      revenueUsd30d: all.reduce((a, o) => a + o.totals.totalUsd, 0),
      ordersLast7d: Array.from({ length: 7 }, (_, i) => all.filter((o) => new Date(o.createdAt).getDay() === ((new Date().getDay() - i + 7) % 7)).length),
      topProducts: [...productQty.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty })),
    };
  }
  return callFn<Record<string, never>, AdminMetrics>('fn-getAdminMetrics', {} as Record<string, never>);
}

/** Catálogo de variantes de un producto (para el editor admin). */
export async function adminGetVariants(productId: string): Promise<ProductVariant[]> {
  if (DEMO_MODE) {
    const p = DEMO_PRODUCTS.find((x) => x.id === productId);
    return p ? [...p.variants] : [];
  }
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(collection(fb.db, 'products', productId, 'variants'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<ProductVariant, 'id'>) }));
}
