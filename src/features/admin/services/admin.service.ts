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
import { callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import type { Product, ProductVariant } from '@/features/catalog/types';
import type { CategoryDef } from '@/shared/constants/categories';
import type { Zone } from '@/features/delivery/types';
import type { Order, OrderStatus } from '@/features/orders/types';

/* ── Productos ── */

export async function adminListProducts(search: string): Promise<Product[]> {
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
  variants: Array<{ id?: string; name: string; sku: string; priceUsd: number; stock: number }>;
}

/** Tokens de búsqueda: palabras de nombre y marca, sin acentos, en minúscula (7.1). */
function buildSearchTerms(name: string, brand: string): string[] {
  const words = `${name} ${brand}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  return [...new Set(words)].slice(0, 20);
}

/** Crea/actualiza producto + subcolección variants (transacción lógica). */
export async function adminSaveProduct(draft: ProductDraftInput): Promise<string> {
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
    searchTerms: buildSearchTerms(draft.name, draft.brand),
    updatedAt: now,
  };

  let productId = draft.id;
  if (!productId) {
    const created = await addDoc(collection(fb.db, 'products'), {
      ...payload,
      images: [`/img/products/${draft.categoryId}.svg`],
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
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await updateDoc(doc(fb.db, 'products', productId), { images: clean, updatedAt: Date.now() });
}

/* ── Pedidos (colas de pagos y despacho) ── */

const ACTIVE_STATUSES: OrderStatus[] = ['pendiente', 'en_verificacion', 'pagado', 'preparado', 'en_camino'];

export async function adminListOrders(statuses?: OrderStatus[]): Promise<Order[]> {
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
  await callFunction<{ ok: boolean }>('fn-verifyPayment', {
    orderId,
    approve,
    note: note.slice(0, 300),
  });
}

export async function adminSetOrderStatus(orderId: string, to: OrderStatus, note: string): Promise<void> {
  await callFunction<{ ok: boolean }>('fn-updateOrderStatus', {
    orderId,
    to,
    note: note.slice(0, 300),
  });
}

/* ── Categorías (colección categories: escritura admin directa) ── */

export interface CategoryDraftInput {
  id?: string;
  name: string;
  tagline: string;
  /** URL https o ruta /img/… vacía = sin foto. */
  imageUrl: string;
  active: boolean;
}

export async function adminListCategories(): Promise<CategoryDef[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, 'categories'), orderBy('createdAt', 'asc'), fbLimit(60)),
  );
  return snap.docs.map((d) => ({
    id: d.id,
    code: '',
    name: String(d.data()['name'] ?? ''),
    tagline: String(d.data()['tagline'] ?? ''),
    imageUrl: typeof d.data()['imageUrl'] === 'string' ? d.data()['imageUrl'] : undefined,
    active: d.data()['active'] !== false,
  }));
}

export async function adminSaveCategory(draft: CategoryDraftInput): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const payload: Record<string, unknown> = {
    name: draft.name.trim().slice(0, 60),
    tagline: draft.tagline.trim().slice(0, 80),
    imageUrl: /^https:\/\//.test(draft.imageUrl.trim()) || /^\/img\//.test(draft.imageUrl.trim())
      ? draft.imageUrl.trim()
      : '',
    active: draft.active,
    updatedAt: Date.now(),
  };
  if (draft.id) {
    await setDoc(doc(fb.db, 'categories', draft.id), payload, { merge: true });
  } else {
    await addDoc(collection(fb.db, 'categories'), { ...payload, createdAt: serverTimestamp() });
  }
}

export async function adminDeleteCategory(categoryId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'categories', categoryId));
}

/* ── Zonas ── */

export async function adminListZones(): Promise<Zone[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(query(collection(fb.db, 'zones'), orderBy('name', 'asc'), fbLimit(50)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<Zone, 'id'>) }));
}

export async function adminSaveZone(zone: Omit<Zone, 'id'> & { id?: string }): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  if (zone.id) {
    await setDoc(doc(fb.db, 'zones', zone.id), zone, { merge: true });
  } else {
    await addDoc(collection(fb.db, 'zones'), { ...zone, createdAt: serverTimestamp() });
  }
}

export async function adminDeleteZone(zoneId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'zones', zoneId));
}

/* ── Usuarios (lectura admin; los roles/cambios van por funciones de servidor) ── */

export interface AdminUserRow {
  uid: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'cajero' | 'delivery' | 'admin';
  createdAtMs: number;
}

export async function adminListUsers(): Promise<AdminUserRow[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, 'users'), orderBy('createdAt', 'desc'), fbLimit(200)),
  );
  return snap.docs.map((d) => {
    const u = d.data();
    const created = u['createdAt'];
    const createdAtMs =
      typeof created === 'object' && created !== null && 'toMillis' in (created as object)
        ? (created as { toMillis: () => number }).toMillis()
        : Number(created ?? 0);
    const role =
      u['role'] === 'admin'
        ? 'admin'
        : u['role'] === 'cajero'
          ? 'cajero'
          : u['role'] === 'delivery'
            ? 'delivery'
            : 'customer';
    return {
      uid: d.id,
      name: String(u['name'] ?? ''),
      email: String(u['email'] ?? ''),
      phone: String(u['phone'] ?? ''),
      role,
      createdAtMs,
    };
  });
}

/* ── Métricas (agregaciones del backend) ── */

export interface AdminMetrics {
  ordersByStatus: Record<string, number>;
  revenueUsd30d: number;
  ordersLast7d: number[];
  topProducts: Array<{ name: string; qty: number }>;
}

export async function adminGetMetrics(): Promise<AdminMetrics> {
  return callFunction<AdminMetrics>('fn-getAdminMetrics', {});
}

/** Catálogo de variantes de un producto (para el editor admin). */
export async function adminGetVariants(productId: string): Promise<ProductVariant[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(collection(fb.db, 'products', productId, 'variants'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<ProductVariant, 'id'>) }));
}