/**
 * Tests de unirConPuntos (5.112-A): el helper que arma la línea secundaria
 * con «Cód. X · marca · precio» en verificación de pagos y «marca · Cód. X»
 * en despacho. Garantías clave:
 * · descarta partes vacías (false/null/undefined/'') sin dejar separadores;
 * · con una sola parte no hay « · » colgante;
 * · el formato del personal sale código primero (no se recorta en pantallas
 *   angostas) y en despacho marca primero.
 * Recordatorio de la decisión del dueño: el código SOLO se muestra al
 * personal — el cliente jamás lo ve.
 */
import { describe, expect, it } from 'vitest';
import { unirConPuntos } from '@/shared/lib/lineaMeta';

describe('unirConPuntos', () => {
  it('une partes con « · »', () => {
    expect(unirConPuntos('a', 'b', 'c')).toBe('a · b · c');
  });

  it('descarta false (parte condicional, p.ej. orden sin code)', () => {
    expect(unirConPuntos(false, 'POLAR')).toBe('POLAR');
  });

  it('descarta null y undefined', () => {
    expect(unirConPuntos(null, undefined, 'X')).toBe('X');
  });

  it('descarta cadenas vacías y de solo espacios', () => {
    expect(unirConPuntos('', '   ', 'Y')).toBe('Y');
  });

  it('con una sola parte no deja separador colgante', () => {
    expect(unirConPuntos('SOLO')).toBe('SOLO');
  });

  it('si todo viene vacío devuelve cadena vacía (nada que mostrar)', () => {
    expect(unirConPuntos('', false, null, undefined)).toBe('');
  });

  it('formato verificación de pagos: código primero, luego marca y precio', () => {
    expect(unirConPuntos('Cód. 55', 'POLAR', 'Bs. 45,00 c/u')).toBe(
      'Cód. 55 · POLAR · Bs. 45,00 c/u',
    );
  });

  it('formato despacho: marca primero y código después (si existe)', () => {
    expect(unirConPuntos('POLAR', 'Cód. 55')).toBe('POLAR · Cód. 55');
  });
});
