/**
 * Módulo catalog · Capa de servicios.
 * Único punto de acceso a Firestore para el catálogo (sección 4.3).
 * Consultas SIEMPRE con límite (7.1).
 */
import {
  collection, doc, getDocs, getCountFromServer,
  limit as fbLimit, onSnapshot, orderBy, query, startAfter,
  where, type DocumentData, type QueryDocumentSnapshot, type Query,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import type { CatalogQuery, Product } from '../types';
import type { Page } from '@/shared/types';
import { CATEGORIES, type CategoryDef } from '@/shared/constants/categories';

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

/** Categorías desde Firestore (gestionadas por el admin); respaldo local si aún no hay datos. */
export async function listCategories(): Promise<CategoryDef[]> {
  try {
    const fb = await loadFirebase();
    if (!fb) return [...CATEGORIES];
    const snap = await getDocs(
      query(collection(fb.db, 'categories'), orderBy('createdAt', 'asc'), fbLimit(60)),
    );
    if (snap.empty) return [...CATEGORIES];
    return snap.docs
      .map((d, i) => {
        const c = d.data();
        return {
          id: d.id,
          code: String(i + 1).padStart(2, '0'),
          name: String(c.name ?? ''),
          tagline: String(c.tagline ?? ''),
          imageUrl: typeof c.imageUrl === 'string' && c.imageUrl ? c.imageUrl : undefined,
          active: c.active !== false,
        };
      })
      .filter((c) => c.name && c.active !== false);
  } catch {
    return [...CATEGORIES];
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
  return first ? mapProduct(first.id, first.data()) : null;
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

/* Re-export para uso interno de los hooks */
export { decodeCursor as __decodeCursor };