/**
 * SPOT 24 · Las ocho categorías del pit stop, numeradas 01 a 08.
 * "id" coincide con el documentId en Firestore → collection categories.
 */
export interface CategoryDef {
  id: string;
  code: string;
  name: string;
  tagline: string;
  /** Nombre del placeholder local en /img/products/ */
  placeholder: string;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { id: 'lubricantes', code: '01', name: 'Lubricantes', tagline: 'Aceites y aditivos', placeholder: 'lubricantes.svg' },
  { id: 'filtros', code: '02', name: 'Filtros', tagline: 'Aire, aceite y gasolina', placeholder: 'filtros.svg' },
  { id: 'amortiguadores', code: '03', name: 'Amortiguadores', tagline: 'Suspensión firme', placeholder: 'amortiguadores.svg' },
  { id: 'baterias', code: '04', name: 'Baterías', tagline: 'Arranque garantizado', placeholder: 'baterias.svg' },
  { id: 'cambio-aceite', code: '05', name: 'Cambio de aceite', tagline: 'Servicio en tu domicilio', placeholder: 'cambio-aceite.svg' },
  { id: 'bebidas', code: '06', name: 'Bebidas', tagline: 'Frías al instante', placeholder: 'bebidas.svg' },
  { id: 'snacks', code: '07', name: 'Snacks', tagline: 'Para el camino', placeholder: 'snacks.svg' },
  { id: 'cafe', code: '08', name: 'Café', tagline: 'Recarga 24/7', placeholder: 'cafe.svg' },
] as const;

export function categoryById(id: string): CategoryDef | undefined {
  return CATEGORIES.find((c) => c.id === id);
}
