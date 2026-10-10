/**
 * SPOT 24 · Definición de categoría.
 * Las categorías viven ÚNICAMENTE en la colección `categories` de Firestore y
 * el admin las gestiona desde el panel (crear/editar/eliminar + imagen).
 * Aquí solo vive el tipo compartido por tienda y panel: nada de listas demo.
 */
export interface CategoryDef {
  id: string;
  /** Número de bahía derivado del orden (01, 02, …). */
  code: string;
  name: string;
  tagline: string;
  /** Imagen opcional de la tarjeta: URL https o ruta /img/… servida por el CDN. */
  imageUrl?: string;
  /** Categoría activa (las inactivas no se listan en la tienda). */
  active?: boolean;
}