/**
 * Tests de la ronda 5.155 (pedido del dueño, dos piezas):
 *  1. «11 Actualizar inventario» quedó en el lugar correcto: las cápsulas del
 *     panel se leen en ORDEN NUMÉRICO 01→11 (el dueño la vio metida entre
 *     02 Despacho y 03 Productos desde la ronda 5.153).
 *  2. La tasa vigente la ven admin, gerente Y cajero (VER_TASA) y el formato
 *     que muestra la tarjeta compacta es el esperado: «916,65» y
 *     «Miércoles, 18 de noviembre de 2026».
 * Lógica pura sin DOM ni Firestore: los datos viven en features/admin/nav.ts
 * y los formateadores en shared/lib/format.ts.
 */
import { describe, expect, it } from 'vitest';
import { NAV, VER_TASA } from '@/features/admin/nav';
import { rateText, fmtFechaValor } from '@/shared/lib/format';

describe('NAV del panel (5.155 · orden numérico 01→11)', () => {
  it('los códigos de las cápsulas quedan en orden ascendente', () => {
    const codes = NAV.map((n) => n.code);
    expect(codes).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
  });

  it('«Actualizar inventario» (11) es la ÚLTIMA cápsula, después de 10 Copias', () => {
    expect(NAV.length).toBe(11);
    const ultima = NAV[NAV.length - 1]!;
    expect(ultima.code).toBe('11');
    expect(ultima.label).toBe('Actualizar inventario');
    expect(ultima.to).toBe('/admin/inventario');
    const penultima = NAV[NAV.length - 2]!;
    expect(penultima.code).toBe('10');
    expect(penultima.label).toBe('Copias');
  });

  it('el orden por número coincide con el orden de render (mismo array)', () => {
    // El layout filtra NAV pero NO lo reordena: si el array está en orden,
    // el panel se pinta en orden para TODOS los roles.
    const orden = (rol: string) =>
      NAV.filter((n) => n.roles.includes(rol)).map((n) => n.code);
    expect(orden('admin')).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    expect(orden('gerente')).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '11']);
    expect(orden('cajero')).toEqual(['01', '02', '11']);
    expect(orden('delivery')).toEqual(['02']);
  });

  it('los roles de Actualizar inventario no cambian (decisión 5.153)', () => {
    const inventario = NAV.find((n) => n.to === '/admin/inventario');
    expect(inventario?.roles).toEqual(['admin', 'gerente', 'cajero']);
  });
});

describe('VER_TASA (5.155 · la tasa vigente la ven los tres roles)', () => {
  it('exactamente admin, gerente y cajero (delivery queda fuera)', () => {
    expect(VER_TASA).toEqual(['admin', 'gerente', 'cajero']);
  });
  it('cada rol de VER_TASA puede entrar a alguna sección del panel', () => {
    for (const rol of VER_TASA) {
      expect(NAV.some((n) => n.roles.includes(rol))).toBe(true);
    }
  });
});

describe('rateText (la cifra de la tarjeta compacta, estilo es-VE)', () => {
  it('la tasa del ejemplo del dueño: 916,65', () => {
    expect(rateText(916.65)).toBe('916,65');
  });
  it('la tasa histórica de la tarjeta grande: 36,58', () => {
    expect(rateText(36.58)).toBe('36,58');
  });
  it('lo no válido muestra «—», nunca NaN ni 0', () => {
    expect(rateText(0)).toBe('—');
    expect(rateText(-5)).toBe('—');
    expect(rateText(NaN)).toBe('—');
  });
});

describe('fmtFechaValor (la fecha valor que acompaña a la tasa)', () => {
  it('la fecha del ejemplo del dueño en texto largo es-VE', () => {
    expect(fmtFechaValor('2026-11-18')).toBe('Miércoles, 18 de noviembre de 2026');
  });
  it('capitaliza la primera letra (martes → Martes)', () => {
    expect(fmtFechaValor('2026-09-29')).toBe('Martes, 29 de septiembre de 2026');
  });
  it('lo desconocido muestra «—», nunca «Invalid Date»', () => {
    expect(fmtFechaValor('')).toBe('—');
    expect(fmtFechaValor('2026-11-18T10:00:00Z')).toBe('—');
    expect(fmtFechaValor('no-es-fecha')).toBe('—');
  });
});
