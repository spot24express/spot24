/**
 * Módulo admin · Capa de servicios del panel.
 * · Metadatos de producto, zonas: escritura directa por admin (reglas con claim).
 * · Stock, verificación de pago, estados, métricas, roles: SOLO funciones de
 *   servidor (Netlify Functions en modo Lite, mismas cores que Cloud Functions) (6.3).
 * · Imágenes: URL administrada por el admin (subida fn-uploadImage → imgbb,
 *   o ruta del repo /img/…). La clave de API jamás llega al cliente.
 */
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, getCountFromServer, limit as fbLimit, orderBy,
  onSnapshot, query, serverTimestamp, setDoc, startAfter, where, updateDoc, writeBatch,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { normalizeCategoryList } from '@/shared/lib/categoryTree';
import { aMillis } from '@/shared/lib/tiempos';
import { callFunction } from '@/shared/lib/backend';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';
import { ordenarProductosAdmin } from '../lib/listaAdmin';
import type { Product, ProductReview, ProductVariant } from '@/features/catalog/types';
import { camposRating } from '@/features/catalog/lib/vitrina';
import type { CategoryDef } from '@/shared/constants/categories';
import type { Zone } from '@/features/delivery/types';
import type { Order, OrderStatus } from '@/features/orders/types';

/* ── Productos ── */

/* 5.102 · El panel lee la colección COMPLETA por páginas (tope de seguridad).
 * Con 789 productos el tope de 300 de 5.95 dejaba fuera a casi la mitad —
 * caso del dueño: los repuestos MOOG no salían para editarlos. */
const ADMIN_LISTA_TOPE = 3000;
const ADMIN_LISTA_PAGINA = 300;

/**
 * Lista del panel: TODOS los productos, sin recortes.
 * · 5.95 · SIN orderBy('createdAt'): Firestore ordena por TIPO cuando el mismo
 *   campo mezcla valores — Timestamp (panel con serverTimestamp) y número
 *   (importador 5.92e). En DESC todos los Timestamps van PRIMERO: con tope de
 *   60, los 78 MOOG importados quedaban FUERA de la lista para siempre. Sin
 *   orderBy + orden en código con aMillis: se ven TODOS, importados incluidos.
 * · 5.102 · El tope de 300 se quedó corto: con 789 productos la mayoría de los
 *   MOOG volvía a quedar fuera del panel y de su búsqueda. Ahora se recorre la
 *   colección entera por páginas de 300 con cursor por documento (startAfter
 *   del último doc de cada página: orden interno __name__, sin índices nuevos)
 *   hasta agotarla; tope de seguridad 3000 con aviso en el log. El orden y el
 *   filtro de la búsqueda viven en features/admin/lib/listaAdmin (probables
 *   sin Firestore); la búsqueda filtra EN LOCAL y ya no re-lee nada por tecla.
 * Coste: 1 lectura por producto, solo al abrir el panel o tras guardar/borrar/
 *   importar.
 */
export async function adminListProducts(): Promise<Product[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | null = null;
  while (docs.length < ADMIN_LISTA_TOPE) {
    let pageQ = query(collection(fb.db, 'products'), fbLimit(ADMIN_LISTA_PAGINA));
    if (last) pageQ = query(pageQ, startAfter(last));
    const snap = await getDocs(pageQ);
    docs.push(...snap.docs);
    if (snap.docs.length < ADMIN_LISTA_PAGINA) break;
    last = snap.docs[snap.docs.length - 1] ?? null;
  }
  if (docs.length >= ADMIN_LISTA_TOPE) {
    logger.warn(`listado del panel truncado al tope de ${ADMIN_LISTA_TOPE} productos`);
  }
  const items = docs.map((d) => {
    const data = d.data() as Omit<Product, 'id'>;
    return {
      ...data,
      id: d.id,
      createdAt: aMillis(data.createdAt),
      updatedAt: aMillis(data.updatedAt),
    };
  });
  return ordenarProductosAdmin(items);
}

/**
 * 5.96 · Conteo EXACTO de productos de la colección (activos e inactivos:
 * los mismos que muestra este panel). Agregación de servidor: 1 lectura,
 * no descarga documentos — desde 5.102 vale DOBLE: delata que el listado
 * del panel ya no recorta (M encontrados == N sin búsqueda activa).
 */
