/**
 * Módulo admin · Capa de servicios del panel.
 * · Metadatos de producto, zonas: escritura directa por admin (reglas con claim).
 * · Stock, verificación de pago, estados, métricas, roles: SOLO funciones de
 *   servidor (Netlify Functions en modo Lite, mismas cores que Cloud Functions) (6.3).
 * · Imágenes: URL administrada por el admin (subida fn-uploadImage → imgbb,
 *   o ruta del repo /img/…). La clave de API jamás llega al cliente.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit as fbLimit, orderBy,
  query, serverTimestamp, setDoc, where, updateDoc, writeBatch,
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
  return items.filter(
    (p) =>
      !term ||
      p.name.toLowerCase().includes(term) ||
      p.brand.toLowerCase().includes(term) ||
      (p.code ?? '').toLowerCase().includes(term),
  );
}

export interface ProductDraftInput {
  id?: string;
  /** Código del producto: lo escribe el admin a mano (no lo genera la app).
   *  Se normaliza a mayúsculas y debe ser único entre productos. */
  code: string;
  name: string;
  brand: string;
  categoryId: string;
  description: string;
  active: boolean;
  /** URL https (imgbb) o ruta /img/… del repo. Vacía = sin foto nueva. */
  imageUrl?: string;
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

/**
 * Crea/actualiza producto + subcolección variants en UN SOLO lote atómico:
 * o se guarda todo (producto + todas las variantes) o no se guarda nada.
 * Así jamás quedan productos a medias si la red falla a mitad del guardado.
 */
export async function adminSaveProduct(draft: ProductDraftInput): Promise<string> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');

  // Código del producto: mayúsculas, sin espacios sobrantes, tope 40 caracteres
  // (mismo criterio que el SKU de variantes). La unicidad se valida contra
  // Firestore ANTES del lote: si otro producto ya usa el código, se avisa claro.
  const code = (draft.code ?? '').trim().toUpperCase().slice(0, 40);
  if (code) {
    const dupSnap = await getDocs(
      query(collection(fb.db, 'products'), where('code', '==', code), fbLimit(2)),
    );
    if (dupSnap.docs.some((d) => d.id !== draft.id)) {
      throw new AppError('code-duplicate');
    }
  }

  const slug =
    draft.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `producto-${Date.now().toString(36)}`;

  const stocks = draft.variants.map((v) => Math.max(0, Math.floor(Number(v.stock) || 0)));
  const prices = draft.variants
    .map((v) => Number(v.priceUsd))
    .filter((p) => Number.isFinite(p) && p >= 0);
  const imgUrl = draft.imageUrl?.trim() ?? '';
  const hasImage = /^https:\/\//.test(imgUrl) || /^\/img\//.test(imgUrl);
  const now = Date.now();
  const payload = {
    slug,
    code,
    name: draft.name.trim().slice(0, 120),
    brand: draft.brand.trim().slice(0, 60),
    description: draft.description.trim().slice(0, 1000),
    categoryId: draft.categoryId,
    basePriceUsd: prices.length ? Math.round(Math.min(...prices) * 100) / 100 : 0,
    stockTotal: stocks.reduce((a, b) => a + b, 0),
    variantCount: draft.variants.length,
    active: draft.active,
    searchTerms: buildSearchTerms(draft.name, draft.brand),
    updatedAt: now,
  };

  const productRef = draft.id
    ? doc(fb.db, 'products', draft.id)
    : doc(collection(fb.db, 'products'));
  const batch = writeBatch(fb.db);
  if (draft.id) {
    // Edición: images solo se toca si trajo URL nueva (vacía conserva la foto actual).
    batch.set(productRef, { ...payload, ...(hasImage ? { images: [imgUrl] } : {}) }, { merge: true });
  } else {
    batch.set(productRef, {
      ...payload,
      images: hasImage ? [imgUrl] : [`/img/products/${draft.categoryId}.svg`],
      createdAt: serverTimestamp(),
    });
  }

  // Variantes con id determinista (v1, v2, …): reescribir el mismo producto
  // no duplica variantes y el ajuste de stock con auditoría apunta al doc correcto.
  for (const [i, v] of draft.variants.entries()) {
    const variantId = v.id ?? `v${i + 1}`;
    batch.set(doc(fb.db, 'products', productRef.id, 'variants', variantId), {
      name: v.name.trim().slice(0, 80),
      sku: v.sku.trim().slice(0, 40).toUpperCase(),
      priceUsd: Math.round(Number(v.priceUsd) * 100) / 100,
      stock: Math.max(0, Math.floor(Number(v.stock) || 0)),
      active: true,
    });
  }
  await batch.commit();
  return productRef.id;
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

