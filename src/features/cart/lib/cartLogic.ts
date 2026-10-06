/**
 * Módulo carrito · Lógica pura (testeable sin DOM ni Firebase).
 * La validación de stock al agregar y la fusión de carritos viven aquí.
 */
import type { CartItem } from '../types';
import { MAX_QTY_PER_LINE } from '../types';

export interface AddValidationResult {
  ok: boolean;
  reason?: 'sin-stock' | 'tope-cantidad' | 'inactivo';
}

/** Valida agregar `qty` unidades de una variante con `stock` disponible. */
export function validateAdd(stock: number, currentQty: number, qty: number): AddValidationResult {
  if (stock <= 0) return { ok: false, reason: 'sin-stock' };
  const maxAddable = Math.min(stock, MAX_QTY_PER_LINE) - currentQty;
  if (maxAddable <= 0) return { ok: false, reason: 'tope-cantidad' };
  if (qty > maxAddable) return { ok: false, reason: 'sin-stock' };
  return { ok: true };
}

/** Cantidad resultante al fijar qty manualmente, acotada por stock y tope. */
export function clampSetQty(qty: number, stock: number): number {
  const max = Math.min(stock, MAX_QTY_PER_LINE);
  if (!Number.isFinite(qty) || qty < 1) return Math.max(1, Math.min(1, max));
  return Math.min(max, Math.max(1, Math.floor(qty)));
}

/**
 * Clave ÚNICA de una línea de carrito.
 * Ronda 5e — CRÍTICO: el variantId NO es único entre productos (las variantes
 * creadas desde /admin se llaman «v1», «v2»… en TODOS los productos). Agrupar
 * solo por variantId hacía que agregar un segundo producto incrementara la
 * línea del primero en vez de crear la suya. La identidad real de una línea es
 * productId + variantId.
 */
export function cartLineKey(productId: string, variantId: string): string {
  return `${productId}::${variantId}`;
}

/**
 * Fusión de carritos (invitado + usuario) al iniciar sesión.
 * · Misma línea (productId+variantId) → queda la mayor cantidad (respetando stock).
 * · El resto se une; nunca duplicados.
 */
export function mergeCarts(
  guest: CartItem[],
  remote: CartItem[],
): CartItem[] {
  const byLine = new Map<string, CartItem>();
  const upsert = (item: CartItem) => {
    const key = cartLineKey(item.productId, item.variantId);
    const existing = byLine.get(key);
    if (!existing) {
      byLine.set(key, { ...item });
      return;
    }
    const mergedQty = Math.max(existing.qty, item.qty);
    byLine.set(key, {
      ...existing,
      qty: Math.min(Math.max(mergedQty, 1), Math.min(item.stockAtAdd, MAX_QTY_PER_LINE)),
      stockAtAdd: Math.max(existing.stockAtAdd, item.stockAtAdd),
    });
  };
  remote.forEach(upsert);
  guest.forEach(upsert);
  return [...byLine.values()];
}

/** Subtotal referencial para DISPLAY (el total autoritativo lo calcula el backend). */
export function subtotalRef(items: CartItem[]): number {
  return Math.round(items.reduce((acc, i) => acc + i.unitPriceUsd * i.qty, 0) * 100) / 100;
}

/** Cuenta total de líneas para el badge del ícono de carrito. */
export function itemCount(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.qty, 0);
}