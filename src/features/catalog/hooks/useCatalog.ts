import { useEffect } from 'react';
import {
  useInfiniteQuery, useQuery, useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  countByCategory, getProductBySlug, getRelated,
  getVariants, listCategories, listProducts, normalizeSearchTerm,
  subscribeCatalogPulse, subscribeCategoryChanges,
} from '../services/catalog.service';
import { listActivePromos, subscribeActivePromos } from '../services/promos.service';
import type { CatalogFilters } from '../types';
import type { Product } from '../types';

const staleTimeMin = 5 * 60 * 1000;

export const catalogKeys = {
  categories: ['catalog', 'categories'] as const,
  counts: (categoryId: string) => ['catalog', 'count', categoryId] as const,
  list: (f: CatalogFilters) => ['catalog', 'list', f] as const,
  product: (slug: string) => ['catalog', 'product', slug] as const,
  variants: (productId: string) => ['catalog', 'variants', productId] as const,
  related: (productId: string) => ['catalog', 'related', productId] as const,
};

/* ─────────────── Bus en vivo: cambios del admin → refresco al instante ───────────────
 * Un singleton con vigías onSnapshot (productos + categorías + promos). Cuando el
 * admin guarda cualquier cambio, los vigías disparan la invalidación de las queries
 * de react-query y TODAS las pantallas abiertas (Home, Catálogo, Producto, en web y
 * en la PWA instalada, PC y teléfono) se refrescan solas, sin recargar.
 * Coste: 4 documentos vigilados en total; la invalidación solo refetcha lo visible. */
let liveBus: Array<() => void> | null = null;

function ensureLiveCatalog(qc: QueryClient): void {
  if (liveBus) return;
  const invalidateCatalog = (): void => {
    void qc.invalidateQueries({ queryKey: ['catalog'] });
  };
  const invalidatePromos = (): void => {
    void qc.invalidateQueries({ queryKey: ['promos'] });
  };
  liveBus = [
    subscribeCatalogPulse(invalidateCatalog),
    subscribeCategoryChanges(invalidateCatalog),
    subscribeActivePromos(invalidatePromos),
  ];
}

/** Engancha el bus en vivo (idempotente: los vigías viven toda la sesión). */
function useCatalogLive(): void {
  const qc = useQueryClient();
  useEffect(() => {
    ensureLiveCatalog(qc);
  }, [qc]);
}

export function useCategories() {
  useCatalogLive();
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: listCategories,
    staleTime: 60 * 60 * 1000,
  });
}

export function useCategoryCount(categoryId: string | undefined) {
  useCatalogLive();
  return useQuery({
    queryKey: catalogKeys.counts(categoryId ?? ''),
    queryFn: () => countByCategory(categoryId!),
    enabled: Boolean(categoryId),
    staleTime: staleTimeMin,
  });
}

/** Listado infinito con paginación por cursor (staleTime por tipo de dato). */
export function useProductList(filters: CatalogFilters, pageSize = 12) {
  useCatalogLive();
  return useInfiniteQuery({
    queryKey: catalogKeys.list({ ...filters }),
    queryFn: ({ pageParam }) => listProducts({ ...filters, pageSize, cursor: pageParam ?? null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.cursor : null),
    staleTime: staleTimeMin,
  });
}

export function useProduct(slug: string | undefined) {
  useCatalogLive();
  return useQuery({
    queryKey: catalogKeys.product(slug ?? ''),
    queryFn: () => getProductBySlug(slug!),
    enabled: Boolean(slug),
    staleTime: staleTimeMin,
  });
}

export function useVariants(productId: string | undefined) {
  useCatalogLive();
  return useQuery({
    queryKey: catalogKeys.variants(productId ?? ''),
    queryFn: () => getVariants(productId!),
    enabled: Boolean(productId),
    staleTime: staleTimeMin,
  });
}

export function useRelated(product: Product | null | undefined) {
  useCatalogLive();
  return useQuery({
    queryKey: catalogKeys.related(product?.id ?? ''),
    queryFn: () => getRelated(product!),
    enabled: Boolean(product),
    staleTime: 10 * 60 * 1000,
  });
}

/** Promos activas del carrusel «Visítanos», en vivo con el resto del catálogo. */
export function usePromos() {
  useCatalogLive();
  return useQuery({
    queryKey: ['promos', 'active'] as const,
    queryFn: listActivePromos,
    staleTime: staleTimeMin,
  });
}

export { normalizeSearchTerm };
