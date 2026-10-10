/**
 * Módulo catalog · Capa de servicios.
 * Único punto de acceso a Firestore para el catálogo (sección 4.3).
 * Consultas SIEMPRE con límite (7.1).
 */
import {
  collection, doc, getDoc, getDocs, getCountFromServer,
  limit as fbLimit, onSnapshot, orderBy, query, startAfter,
  where, type DocumentData, type QueryDocumentSnapshot, type Query,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';
import type { CatalogQuery, Product } from '../types';
import type { Page } from '@/shared/types';
import type { CategoryDef } from '@/shared/constants/categories';

const PRODUCTS = 'products';
const PAGE_SIZE_MAX = 48;

/* ────────────────────────── Firestore helpers ────────────────────────── */

function encodeCursor(docSnap: QueryDocumentSnapshot<DocumentData>): string {
  return btoa(`${docSnap.get('createdAt') as number}|${docSnap.id}`);
}

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const [createdAt, id] = atob(cursor).split('|');
    const ts = Number(createdAt);
    if (!Number.isFinite(ts) || !id) return null;
    return { createdAt: ts, id };
  } catch {
    return null;
  }
}

function buildProductsQuery(q: CatalogQuery, base: Query<DocumentData>): Query<DocumentData> {
  const clauses: Parameters<typeof query>[1][] = [];
  if (q.categoryId) clauses.push(where('categoryId', '==', q.categoryId));
  if (q.minPriceUsd !== undefined) clauses.push(where('basePriceUsd', '>=', q.minPriceUsd));
  if (q.maxPriceUsd !== undefined) clauses.push(where('basePriceUsd', '<=', q.maxPriceUsd));
  if (q.inStockOnly) clauses.push(where('stockTotal', '>', 0));
  if (q.q) clauses.push(where('searchTerms', 'array-contains', q.q));
  clauses.push(orderBy('createdAt', 'desc'));
  if (q.cursor) {
    const c = decodeCursor(q.cursor);
    if (c) clauses.push(startAfter(c.createdAt, c.id));
  }
  clauses.push(fbLimit(Math.min(q.pageSize, PAGE_SIZE_MAX)));
  return query(base, ...clauses);
}

function mapProduct(id: string, data: DocumentData): Product {
  return {
    id,
    slug: String(data.slug ?? id),
    name: String(data.name ?? ''),
    brand: String(data.brand ?? ''),
    description: String(data.description ?? ''),
    categoryId: String(data.categoryId ?? ''),
    basePriceUsd: Number(data.basePriceUsd ?? 0),
    images: Array.isArray(data.images) ? (data.images as string[]) : [],
    searchTerms: Array.isArray(data.searchTerms) ? (data.searchTerms as string[]) : [],
    stockTotal: Number(data.stockTotal ?? 0),
    variantCount: Number(data.variantCount ?? 0),
    active: Boolean(data.active),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
  };
}

/* ───────────────────────────── API pública ───────────────────────────── */

/** Mapa de un documento de categoría (compartido por lectura y vigía en vivo). */
function mapCategory(id: string, c: DocumentData, i: number): CategoryDef {
  return {
    id,
    code: String(i + 1).padStart(2, '0'),
    name: String(c.name ?? ''),
    tagline: String(c.tagline ?? ''),
    imageUrl: typeof c.imageUrl === 'string' && c.imageUrl ? c.imageUrl : undefined,
    active: c.active !== false,
  };
}

/**
 * Categorías desde Firestore (gestionadas por el admin).
 * SIN respaldo demo: si la colección está vacía o aún no hay conexión, se
 * devuelve [] y la tienda muestra solo el chip «Todas» hasta que el admin
 * cree sus categorías reales.
 */
export async function listCategories(): Promise<CategoryDef[]> {
  try {
    const fb = await loadFirebase();
    if (!fb) return [];
    const snap = await getDocs(
      query(collection(fb.db, 'categories'), orderBy('createdAt', 'asc'), fbLimit(60)),
    );
    if (snap.empty) return [];
    return snap.docs
      .map((d, i) => mapCategory(d.id, d.data(), i))
      .filter((c) => c.name && c.active !== false);
  } catch {
    return [];
  }
}

export async function countByCategory(categoryId: string): Promise<number> {
  const fb = await loadFirebase();
  if (!fb) return 0;
  const snap = await getCountFromServer(
    query(collection(fb.db, PRODUCTS), where('categoryId', '==', categoryId), where('active', '==', true)),
  );
  return snap.data().count;
}

/** Página por cursor (default 12, máximo 48). */
export async function listProducts(q: CatalogQuery): Promise<Page<Product>> {
  const pageSize = Math.min(Math.max(q.pageSize || 12, 1), PAGE_SIZE_MAX);

  const fb = await loadFirebase();
  if (!fb) return { items: [], cursor: null, hasMore: false };
  const base = collection(fb.db, PRODUCTS);
  const snap = await getDocs(buildProductsQuery({ ...q, pageSize }, base));
  const docs = snap.docs;
  // El catálogo público solo muestra activos (se filtra en código para no exigir
  // índices compuestos nuevos; la paginación por cursor no se ve afectada).
  const items = docs.map((d) => mapProduct(d.id, d.data())).filter((p) => p.active);
  const last = docs[docs.length - 1];
  return {
    items,
    cursor: snap.docs.length === pageSize && last ? encodeCursor(last) : null,
    hasMore: snap.docs.length === pageSize,
  };
}

