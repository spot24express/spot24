/** Contratos del módulo carrito. */

export interface CartItem {
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  /** Marca del producto (solo presentación). Ronda 5e: viaja con la línea para
   *  que el carrito muestre MARCA arriba + nombre limpio, igual que el catálogo.
   *  Opcional: los ítems agregados antes de esta ronda no la tienen. La marca
   *  NUNCA se envía a Firestore: la lista blanca de las reglas de carts/{uid}
   *  no la incluye (enviarla provocaría permission-denied). Vive en localStorage. */
  brand?: string;
  variantName: string;
  sku: string;
  /** Precio unitario congelado al agregar (solo DISPLAY; el total real lo fija el backend). */
  unitPriceUsd: number;
  qty: number;
  image: string;
  categoryId: string;
  /** Stock visto al agregar: para validar increments sin ir al backend. */
  stockAtAdd: number;
}

export interface GuestCart {
  items: CartItem[];
  updatedAt: number;
}

export const CART_STORAGE_KEY = 'spot24:cart:v1';
export const MAX_QTY_PER_LINE = 20;