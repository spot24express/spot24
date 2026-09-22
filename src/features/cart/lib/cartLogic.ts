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
 * Fusión de carritos (invitado + usuario) al iniciar sesión.
 * · Mismo variantId → queda la mayor cantidad (respetando stock).
 * · El resto se une; nunca duplicados.
 */
export function mergeCarts(
  guest: CartItem[],
  remote: CartItem[],
): CartItem[] {
  const byVariant = new Map<string, CartItem>();
  const upsert = (item: CartItem) => {
    const existing = byVariant.get(item.variantId);
    if (!existing) {
      byVariant.set(item.variantId, { ...item });
      return;
    }
    const mergedQty = Math.max(existing.qty, item.qty);
    byVariant.set(item.variantId, {
      ...existing,
      qty: Math.min(Math.max(mergedQty, 1), Math.min(item.stockAtAdd, MAX_QTY_PER_LINE)),
      stockAtAdd: Math.max(existing.stockAtAdd, item.stockAtAdd),
    });
  };
  remote.forEach(upsert);
  guest.forEach(upsert);
  return [...byVariant.values()];
}

/** Peso total aproximado del pedido (para cotización de envío en UI). */
export function totalWeight(items: CartItem[]): number {
  return Math.round(items.reduce((acc, i) => acc + i.weightKg * i.qty, 0) * 100) / 100;
}

/** Subtotal referencial para DISPLAY (el total autoritativo lo calcula el backend). */
export function subtotalRef(items: CartItem[]): number {
  return Math.round(items.reduce((acc, i) => acc + i.unitPriceUsd * i.qty, 0) * 100) / 100;
}

/** Cuenta total de líneas para el badge del ícono de carrito. */
export function itemCount(items: CartItem[]): number {
  return items.reduce((acc, i) => acc + i.qty, 0);
}
