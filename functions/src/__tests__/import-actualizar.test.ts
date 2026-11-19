/**
 * Tests del MODO «ACTUALIZAR» (5.151/5.152, a pedido del dueño).
 * ─────────────────────────────────────────────────────────────
 * El upsert literal del dueño con el Excel del ERP («si el codigo existe
 * actualizar tanto el precio como el stock y si no existe crear el producto
 * con el precio y la existencia, sin categoria e inactivo para completar
 * luego y ponerlo activo donde corresponde»), las Reglas 1-5 del plan y los
 * roles («solo los roles cajero, gerente y admin podran actualizar»).
 * Lógica PURA (planActualizar / datosProductoNuevoActualizar /
 * puedeImportarInventario / modoDe) sin Firestore.
 */
import { describe, expect, it } from 'vitest';
import type { FilaInventario } from '../lib/inventarioPdf';
import {
  datosProductoNuevoActualizar,
  modoDe,
  MAX_FILAS_ACTUALIZAR,
  puedeImportarInventario,
  planActualizar,
} from '../importInventory';

const fila = (codigo: string, existencia: number, precioConImp: number | undefined, descripcion = `PRODUCTO ${codigo}`): FilaInventario => ({
  codigo,
  descripcion,
  existencia,
  costo: precioConImp ?? 0,
  precioConImp,
});

const existentesDe = (filas: Array<[string, number, number]>) => new Map(
  filas.map(([codigo, precioActual, stockActual]) => [codigo, {
    pid: `p-${codigo}`,
    nombre: `PRODUCTO ${codigo}`,
    precioActual,
    stockActual,
    vid: `p-${codigo}-v1`,
  }]),
);

describe('modoDe (5.152 · modo «actualizar» en el body)', () => {
  it('acepta actualizar', () => {
    expect(modoDe({ modo: 'actualizar' })).toBe('actualizar');
  });
  it('los modos viejos siguen igual', () => {
    expect(modoDe({ modo: 'stock' })).toBe('stock');
    expect(modoDe({ modo: 'precios' })).toBe('precios');
    expect(modoDe({ modo: 'completo' })).toBe('completo');
  });
  it('un modo raro cae en completo (comportamiento de siempre)', () => {
    expect(modoDe({ modo: 'xyz' })).toBe('completo');
    expect(modoDe(undefined)).toBe('completo');
  });
});

describe('puedeImportarInventario (5.152 · roles por modo, decisión del dueño)', () => {
  it('actualizar: cajero, gerente y admin SÍ pueden', () => {
    expect(puedeImportarInventario('actualizar', 'cajero')).toBe(true);
    expect(puedeImportarInventario('actualizar', 'gerente')).toBe(true);
    expect(puedeImportarInventario('actualizar', 'admin')).toBe(true);
  });
  it('actualizar: delivery NO puede', () => {
    expect(puedeImportarInventario('actualizar', 'delivery')).toBe(false);
  });
  it('los otros modos quedan admin/gerente (cajero fuera)', () => {
    for (const modo of ['completo', 'stock', 'precios'] as const) {
      expect(puedeImportarInventario(modo, 'admin')).toBe(true);
      expect(puedeImportarInventario(modo, 'gerente')).toBe(true);
      expect(puedeImportarInventario(modo, 'cajero')).toBe(false);
      expect(puedeImportarInventario(modo, 'delivery')).toBe(false);
    }
  });
  it('sin rol no pasa nada', () => {
    expect(puedeImportarInventario('actualizar', undefined)).toBe(false);
    expect(puedeImportarInventario('actualizar', 'customer')).toBe(false);
  });
  it('el tope del modo da margen para el crecimiento del catálogo', () => {
    expect(MAX_FILAS_ACTUALIZAR).toBeGreaterThanOrEqual(5000);
  });
});