export async function adminCountAllProducts(): Promise<number> {
  const fb = await loadFirebase();
  if (!fb) return 0;
  const snap = await getCountFromServer(collection(fb.db, 'products'));
  return snap.data().count;
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
    // Edición (5.82 FIX): aquí NO se escribe `images`. La galería la gestiona
    // adminSetProductImages desde el panel. Antes este lote reescribía
    // images:[portada] en CADA guardado: al editar precio o stock SIN tocar
    // fotos, el modal no detectaba cambio y TODAS las demás fotos se borraban
    // (quedaba solo la portada) — el dueño las perdía sin saber por qué.
    // La portada viaja igual en images[0]; el modal aplica la lista completa
    // solo cuando detecta que cambió.
    batch.set(productRef, payload, { merge: true });
  } else {
    batch.set(productRef, {
      ...payload,
      images: hasImage ? [imgUrl] : [`/img/products/${draft.categoryId}.svg`],
      // 5.95: número epoch-ms, MISMA convención que el importador. Antes iba
      // serverTimestamp() (Timestamp de Firestore): al mezclar tipos en
      // createdAt, el orden de tipos de Firestore (números < Timestamps) mal
      // ubicaba los productos en el catálogo y en la lista del admin.
      createdAt: now,
    });
  }

  // Variantes: id ÚNICO EN TODO EL CATÁLOGO (ronda 5e). Antes se usaba
  // «v1, v2, …» en TODOS los productos: como el carrito agrupa líneas por
  // productId+variantId, dos productos con variante «v1» colisionaban y al
  // agregar el segundo se incrementaba la línea del primero. Con el id del
  // producto como prefijo, cada variante es única y estable entre guardados.
  // Las variantes ya existentes conservan su id original (v.id) para no
  // romper líneas de carrito ni ajustes de stock con auditoría.
  for (const [i, v] of draft.variants.entries()) {
    const variantId = v.id ?? `${productRef.id}-v${i + 1}`;
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

/* ── 5.87 · Importar inventario desde el PDF del POS ── */

export interface ImportInventarioResult {
  /** Filas reconocidas en el PDF. */
  filas: number;
  /** Productos NUEVOS creados (código no existía). */
  creados: number;
  /** Productos existentes con stock y precio actualizados. */
  actualizados: number;
  /** 5.92 · Formato detectado: «pos» (Inventario disponible) o «lista-limpia» (doble precio). */
  formato: 'pos' | 'lista-limpia';
  /** Filas descartadas con motivo (ilegibles, códigos repetidos renombrados…). */
  problemas: string[];
}

/**
 * Sube el PDF de inventario (base64) a fn-importInventory: detecta el
 * formato (reporte del POS o lista limpia con doble precio), crea los
 * productos que falten — aun con existencia/precio 0, así los actualiza
 * la próxima importación — y actualiza stock + precio de los existentes.
 */
export async function adminImportInventory(
  pdfBase64: string,
  categoryId: string,
): Promise<ImportInventarioResult> {
  return callFunction<ImportInventarioResult>('fn-importInventory', {
    pdfBase64,
    categoryId,
  });
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

/**
 * Elimina un producto (solo admin, con confirmación en el panel).
 * 5.92c · Borrado COMPLETO en UN lote atómico: TODAS las variantes + la
 * ficha se borran juntos — si algo falla no se borra nada. Antes solo se
 * borraba la ficha y las variantes quedaban colgando en la base (Firestore
 * no borra subcolecciones en cascada): esa basura tomaba al importador por
 * sorpresa y abortó la 1ª importación real con «No document to update».
 * Un producto solo tiene variantes como subcolección (verificado), así que
 * con esto no queda nada huérfano.
 */
export async function adminDeleteProduct(productId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const varsSnap = await getDocs(collection(fb.db, 'products', productId, 'variants'));
  const batch = writeBatch(fb.db);
  varsSnap.forEach((v) => batch.delete(v.ref));
  batch.delete(doc(fb.db, 'products', productId));
  await batch.commit();
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

/**
 * Suscripción EN VIVO a la cola del panel (ronda 5i-j): onSnapshot acotado a
 * los estados dados (≤5, límite de Firestore) y a 60 docs. La usan la página
 * de pagos (lista que se actualiza sola) y la alerta global de pedidos
 * nuevos (NewOrderAlert). Devuelve la función de desuscripción.
 */
export function adminSubscribeOrders(
  statuses: OrderStatus[],
  onData: (orders: Order[]) => void,
  onError: (e: unknown) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void loadFirebase()
    .then((fb) => {
      if (!fb) {
        onError(new Error('Firebase no disponible.'));
        return;
      }
      if (cancelled) return;
      const q = query(
        collection(fb.db, 'orders'),
        where('status', 'in', statuses.slice(0, 5)),
        orderBy('createdAt', 'desc'),
        fbLimit(60),
      );
      unsub = onSnapshot(
        q,
        (snap) => {
          onData(snap.docs.map((d) => ({ id: d.id, ...(d.data() as unknown as Omit<Order, 'id'>) })));
        },
        (e) => onError(e),
      );
    })
    .catch(onError);
  return () => {
    cancelled = true;
    unsub?.();
  };
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

/** 5.28 · «Tomar pedido»: SOLO delivery — asigna el pedido a quien lo agarra
 *  primero y lo pasa a EN CAMINO en una transacción atómica (una acción). */
export async function claimDeliveryOrder(orderId: string): Promise<void> {
  await callFunction<{ ok: boolean }>('fn-claimDeliveryOrder', { orderId });
}

/** 5.28 · «Reasignar»: SOLO gerencia/admin — suelta el claim del pedido en
 *  camino, lo devuelve a PREPARADO y re-avisa a los deliverys. */
export async function releaseDeliveryOrder(orderId: string, note = ''): Promise<void> {
  await callFunction<{ ok: boolean }>('fn-releaseDeliveryOrder', {
    orderId,
    note: note.slice(0, 200),
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
  /** Ronda 5.76 · id del padre ('' = categoría principal). Solo un nivel. */
  parentId: string;
}

export async function adminListCategories(): Promise<CategoryDef[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, 'categories'), orderBy('createdAt', 'asc'), fbLimit(60)),
  );
  // Misma normalización que la tienda (códigos de bahía + árbol de un nivel):
  // el panel ve exactamente lo que ve el cliente, incluidas las inactivas.
  return normalizeCategoryList(
    snap.docs.map((d) => ({
      id: d.id,
      code: '',
      name: String(d.data()['name'] ?? ''),
      tagline: String(d.data()['tagline'] ?? ''),
      imageUrl: typeof d.data()['imageUrl'] === 'string' ? d.data()['imageUrl'] : undefined,
      active: d.data()['active'] !== false,
      parentId: typeof d.data()['parentId'] === 'string' ? d.data()['parentId'] : '',
    })),
  );
}

/**
 * Crea o actualiza una categoría y DEVUELVE su id (5.81): el panel lo necesita
 * para mover productos hacia una subcategoría recién creada.
 */
export async function adminSaveCategory(draft: CategoryDraftInput): Promise<string> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const payload: Record<string, unknown> = {
    name: draft.name.trim().slice(0, 60),
    tagline: draft.tagline.trim().slice(0, 80),
    imageUrl: /^https:\/\//.test(draft.imageUrl.trim()) || /^\/img\//.test(draft.imageUrl.trim())
      ? draft.imageUrl.trim()
      : '',
    active: draft.active,
    // Ronda 5.76: '' = principal. Defensa extra: nadie es su propio padre.
    parentId: draft.parentId && draft.parentId !== draft.id ? draft.parentId : '',
    updatedAt: Date.now(),
  };
  if (draft.id) {
    await setDoc(doc(fb.db, 'categories', draft.id), payload, { merge: true });
    return draft.id;
  }
  const ref = await addDoc(collection(fb.db, 'categories'), { ...payload, createdAt: serverTimestamp() });
  return ref.id;
}

export async function adminDeleteCategory(categoryId: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await deleteDoc(doc(fb.db, 'categories', categoryId));
}

/**
 * 5.81 · Mueve TODOS los productos de una categoría a otra (en lotes de 400,
 * tope de escritura por lote en Firestore). El panel lo usa al crear una
 * subcategoría en una bahía que tenía productos directos: esos productos
 * quedarían ocultos en la tienda (la bahía con subcategorías solo muestra
 * subcategorías) — con un toque quedan dentro de la nueva subcategoría.
 * Devuelve cuántos productos movió.
 */
export async function adminMoveProductsToCategory(fromCategoryId: string, toCategoryId: string): Promise<number> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const snap = await getDocs(
    query(collection(fb.db, 'products'), where('categoryId', '==', fromCategoryId)),
  );
  const ids = snap.docs.map((d) => d.id);
  const now = Date.now();
  for (let i = 0; i < ids.length; i += 400) {
    const batch = writeBatch(fb.db);
    for (const id of ids.slice(i, i + 400)) {
      batch.update(doc(fb.db, 'products', id), { categoryId: toCategoryId, updatedAt: now });
    }
    await batch.commit();
  }
  return ids.length;
}

/**
 * Conteo de productos activos de una categoría (ronda 5.76).
 * El panel lo usa ANTES de eliminar: si tiene productos, bloquea el borrado
 * y evita que esos productos queden colgando de una categoría que no existe.
 */
export async function adminCountProductsInCategory(categoryId: string): Promise<number> {
  const fb = await loadFirebase();
  if (!fb) return 0;
  const snap = await getCountFromServer(
    query(
      collection(fb.db, 'products'),
      where('categoryId', '==', categoryId),
      where('active', '==', true),
    ),
  );
  return snap.data().count;
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
  role: 'customer' | 'cajero' | 'delivery' | 'gerente' | 'admin';
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
        : u['role'] === 'gerente'
          ? 'gerente'
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
  /** 7 números = semana ACTUAL lunes→domingo (cortes a medianoche VE). */
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

/* ─────────────── 5.98 (G) · Moderación de reseñas de productos ───────────────
 * Las reseñas viven DENTRO del doc del producto (array `reviews`, sin
 * colecciones nuevas). El panel (admin/gerente, canEditCatalog en reglas)
 * lee la lista COMPLETA (incluidas las ocultas) y por cada reseña puede
 * ocultar/mostrar/eliminar. Tras cada cambio se recalculan ratingAvg y
 * ratingCount SOLO con las visibles (libra compartida features/catalog/lib/vitrina). */

function mapResena(r: Record<string, unknown>): ProductReview {
  return {
    uid: String(r['uid'] ?? ''),
    name: String(r['name'] ?? 'Cliente').slice(0, 24),
    rating: Math.min(5, Math.max(1, Math.floor(Number(r['rating'] ?? 0)))),
    text: String(r['text'] ?? '').slice(0, 400),
    at: Number(r['at'] ?? 0),
    visible: r['visible'] !== false,
  };
}

/** TODAS las reseñas del producto (visibles y ocultas), más nuevas primero. */
export async function adminGetResenas(productId: string): Promise<ProductReview[]> {
  const fb = await loadFirebase();
  if (!fb || !productId) return [];
  const snap = await getDoc(doc(fb.db, 'products', productId));
  const raw = snap.exists() ? snap.data()['reviews'] : null;
  if (!Array.isArray(raw)) return [];
  return (raw as Array<Record<string, unknown>>)
    .map(mapResena)
    .filter((r) => r.uid && r.at > 0)
    .sort((a, b) => b.at - a.at);
}

/** Reescribe el array de reseñas aplicando el cambio y recalcula el rating. */
async function reescribirResenas(
  productId: string,
  mutar: (lista: ProductReview[]) => ProductReview[],
): Promise<ProductReview[]> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const ref = doc(fb.db, 'products', productId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new AppError('generic', 'El producto ya no existe.');
  const raw = Array.isArray(snap.data()['reviews']) ? (snap.data()['reviews'] as Array<Record<string, unknown>>) : [];
  const lista = mutar((raw as Array<Record<string, unknown>>).map(mapResena).filter((r) => r.uid && r.at > 0));
  await updateDoc(ref, { reviews: lista, ...camposRating(lista) });
  return lista.sort((a, b) => b.at - a.at);
}

/** Ocultar / volver a mostrar una reseña (moderación sin borrar). */
export async function adminSetResenaVisible(
  productId: string,
  uid: string,
  at: number,
  visible: boolean,
): Promise<void> {
  await reescribirResenas(productId, (lista) =>
    lista.map((r) => (r.uid === uid && r.at === at ? { ...r, visible } : r)),
  );
}

/** Elimina la reseña definitivamente (auditoría: mejor ocultar). */
export async function adminDeleteResena(productId: string, uid: string, at: number): Promise<void> {
  await reescribirResenas(productId, (lista) => lista.filter((r) => !(r.uid === uid && r.at === at)));
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
  /** Motivo del último fallo de lectura ('red'|'html'|'rango'|'presupuesto'); vacío si fue exitosa. */
  lastError: string;
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
    lastError: String(d['lastError'] ?? ''),
    nextUsdToVes: Number(d['nextUsdToVes'] ?? 0),
    nextFechaValor: String(d['nextFechaValor'] ?? ''),
    nextCapturedAt: Number(d['nextCapturedAt'] ?? 0),
  };
}