function deaccentLocal(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Normaliza término de búsqueda al token esperado por searchTerms. */
export function normalizeSearchTerm(input: string): string {
  return deaccentLocal(input.trim()).replace(/\s+/g, ' ');
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDocs(
    query(collection(fb.db, PRODUCTS), where('slug', '==', slug), fbLimit(1)),
  );
  const first = snap.docs[0];
  // Producto inactivo = inexistente para el público (enlace directo/indexado no filtra).
  const p = first ? mapProduct(first.id, first.data()) : null;
  return p && p.active ? p : null;
}

export async function getVariants(productId: string): Promise<import('../types').ProductVariant[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, PRODUCTS, productId, 'variants'), orderBy('priceUsd', 'asc'), fbLimit(24)),
  );
  return snap.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      name: String(v.name ?? ''),
      sku: String(v.sku ?? ''),
      priceUsd: Number(v.priceUsd ?? 0),
      stock: Number(v.stock ?? 0),
      active: v.active !== false,
    };
  });
}

/** Suscripción en vivo al stock del producto (página de detalle). */
export function subscribeProduct(
  productId: string,
  cb: (p: Product | null) => void,
): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  void loadFirebase().then((fb) => {
    if (!fb || cancelled) return;
    unsub = onSnapshot(
      doc(fb.db, PRODUCTS, productId),
      (snap) => cb(snap.exists() ? mapProduct(snap.id, snap.data()) : null),
      () => cb(null),
    );
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}

/** Productos relacionados: misma categoría, máx. 4, sin límites libres. */
export async function getRelated(product: Product, max = 4): Promise<Product[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  // Sin where(active) en la consulta: exige índice compuesto extra; el filtro
  // se aplica en código con el mismo resultado (índice categoryId+createdAt basta).
  const snap = await getDocs(
    query(
      collection(fb.db, PRODUCTS),
      where('categoryId', '==', product.categoryId),
      orderBy('createdAt', 'desc'),
      fbLimit(max + 6),
    ),
  );
  return snap.docs
    .map((d) => mapProduct(d.id, d.data()))
    .filter((p) => p.active && p.id !== product.id)
    .slice(0, max);
}

/* ───────────────────── Vigías en vivo (cambios del admin) ─────────────────────
 * onSnapshot con firma comparada: disparan el callback SOLO cuando el contenido
 * cambió de verdad (el primer disparo de Firestore entrega el estado inicial y
 * se ignora). Cero coste extra de lecturas más allá del propio listener. */

/** Vigía de categorías: altas, edición de nombre/imagen y activar/desactivar. */
export function subscribeCategoryChanges(cb: () => void): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  let prev: string | null = null;
  void loadFirebase().then((fb) => {
    if (!fb || cancelled) return;
    unsub = onSnapshot(
      query(collection(fb.db, 'categories'), orderBy('createdAt', 'asc'), fbLimit(60)),
      (snap) => {
        const sig = JSON.stringify(snap.docs.map((d, i) => mapCategory(d.id, d.data(), i)));
        if (prev !== null && sig !== prev) cb();
        prev = sig;
      },
      (err) => logger.warn('vigía categorías detenido', err),
    );
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}

/** Pulso del catálogo de productos: dos vigías de 1 documento — el último
 *  EDITADO (updatedAt) y el más RECIENTE (createdAt). Altas, ediciones de
 *  datos/imagen/precio/stock y borrados relevantes mueven una cabeza y
 *  disparan el callback. Coste mínimo: 2 lecturas por cambio. */
export function subscribeCatalogPulse(cb: () => void): () => void {
  let cancelled = false;
  let unsubs: Array<() => void> | null = null;
  const heads: { u: string | null; c: string | null } = { u: null, c: null };
  let prev: string | null = null;
  const evaluate = () => {
    if (heads.u === null || heads.c === null) return; // estado inicial incompleto
    const pair = `${heads.u}~${heads.c}`;
    if (prev !== null && pair !== prev) cb();
    prev = pair;
  };
  void loadFirebase().then((fb) => {
    if (!fb || cancelled) return;
    const u1 = onSnapshot(
      query(collection(fb.db, PRODUCTS), orderBy('updatedAt', 'desc'), fbLimit(1)),
      (snap) => {
        const d = snap.docs[0];
        heads.u = d ? `${d.id}|${String(d.get('updatedAt') ?? '')}` : '';
        evaluate();
      },
      (err) => logger.warn('vigía pulso updatedAt detenido', err),
    );
    const u2 = onSnapshot(
      query(collection(fb.db, PRODUCTS), orderBy('createdAt', 'desc'), fbLimit(1)),
      (snap) => {
        const d = snap.docs[0];
        heads.c = d ? `${d.id}|${String(d.get('createdAt') ?? '')}` : '';
        evaluate();
      },
      (err) => logger.warn('vigía pulso createdAt detenido', err),
    );
    unsubs = [u1, u2];
  });
  return () => {
    cancelled = true;
    unsubs?.forEach((u) => u());
  };
}

/**
 * Lectura puntual de productos por id (ronda 5e): repara los snapshots de las
 * líneas del carrito (marca/nombre viejos congelados al agregar) con los datos
 * vigentes. Máximo 30 ids por llamada (un carrito real queda muy por debajo;
 * el tope del carrito es 50 líneas). Devuelve solo los productos que siguen
 * existiendo: los borrados no se reparan y la línea se muestra con su snapshot.
 */
export async function getProductsByIds(ids: string[]): Promise<Product[]> {
  const wanted = [...new Set(ids)].slice(0, 30);
  if (wanted.length === 0) return [];
  const fb = await loadFirebase();
  if (!fb) return [];
  const snaps = await Promise.all(wanted.map((id) => getDoc(doc(fb.db, PRODUCTS, id))));
  return snaps
    .filter((s) => s.exists())
    .map((s) => mapProduct(s.id, s.data()));
}

/* Re-export para uso interno de los hooks */
export { decodeCursor as __decodeCursor };