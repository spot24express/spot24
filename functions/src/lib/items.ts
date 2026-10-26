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

/* ── Ronda 5.93 · AUTOPSIA del 500 de fn-reserveStock ──
 * Dos caminos por los que un 500 «internal» opaco escapaba SIN diagnóstico:
 *
 * 1) ID DE DOCUMENTO CON RUTA INVÁLIDA. Los ids llegan por HTTP y alimentan
 *    rutas de Firestore (products/{productId}/variants/{variantId}). Con un
 *    id que contiene '/', o '.', '..' o empieza por '__', Firestore lanza
 *    «Invalid document reference» SIN propiedad `code` → el adaptador
 *    (http-ctx) lo convertía SIEMPRE en 500 'internal' opaco. Validar los
 *    ids con isSafeDocId lo convierte en 400 accionable («Ítem inválido»).
 *
 * 2) NÚMERO CORRUPTO → NaN → ESCRITURA NaN. Los campos stock/stockReserved
 *    se leían con Number(v ?? 0): si el campo viene corrupto (string no
 *    numérico, null explícito, Infinity) Number() da NaN, el NaN se CUELA
 *    por las comparaciones (qty > NaN es false → pasa la validación de
 *    stock) y llega a tx.update({stock: NaN}) → Firestore rechaza la
 *    escritura con error SIN `code` → otro 500 opaco. finiteNum coacciona
 *    cualquier no-finito a 0: con stock corrupto la reserva falla honesta
 *    («Sin stock suficiente», 400) y con stockReserved corrupto la misma
 *    escritura SANA el campo (quedará exactamente el hold nuevo). */

/** Reglas de ID de documento de Firestore (las que hacen lanzar a doc()). */
export function isSafeDocId(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0 || v.length > 1500) return false;
  if (v.includes('/')) return false;
  if (v === '.' || v === '..') return false;
  if (v.startsWith('__')) return false;
  return true;
}

/** Número garantizado finito: cualquier no-finito (NaN/Infinity) → 0. */
export function finiteNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}