/** Contratos del módulo carrito. */

export interface CartItem {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  variantName: string;
  sku: string;
  /** Precio unitario congelado al agregar (solo DISPLAY; el total real lo fija el backend). */
  unitPriceUsd: number;
  qty: number;
  image: string;
  categoryId: string;
  weightKg: number;
  /** Stock visto al agregar: para validar increments sin ir al backend. */
  stockAtAdd: number;
}

export interface GuestCart {
  items: CartItem[];
  updatedAt: number;
}

export const CART_STORAGE_KEY = 'spot24:cart:v1';
export const MAX_QTY_PER_LINE = 20;
