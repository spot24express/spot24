/**
 * Ronda 5.98 (punto G) · Reseñas — libra compartida del front.
 * · Texto saneado como en el backend (sin caracteres de control, tope 400).
 * · ratingAvg/ratingCount SOLO con las visibles: la moderación mueve el
 *   promedio al instante (ocultar una reseña baja la nota).
 * El backend re-implementa la misma regla en functions/src/reviews.ts.
 */
import { describe, expect, it } from 'vitest';
import {
  camposRating, calcularPromedio, contarVisibles, limpiarTextoResena,
} from '../features/catalog/lib/vitrina';
import type { ProductReview } from '../features/catalog/types';

function resena(partial: Partial<ProductReview>): ProductReview {
  return { uid: 'u1', name: 'Carlos', rating: 5, text: 'Excelente', at: 1, visible: true, ...partial };
}

describe('limpiarTextoResena', () => {
  it('recorta a 400 y quita caracteres de control', () => {
    const sucio = `${'a'.repeat(450)}\u0007`;
    const limpio = limpiarTextoResena(sucio);
    expect(limpio).toHaveLength(400);
    expect(limpio.includes('\u0007')).toBe(false);
  });

  it('quita espacios sobrantes', () => {
    expect(limpiarTextoResena('  hola mundo  ')).toBe('hola mundo');
  });
});

describe('rating solo con visibles', () => {
  it('promedia solo las visibles, a 1 decimal', () => {
    const list = [
      resena({ rating: 5 }),
      resena({ uid: 'u2', rating: 4 }),
      resena({ uid: 'u3', rating: 1, visible: false }), // oculta por moderación
    ];
    expect(calcularPromedio(list)).toBe(4.5);
    expect(contarVisibles(list)).toBe(2);
    expect(camposRating(list)).toEqual({ ratingAvg: 4.5, ratingCount: 2 });
  });

  it('sin reseñas visibles → promedio 0 (la tarjeta no muestra estrellas)', () => {
    expect(camposRating([resena({ visible: false })])).toEqual({ ratingAvg: 0, ratingCount: 0 });
    expect(camposRating([])).toEqual({ ratingAvg: 0, ratingCount: 0 });
  });

  it('todas visibles de 5 → 5.0 exacto', () => {
    const list = [resena({}), resena({ uid: 'u2' }), resena({ uid: 'u3' })];
    expect(calcularPromedio(list)).toBe(5);
  });
});