describe('planActualizar (las Reglas 1-4 del pedido del dueño)', () => {
  const filas = [
    fila('AMBOS', 12, 125.81),   // Regla 1: precio y stock cambian juntos
    fila('SOLOP', 5, 110),       // cambia solo el precio (stock igual)
    fila('SOLOS', 9, 15),        // cambia solo el stock (precio igual)
    fila('IGUAL', 5, 125.81),    // Regla 4: nada cambia → 0 escrituras
    fila('NUEVO', 3, 45.5),      // Regla 2: alta con precio y existencia
    fila('CEGADO', 7, 0),        // Regla 3: precio 0 → no se toca el precio…
    fila('DECIMAL', 12.9, 7.999),// stock entero (12.9→12) y precio redondeado (8)
    fila('NUEVOCIEGO', 2, 0),    // alta con precio 0: nace igual, señalado
  ];
  const existentes = existentesDe([
    ['AMBOS', 100, 6],
    ['SOLOP', 99.99, 5],
    ['SOLOS', 15, 4],
    ['IGUAL', 125.81, 5],
    ['CEGADO', 20, 8],
    ['DECIMAL', 7.99, 13],
  ]);
  const plan = planActualizar(filas, existentes);

  it('Regla 1 · existe → precio y stock se actualizan juntos', () => {
    expect(plan.cambiosPrecio.find((c) => c.codigo === 'AMBOS')).toMatchObject({
      antes: 100, despues: 125.81, pid: 'p-AMBOS', vid: 'p-AMBOS-v1',
    });
    expect(plan.cambiosStock.find((c) => c.codigo === 'AMBOS')).toMatchObject({
      antes: 6, despues: 12,
    });
  });
  it('Regla 1 · solo lo que cambia de verdad entra al plan', () => {
    expect(plan.cambiosPrecio.map((c) => c.codigo)).toEqual(['AMBOS', 'SOLOP', 'DECIMAL']);
    expect(plan.cambiosStock.map((c) => c.codigo)).toEqual(['AMBOS', 'SOLOS', 'CEGADO', 'DECIMAL']);
  });
  it('Regla 2 · no existe → alta (se creará con precio y existencia)', () => {
    expect(plan.altas.map((f) => f.codigo)).toEqual(['NUEVO', 'NUEVOCIEGO']);
    expect(plan.altas[0]).toMatchObject({ existencia: 3, precioConImp: 45.5 });
  });
  it('Regla 3 · precio 0 de un EXISTENTE: no se toca el precio, el stock SÍ', () => {
    expect(plan.sinPrecio).toEqual(['CEGADO']);
    // y su stock igual está en el plan (la existencia es real: 8 → 7):
    expect(plan.cambiosStock.find((c) => c.codigo === 'CEGADO')).toMatchObject({ antes: 8, despues: 7 });
  });
  it('Regla 4 · lo idéntico genera CERO escrituras', () => {
    expect(plan.sinCambio).toEqual(['IGUAL']);
  });
  it('el stock se TRUNCA sin decimales y el precio se redondea a 2', () => {
    expect(plan.cambiosStock.find((c) => c.codigo === 'DECIMAL')?.despues).toBe(12);
    expect(plan.cambiosPrecio.find((c) => c.codigo === 'DECIMAL')?.despues).toBe(8);
  });
  it('el precio idéntico CON decimales no dispara escritura (5.141)', () => {
    // SOLOP tiene stock igual al archivo → sin cambio total no lo incluye;
    // IGUAL con precio 125.81 = actual 125.81 → solo aparece en sinCambio.
    expect(plan.cambiosPrecio.find((c) => c.codigo === 'IGUAL')).toBeUndefined();
  });
});

describe('datosProductoNuevoActualizar (Regla 2 · borrador inactivo CON precio y existencia)', () => {
  const ahora = 1769600000123;
  const { producto, variante } = datosProductoNuevoActualizar(
    fila('NUEVO', 12.9, 125.81, 'BATERIA DUNCAN 850 D22'),
    ahora,
    'bateria-duncan-850-d22',
  );

  it('nace INACTIVO y SIN categoría (el dueño lo activa donde corresponde)', () => {
    expect(producto['active']).toBe(false);
    expect(producto['categoryId']).toBe('');
  });
  it('CON el precio del archivo (con decimales) y CON la existencia', () => {
    expect(producto['basePriceUsd']).toBe(125.81);
    expect(variante['priceUsd']).toBe(125.81);
    expect(producto['stockTotal']).toBe(12);
    expect(variante['stock']).toBe(12);
  });
  it('el resto de la ficha queda listo para completar desde el panel', () => {
    expect(producto['code']).toBe('NUEVO');
    expect(producto['name']).toBe('BATERIA DUNCAN 850 D22');
    expect(producto['slug']).toBe('bateria-duncan-850-d22');
    expect(producto['variantCount']).toBe(1);
    expect(variante['sku']).toBe('NUEVO');
    expect(producto['createdAt']).toBe(ahora);
  });
  it('con precio ilegible/0 nace igual (inactivo, precio 0: jamás sale gratis a la venta)', () => {
    const ciego = datosProductoNuevoActualizar(fila('CIEGO', 2, undefined), ahora, 'ciego');
    expect(ciego.producto['basePriceUsd']).toBe(0);
    expect(ciego.variante['priceUsd']).toBe(0);
    expect(ciego.producto['active']).toBe(false);
  });
});
