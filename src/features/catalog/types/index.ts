/** Contratos del módulo catálogo (colección products + subcolección variants). */

export interface ProductVariant {
  id: string;
  /** Denominación legible: "5W-30 · 4 L", "12x80 mm", "24 pack" */
  name: string;
  sku: string;
  priceUsd: number;
  stock: number;
  weightKg: number;
  active: boolean;
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  /** Precio base desde (mínimo de variantes activas); variantes guardan el real. */
  basePriceUsd: number;
  images: string[]; // URLs de Storage o placeholders locales en demo
  /** Tokens de búsqueda: nombre + marca + categoría en minúsculas (sin acentos). */
  searchTerms: string[];
  stockTotal: number; // agregado de variantes activas
  variantCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface CatalogFilters {
  categoryId?: string;
  /** precio mínimo USD sobre basePriceUsd */
  minPriceUsd?: number;
  maxPriceUsd?: number;
  inStockOnly?: boolean;
  /** término libre: usa searchTerms array-contains + fallback cliente */
  q?: string;
}

export interface CatalogQuery extends CatalogFilters {
  pageSize: number;
  /** cursor opaco (base64 de createdAt|id) */
  cursor?: string | null;
}
