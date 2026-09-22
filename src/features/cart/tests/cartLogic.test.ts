import { describe, it, expect } from 'vitest';
import { validateAdd, clampSetQty, mergeCarts, totalWeight, subtotalRef, itemCount } from '../lib/cartLogic';
import type { CartItem } from '../types';

const item = (variantId: string, qty: number, stockAtAdd = 10, unitPriceUsd = 5, weightKg = 1): CartItem => ({
  productId: 'p1',
  variantId,
  slug: 'p1',
  name: 'Producto',
  variantName: 'Variante',
  sku: 'SKU-1',
  unitPriceUsd,
  qty,
  image: '/img/products/lubricantes.svg',
  categoryId: 'lubricantes',
  weightKg,
  stockAtAdd,
});

describe('validación de stock al agregar', () => {
  it('rechaza sin stock', () => {
    expect(validateAdd(0, 0, 1).ok).toBe(false);
    expect(validateAdd(0, 0, 1).reason).toBe('sin-stock');
  });

  it('rechaza exceder stock disponible', () => {
    expect(validateAdd(5, 0, 6).ok).toBe(false);
    expect(validateAdd(5, 4, 2).ok).toBe(false);
  });

  it('acepta dentro del stock', () => {
    expect(validateAdd(5, 0, 5).ok).toBe(true);
    expect(validateAdd(10, 2, 3).ok).toBe(true);
  });

  it('respeta el tope de 20 unidades por línea', () => {
    // Quedan 2 unidades antes del tope: pedir 5 excede lo disponible.
    expect(validateAdd(100, 18, 5).ok).toBe(false);
    expect(validateAdd(100, 18, 5).reason).toBe('sin-stock');
    // Con la línea llena, cualquier agregado es tope-cantidad.
    expect(validateAdd(100, 20, 1).ok).toBe(false);
    expect(validateAdd(100, 20, 1).reason).toBe('tope-cantidad');
    expect(validateAdd(100, 15, 5).ok).toBe(true);
  });
});

describe('acotado de cantidad manual', () => {
  it('clamp entre 1 y min(stock, 20)', () => {
    expect(clampSetQty(0, 10)).toBe(1);
    expect(clampSetQty(50, 10)).toBe(10);
    expect(clampSetQty(50, 100)).toBe(20);
    expect(clampSetQty(7, 100)).toBe(7);
    expect(clampSetQty(Number.NaN, 5)).toBe(1);
  });
});

describe('fusión de carritos al iniciar sesión', () => {
  it('sin duplicados por variante y conserva la mayor cantidad', () => {
    const guest = [item('v1', 3, 10)];
    const remote = [item('v1', 5, 10), item('v2', 1, 10)];
    const merged = mergeCarts(guest, remote);
    expect(merged).toHaveLength(2);
    expect(merged.find((i) => i.variantId === 'v1')?.qty).toBe(5);
    expect(merged.find((i) => i.variantId === 'v2')?.qty).toBe(1);
  });

  it('respeta stockAtAdd en la fusión', () => {
    const guest = [item('v1', 4, 4)];
    const remote = [item('v1', 2, 10)];
    const merged = mergeCarts(guest, remote);
    expect(merged[0]?.qty).toBe(4);
  });

  it('carritos vacíos no rompen', () => {
    expect(mergeCarts([], [])).toEqual([]);
    expect(mergeCarts([item('v1', 1)], [])).toHaveLength(1);
  });
});

describe('totales referenciales', () => {
  it('subtotal, peso y conteo', () => {
    const items = [item('v1', 2, 10, 12.5, 2), item('v2', 1, 10, 3.25, 0.5)];
    expect(subtotalRef(items)).toBe(28.25);
    expect(totalWeight(items)).toBe(4.5);
    expect(itemCount(items)).toBe(3);
  });
});
