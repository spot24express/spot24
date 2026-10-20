/**
 * SPOT 24 · Tests de los helpers de copiado del pago móvil (ronda 5.75).
 * · rifToDigits: el RIF se copia SOLO con números (sin J-, sin guiones).
 * · cleanAmountBs: el monto se pega en la app del banco como 1234,56.
 */
import { describe, expect, it } from 'vitest';
import { rifToDigits, cleanAmountBs } from '../shared/lib/format';

describe('rifToDigits', () => {
  it('quita letras, guiones y espacios del RIF', () => {
    expect(rifToDigits('J-12345678-9')).toBe('123456789');
    expect(rifToDigits('J123456789')).toBe('123456789');
    expect(rifToDigits('j-12345678-9')).toBe('123456789');
    expect(rifToDigits('V-12345678-5')).toBe('123456785');
  });

  it('deja intacto un valor sin formato', () => {
    expect(rifToDigits('123456789')).toBe('123456789');
  });

  it('no inventa dígitos si el RIF viene vacío', () => {
    expect(rifToDigits('')).toBe('');
  });
});

describe('cleanAmountBs', () => {
  it('número limpio con coma decimal, sin Bs ni separador de miles', () => {
    expect(cleanAmountBs(1234.56)).toBe('1234,56');
    expect(cleanAmountBs(85.5)).toBe('85,50');
    expect(cleanAmountBs(0)).toBe('0,00');
    expect(cleanAmountBs(123456.789)).toBe('123456,79');
  });

  it('defensa: valor no finito → 0,00', () => {
    expect(cleanAmountBs(Number.NaN)).toBe('0,00');
    expect(cleanAmountBs(Number.POSITIVE_INFINITY)).toBe('0,00');
  });
});
