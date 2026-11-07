/**
 * SPOT 24 · Ronda 5.124 · Pruebas del borrado de productos (fn-deleteProduct).
 * Piezas PURAS del core (sin emulador): saneamiento del id que llega del
 * panel y detección de reservas activas que blindan el borrado.
 */
import { describe, expect, it } from 'vitest';
import { reservaContieneProducto, sanearProductId } from '../productDelete';

describe('sanearProductId: id que llega del panel', () => {
  it('acepta ids normales y recorta espacios al borde', () => {
    expect(sanearProductId('abc-123')).toBe('abc-123');
    expect(sanearProductId('  MOOG-1234  ')).toBe('MOOG-1234');
  });

  it('rechaza rutas (con «/»), «.» y «..» (document reference inválido)', () => {
    expect(sanearProductId('products/abc')).toBe('');
    expect(sanearProductId('.')).toBe('');
    expect(sanearProductId('..')).toBe('');
  });

  it('rechaza ids que empiezan por «__», vacío o no-string', () => {
    expect(sanearProductId('__oculto')).toBe('');
    expect(sanearProductId('')).toBe('');
    expect(sanearProductId('   ')).toBe('');
    expect(sanearProductId(undefined)).toBe('');
    expect(sanearProductId(null)).toBe('');
    expect(sanearProductId(123)).toBe('');
  });

  it('recorta ids absurdamente largos y luego valida', () => {
    const largo = 'p'.repeat(2000);
    expect(sanearProductId(largo)).toBe('p'.repeat(120));
  });
});

describe('reservaContieneProducto: blindaje antes de borrar', () => {
  const item = (productId: string) => ({ productId, variantId: 'v1', qty: 1 });

  it('detecta el producto en una reserva activa', () => {
    const reservas = [[item('p1'), item('p2')]];
    expect(reservaContieneProducto(reservas, 'p2')).toBe(true);
  });

  it('no se confunde con otro producto', () => {
    const reservas = [[item('p1')], [item('p9')]];
    expect(reservaContieneProducto(reservas, 'p2')).toBe(false);
  });

  it('tolera reservas sin items o ítems raros (nunca explota)', () => {
    expect(reservaContieneProducto([[], undefined as unknown as Array<Record<string, unknown>>], 'p1')).toBe(false);
    expect(
      reservaContieneProducto([[null as unknown as Record<string, unknown>, {}]], 'p1'),
    ).toBe(false);
  });
});
