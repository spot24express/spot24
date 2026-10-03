/**
 * SPOT 24 · Contrato de líneas de carrito (reserveStock / quoteTotals / createOrder).
 * El transporte HTTP entrega ctx.data = body.data, que según el cliente llega
 * en DOS formas:
 *  · { items: [...] } — contrato correcto (quoteTotals, createOrder, y
 *    reserveStock desde la ronda del fix de confirmación).
 *  · [ ... ] (array pelado) — como enviaba reserveStock antes del fix (el
 *    array llegaba como ctx.data y data['items'] era undefined → «Carrito
 *    vacío o demasiado grande.» con 400 invalid-argument).
 * extractItems acepta ambas y devuelve [] para cualquier otra cosa, de modo
 * que la validación posterior («Ítem inválido», rangos de qty, etc.) siga
 * siendo la única fuente de verdad sobre qué es un ítem válido.
 */
export interface ReserveItem {
  productId: unknown;
  variantId: unknown;
  qty: unknown;
}

export function extractItems(data: unknown): ReserveItem[] {
  if (Array.isArray(data)) return data as ReserveItem[];
  if (data && typeof data === 'object' && Array.isArray((data as Record<string, unknown>)['items'])) {
    return (data as Record<string, unknown>)['items'] as ReserveItem[];
  }
  return [];
}