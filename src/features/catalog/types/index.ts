/** Contratos del módulo catálogo (colección products + subcolección variants). */

/**
 * 5.98 · Reseña de cliente (punto G — solo reseñas, sin cupones).
 * Vive DENTRO del array `reviews` del doc del producto (sin colecciones
 * nuevas). `visible` la controla el admin desde el panel (moderación).
 */
export interface ProductReview {
  /** uid del cliente autor (1 reseña por cliente/producto). */
  uid: string;
  /** Nombre visible del cliente (primer nombre del perfil). */
  name: string;
  /** 1–5 estrellas. */
  rating: number;
  /** Opinión corta (3–400 caracteres, ya saneada). */
  text: string;
  /** Momento de creación (epoch-ms). Junto con uid identifica la reseña. */
  at: number;
  /** false = oculta por moderación (no cuenta en rating ni se muestra). */
  visible: boolean;
}

export interface ProductVariant {
  id: string;
  /** Denominación legible: "5W-30 · 4 L", "12x80 mm", "24 pack" */
  name: string;
  sku: string;
  priceUsd: number;
  stock: number;
  active: boolean;
}

export interface Product {
  id: string;
  slug: string;
  /** Código del producto: lo escribe y edita el ADMIN (no lo genera la app).
   *  Único entre productos (validado al guardar). Opcional: productos creados
   *  antes de este campo no lo tienen hasta que el admin lo complete. */
  code?: string;
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  /** Precio base desde (mínimo de variantes activas); variantes guardan el real. */
  basePriceUsd: number;
  images: string[]; // URLs externas o placeholders locales en public/img/products
  /** Tokens de búsqueda: nombre + marca + categoría en minúsculas (sin acentos). */
  searchTerms: string[];
  stockTotal: number; // agregado de variantes activas
  variantCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  /** 5.98 (punto C) · Unidades entregadas acumuladas desde el arranque
   *  (fn-updateOrderStatus suma al marcar Entregado). Empieza SIN campo
   *  (0 para la tienda): los docs sin el campo no aparecen en la consulta
   *  orderBy('vendidosTotal','desc') → «Los más pedidos» nace oculto. */
  vendidosTotal?: number;
  /** 5.98 (punto G) · Promedio de reseñas visibles (1 decimal, 1–5). */
  ratingAvg?: number;
  /** 5.98 (punto G) · Cantidad de reseñas visibles. */
  ratingCount?: number;
}

export interface ProductWithVariants extends Product {
  variants: ProductVariant[];
}

export interface CatalogFilters {
  categoryId?: string;
  /** Ronda 5.76 · rama completa de categorías (padre + subcategorías).
   *  Si viene, reemplaza a categoryId (consulta con `in`, tope 30 ids). */
  categoryIds?: string[];
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