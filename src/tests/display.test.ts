import { describe, it, expect } from 'vitest';
import { cleanProductName } from '@/shared/lib/display';

/**
 * Ronda 5e — limpieza del nombre de producto en la UI (catálogo y carrito).
 * La marca vive en su campo propio; el nombre no debe repetirla, ni siquiera
 * cuando el admin la escribió pegada («POLARCAR» con marca POLAR).
 */
describe('cleanProductName: marca fuera del nombre visible', () => {
  it('quita la marca cuando es el primer token completo', () => {
    expect(cleanProductName('POLAR Caroreña Verano', 'POLAR')).toBe('Caroreña Verano');
    expect(cleanProductName('Polar Caroreña', 'POLAR')).toBe('Caroreña');
  });

  it('quita la marca PEGADA al nombre (caso POLARCAR + marca POLAR)', () => {
    expect(cleanProductName('POLARCAR Caroreña Verano', 'POLAR')).toBe('Caroreña Verano');
    expect(cleanProductName('Polarcar Mayonesa 500g', 'Polar')).toBe('Mayonesa 500g');
  });

  it('funciona igual si la marca en el nombre trae la marca completa del campo', () => {
    expect(cleanProductName('POLARCAR Caroreña Verano', 'POLARCAR')).toBe('Caroreña Verano');
  });

  it('NO toca nombres que no empiezan con la marca', () => {
    expect(cleanProductName('Caroreña Verano', 'POLAR')).toBe('Caroreña Verano');
    expect(cleanProductName('Mayonesa Caroreña 500g', 'POLAR')).toBe('Mayonesa Caroreña 500g');
  });

  it('NO toca tokens que solo comparten letras iniciales lejanas', () => {
    // «ACEITE» no empieza con «ACES» → no se recorta por parecido.
    expect(cleanProductName('Aceite Maíz 1L', 'ACES')).toBe('Aceite Maíz 1L');
  });

  it('un nombre de un solo token jamás se vacía', () => {
    expect(cleanProductName('POLARCAR', 'POLAR')).toBe('POLARCAR');
    expect(cleanProductName('POLAR', 'POLAR')).toBe('POLAR');
  });

  it('sin marca o sin nombre: devuelve el nombre tal cual', () => {
    expect(cleanProductName('Caroreña Verano', '')).toBe('Caroreña Verano');
    expect(cleanProductName('', 'POLAR')).toBe('');
    expect(cleanProductName('  Caroreña Verano  ', 'POLAR')).toBe('Caroreña Verano');
  });
});