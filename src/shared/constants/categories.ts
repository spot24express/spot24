/**
 * SPOT 24 · Categorías del catálogo.
 * En producción viven en la colección `categories` de Firestore y el admin las
 * gestiona desde el panel (crear/editar/eliminar + imagen). Estas constantes son
 * el respaldo: se muestran solo si la colección aún no tiene documentos.
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

export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'lubricantes', code: '01', name: 'Lubricantes', tagline: 'Aceites y aditivos' },
  { id: 'filtros', code: '02', name: 'Filtros', tagline: 'Aire, aceite y gasolina' },
  { id: 'amortiguadores', code: '03', name: 'Amortiguadores', tagline: 'Suspensión firme' },
  { id: 'baterias', code: '04', name: 'Baterías', tagline: 'Arranque garantizado' },
  { id: 'cambio-aceite', code: '05', name: 'Cambio de aceite', tagline: 'Servicio en tu domicilio' },
  { id: 'bebidas', code: '06', name: 'Bebidas', tagline: 'Frías al instante' },
  { id: 'snacks', code: '07', name: 'Snacks', tagline: 'Para el camino' },
  { id: 'cafe', code: '08', name: 'Café', tagline: 'Recarga 24/7' },
] as const;

export function categoryById(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}