/** Elimina un producto (solo admin, con confirmación en el panel). */
export async function adminDeleteProduct(productId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'products', productId));
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
  // Payload explícito (mismo patrón que adminSaveCategory): el id NUNCA va
  // dentro del documento y ningún campo viaja undefined — Firestore rechaza
  // undefined en el propio navegador (sin llegar a la red, error silencioso).
  const data = {
    name: zone.name,
    state: zone.state,
    feeUsd: zone.feeUsd,
    freeFromUsd: zone.freeFromUsd,
    etaMinMinutes: zone.etaMinMinutes,
    etaMaxMinutes: zone.etaMaxMinutes,
    active: zone.active,
    windows: zone.windows,
  };
  if (zone.id) {
    await setDoc(doc(fb.db, 'zones', zone.id), data, { merge: true });
  } else {
    await addDoc(collection(fb.db, 'zones'), { ...data, createdAt: serverTimestamp() });
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

/* ── Promos (carrusel de la sección Visítanos del Home) ── */

export interface PromoDraftInput {
  id?: string;
  title: string;
  /** URL https o ruta /img/promos/… (archivo del repo subido por GitHub). */
  imageUrl: string;
  active: boolean;
  /** Orden de aparición en el carrusel: menor número sale primero. */
  order: number;
}

export async function adminListPromos(): Promise<PromoDraftInput[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(collection(fb.db, 'promos'));
  return snap.docs
    .map((d) => ({
      id: d.id,
      title: String(d.data()['title'] ?? ''),
      imageUrl: String(d.data()['imageUrl'] ?? ''),
      active: d.data()['active'] !== false,
      order: Number(d.data()['order'] ?? 0),
    }))
    .sort((a, b) => a.order - b.order);
}

export async function adminSavePromo(draft: PromoDraftInput): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  // Payload explícito (mismo patrón que adminSaveZone): el id NUNCA va dentro
  // del documento y ningún campo viaja undefined — Firestore rechaza undefined
  // en el propio navegador (sin llegar a la red, error silencioso).
  const data = {
    title: draft.title.trim().slice(0, 80),
    imageUrl: draft.imageUrl.trim().slice(0, 500),
    active: draft.active,
    order: Math.max(0, Math.floor(Number(draft.order) || 0)),
    updatedAt: Date.now(),
  };
  if (draft.id) {
    await setDoc(doc(fb.db, 'promos', draft.id), data, { merge: true });
  } else {
    await addDoc(collection(fb.db, 'promos'), { ...data, createdAt: serverTimestamp() });
  }
}

export async function adminDeletePromo(promoId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'promos', promoId));
}

/* ───────────────────────── Tasa BCV (rates/bcv) ───────────────────────── */

export interface BcvRateInfo {
  usdToVes: number;
  /** Fecha valor oficial del BCV de la tasa vigente (YYYY-MM-DD). */
  fechaValor: string;
  /** Cuándo se ACTIVÓ la tasa vigente (solo cambia al activar una nueva). */
  updatedAt: number;
  /** Último intento de lectura (cron o manual): cambia aunque la tasa siga igual. */
  lastAttemptAt: number;
  source: string;
  /** Tasa capturada hoy en la tarde: se activa sola a las 12:00 AM. */
  nextUsdToVes: number;
  nextFechaValor: string;
  nextCapturedAt: number;
}

/**
 * Tasa BCV vigente + pendiente (doc rates/bcv, escrito por la función programada).
 * Lectura directa: las reglas permiten read público en rates.
 * null = aún no existe el documento (normal antes del primer deploy).
 */
export async function adminGetBcvRate(): Promise<BcvRateInfo | null> {
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, 'rates', 'bcv'));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    usdToVes: Number(d['usdToVes'] ?? 0),
    fechaValor: String(d['fechaValor'] ?? ''),
    updatedAt: Number(d['updatedAt'] ?? 0),
    lastAttemptAt: Number(d['lastAttemptAt'] ?? 0),
    source: String(d['source'] ?? 'fallback'),
    nextUsdToVes: Number(d['nextUsdToVes'] ?? 0),
    nextFechaValor: String(d['nextFechaValor'] ?? ''),
    nextCapturedAt: Number(d['nextCapturedAt'] ?? 0),
  };
}