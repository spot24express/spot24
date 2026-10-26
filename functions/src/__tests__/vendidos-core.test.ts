/**
 * Ronda 5.98 (punto C) · Suma de unidades entregadas por producto.
 * La libra pura qtyVendidosPorProducto (dispatch.ts) alimenta la transacción
 * que incrementa vendidosTotal al marcar un pedido Entregado. Reglas:
 * · líneas únicas por productId (2 variantes del mismo producto suman ambas)
 * · qty saneada: entero, solo > 0, tope defensivo 1000 por línea
 * · ignora líneas rotas (sin productId o qty basura) sin romper la entrega
 */
import { describe, expect, it } from 'vitest';
import { qtyVendidosPorProducto } from '../domain/vendidos';

describe('qtyVendidosPorProducto', () => {
  it('suma por producto: variantes distintas del mismo producto se acumulan', () => {
    const lines = [
      { productId: 'p1', qty: 2 },
      { productId: 'p2', qty: 1 },
      { productId: 'p1', qty: 3 },
    ];
    const out = qtyVendidosPorProducto(lines);
    expect(out.get('p1')).toBe(5);
    expect(out.get('p2')).toBe(1);
    expect(out.size).toBe(2);
  });

  it('ignora líneas rotas o con cantidades inválidas', () => {
    const out = qtyVendidosPorProducto([
      { productId: '', qty: 2 },
      { qty: 2 },
      { productId: 'p1', qty: 0 },
      { productId: 'p1', qty: -3 },
      { productId: 'p2', qty: Number.NaN },
      { productId: 'p3', qty: 2.9 },
    ]);
    expect(out.get('p1')).toBeUndefined();
    expect(out.get('p2')).toBeUndefined();
    expect(out.get('p3')).toBe(2); // 2.9 → floor 2
  });

  it('tope defensivo de 1000 por línea', () => {
    const out = qtyVendidosPorProducto([{ productId: 'p1', qty: 99999 }]);
    expect(out.get('p1')).toBe(1000);
  });

  it('payload roto (no array) → mapa vacío, la entrega sigue', () => {
    expect(qtyVendidosPorProducto(null).size).toBe(0);
    expect(qtyVendidosPorProducto(undefined).size).toBe(0);
    expect(qtyVendidosPorProducto('x').size).toBe(0);
  });
});
