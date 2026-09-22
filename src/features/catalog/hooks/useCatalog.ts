import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  countByCategory, getBcvRate, getProductBySlug, getRelated,
  getVariants, listCategories, listProducts, normalizeSearchTerm,
} from '../services/catalog.service';
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
  rate: ['catalog', 'bcv'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: catalogKeys.categories,
    queryFn: listCategories,
    staleTime: 60 * 60 * 1000,
  });
}

export function useCategoryCount(categoryId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.counts(categoryId ?? ''),
    queryFn: () => countByCategory(categoryId!),
    enabled: Boolean(categoryId),
    staleTime: staleTimeMin,
  });
}

/** Listado infinito con paginación por cursor (staleTime por tipo de dato). */
export function useProductList(filters: CatalogFilters, pageSize = 12) {
  return useInfiniteQuery({
    queryKey: catalogKeys.list({ ...filters }),
    queryFn: ({ pageParam }) => listProducts({ ...filters, pageSize, cursor: pageParam ?? null }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore ? last.cursor : null),
    staleTime: staleTimeMin,
  });
}

export function useProduct(slug: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.product(slug ?? ''),
    queryFn: () => getProductBySlug(slug!),
    enabled: Boolean(slug),
    staleTime: staleTimeMin,
  });
}

export function useVariants(productId: string | undefined) {
  return useQuery({
    queryKey: catalogKeys.variants(productId ?? ''),
    queryFn: () => getVariants(productId!),
    enabled: Boolean(productId),
    staleTime: staleTimeMin,
  });
}

export function useRelated(product: Product | null | undefined) {
  return useQuery({
    queryKey: catalogKeys.related(product?.id ?? ''),
    queryFn: () => getRelated(product!),
    enabled: Boolean(product),
    staleTime: 10 * 60 * 1000,
  });
}

/** Tasa BCV (solo lectura; los montos Bs oficiales los calcula el backend). */
export function useBcvRate() {
  return useQuery({
    queryKey: catalogKeys.rate,
    queryFn: getBcvRate,
    staleTime: 10 * 60 * 1000,
  });
}

export { normalizeSearchTerm };
