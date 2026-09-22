/**
 * Módulo catalog · Capa de servicios.
 * Único punto de acceso a Firestore para el catálogo (sección 4.3).
 * Con DEMO_MODE sirve el seed local. Consultas SIEMPRE con límite (7.1).
 */
import {
  collection, doc, getDoc, getDocs, getCountFromServer,
  limit as fbLimit, onSnapshot, orderBy, query, startAfter,
  where, type DocumentData, type QueryDocumentSnapshot, type Query,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { DEMO_PRODUCTS } from '@/shared/lib/demo/seed';
import type { CatalogQuery, Product } from '../types';
import type { Page, BcvRate } from '@/shared/types';
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

export async function listCategories(): Promise<CategoryDef[]> {
  return [...CATEGORIES];
}

export async function countByCategory(categoryId: string): Promise<number> {
  if (DEMO_MODE) {
    return DEMO_PRODUCTS.filter((p) => p.categoryId === categoryId).length;
  }
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
  if (DEMO_MODE) {
    let items = DEMO_PRODUCTS.filter((p) => p.active);
    if (q.categoryId) items = items.filter((p) => p.categoryId === q.categoryId);
    if (q.inStockOnly) items = items.filter((p) => p.stockTotal > 0);
    if (q.minPriceUsd !== undefined) items = items.filter((p) => p.basePriceUsd >= q.minPriceUsd!);
    if (q.maxPriceUsd !== undefined) items = items.filter((p) => p.basePriceUsd <= q.maxPriceUsd!);
    if (q.q) {
      const term = q.q;
      items = items.filter(
        (p) =>
          p.searchTerms.some((t) => t.startsWith(term)) ||
          deaccentLocal(p.name).includes(term),
      );
    }
    items = [...items].sort((a, b) => b.createdAt - a.createdAt);
    const startIdx = q.cursor ? Number(Buffer.from(q.cursor, 'base64').toString('utf8').split('|')[0] ?? 0) || 0 : 0;
    const pageItems = items.slice(startIdx, startIdx + pageSize);
    const nextIdx = startIdx + pageSize;
    return {
      items: pageItems,
      cursor: nextIdx < items.length ? btoa(`${nextIdx}|${pageItems[pageItems.length - 1]?.id ?? ''}`) : null,
      hasMore: nextIdx < items.length,
    };
  }

  const fb = await loadFirebase();
  if (!fb) return { items: [], cursor: null, hasMore: false };
  const base = collection(fb.db, PRODUCTS);
  const snap = await getDocs(buildProductsQuery({ ...q, pageSize }, base));
  const docs = snap.docs;
  const items = docs.map((d) => mapProduct(d.id, d.data()));
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
  if (DEMO_MODE) {
    return DEMO_PRODUCTS.find((p) => p.slug === slug) ?? null;
  }
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDocs(
    query(collection(fb.db, PRODUCTS), where('slug', '==', slug), fbLimit(1)),
  );
  const first = snap.docs[0];
  return first ? mapProduct(first.id, first.data()) : null;
}

export async function getVariants(productId: string): Promise<import('../types').ProductVariant[]> {
  if (DEMO_MODE) {
    const p = DEMO_PRODUCTS.find((x) => x.id === productId);
    return p ? p.variants : [];
  }
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
      weightKg: Number(v.weightKg ?? 0),
      active: v.active !== false,
    };
  });
}

/** Suscripción en vivo al stock del producto (página de detalle). */
export function subscribeProduct(
  productId: string,
  cb: (p: Product | null) => void,
): () => void {
  if (DEMO_MODE) {
    const p = DEMO_PRODUCTS.find((x) => x.id === productId) ?? null;
    cb(p ? { ...p } : null);
    return () => undefined;
  }
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
  if (DEMO_MODE) {
    return DEMO_PRODUCTS.filter((p) => p.categoryId === product.categoryId && p.id !== product.id).slice(0, max);
  }
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(
      collection(fb.db, PRODUCTS),
      where('categoryId', '==', product.categoryId),
      where('active', '==', true),
      orderBy('createdAt', 'desc'),
      fbLimit(max + 1),
    ),
  );
  return snap.docs
    .map((d) => mapProduct(d.id, d.data()))
    .filter((p) => p.id !== product.id)
    .slice(0, max);
}

/** Tasa BCV publicada por la Cloud Function programada. */
export async function getBcvRate(): Promise<BcvRate | null> {
  if (DEMO_MODE) {
    const { DEMO_BCV_RATE } = await import('@/shared/lib/demo/seed');
    return { ...DEMO_BCV_RATE };
  }
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, 'rates', 'bcv'));
  if (!snap.exists()) return null;
  const d = snap.data();
  return { usdToVes: Number(d.usdToVes ?? 0), updatedAt: Number(d.updatedAt ?? 0), source: 'bcv.org.ve' };
}

/* Re-export para uso interno de los hooks */
export { decodeCursor as __decodeCursor };
