/**
 * Módulo admin · Capa de servicios del panel.
 * · Metadatos de producto, zonas: escritura directa por admin (reglas con claim).
 * · Stock, verificación de pago, estados, métricas, roles: SOLO funciones de
 *   servidor (Netlify Functions en modo Lite, mismas cores que Cloud Functions) (6.3).
 * · Imágenes de producto: ruta/URL administrada por el admin; el archivo vive
 *   en el repo (public/img/products) servido por el CDN, o URL externa.
 */
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit as fbLimit, orderBy,
  query, serverTimestamp, setDoc, where, updateDoc,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE, callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { DEMO_PRODUCTS } from '@/shared/lib/demo/seed';
import { DEMO_ZONES } from '@/shared/lib/demo/seed';
import { demoGetOrder, demoRead, demoUpsertOrder } from '@/features/orders/services/orders.service';
import type { Product, ProductVariant } from '@/features/catalog/types';
import type { Zone } from '@/features/delivery/types';
import type { Order, OrderStatus } from '@/features/orders/types';

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
  await callFunction<{ ok: boolean }>('fn-adjustStock',
    { productId, variantId, delta: Math.trunc(delta), reason: reason.slice(0, 200) },
  );
}

/**
 * Asigna las imágenes de un producto por ruta/URL (sin Storage).
 * Rutas válidas: '/img/products/…' (archivo del repo) o URL https externa.
 */
export async function adminSetProductImages(productId: string, images: string[]): Promise<void> {
  const clean = images
    .map((u) => u.trim())
    .filter((u) => /^\/img\/products\/[A-Za-z0-9._-]+$/.test(u) || /^https:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/.test(u))
    .slice(0, 6);
  if (DEMO_MODE) {
    const p = DEMO_PRODUCTS.find((x) => x.id === productId);
    if (p) p.images = clean.length ? clean : p.images;
    await new Promise((r) => setTimeout(r, 250));
    return;
  }
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await updateDoc(doc(fb.db, 'products', productId), { images: clean, updatedAt: Date.now() });
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
  await callFunction<{ ok: boolean }>('fn-verifyPayment', {
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
  await callFunction<{ ok: boolean }>('fn-updateOrderStatus', {
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
  return callFunction<AdminMetrics>('fn-getAdminMetrics', {});
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
