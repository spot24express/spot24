/**
 * SPOT 24 · Tests del MODO STOCK + MODO ENSAYO (5.137, a pedido del dueño).
 * ──────────────────────────────────────────────────────────────────────
 * modo 'stock': SOLO existencias — a los existentes se les actualiza el
 * stock (entero de «Existencia», sin decimales) y NADA más; a los que no
 * están en la tienda se los crea INACTIVOS, SIN categoría y SIN precio.
 * ensayo: true → dry-run completo sin escribir NADA en Firestore.
 *
 * Lógica PURA (planStock / datosProductoNuevoStock) sin Firestore; los cores
 * con Firestore van con emulador (patrón de la suite).
 */
import { describe, expect, it } from 'vitest';
import type { FilaInventario } from '../lib/inventarioPdf';
import { planStock, datosProductoNuevoStock } from '../importInventory';

const fila = (codigo: string, existencia: number, descripcion = `PRODUCTO ${codigo}`): FilaInventario => ({
  codigo,
  descripcion,
  existencia,
  costo: 0,
});

describe('planStock (5.137 · clasificación pura del modo stock)', () => {
  const existentes = new Map([
    ['A1', { pid: 'p1', nombre: 'PRODUCTO A1', stockActual: 5, vid: 'p1-v1' }],
    ['A2', { pid: 'p2', nombre: 'PRODUCTO A2', stockActual: 12, vid: 'p2-v1' }],
  ]);

  const plan = planStock(
    [
      fila('A1', 12.9),   // cambia: 5 → 12 (12.9 truncado, sin decimales)
      fila('A2', 12),     // igual: sin cambio (no genera escritura)
      fila('NUEVO1', 3),  // no está en la tienda → alta inactiva
      fila('NUEVO2', 0),  // alta con stock 0 (se crea igual, pedido del dueño)
    ],
    existentes,
  );

  it('el cambio de stock lleva antes → después y SOLO toca la variante objetivo', () => {
    expect(plan.cambios).toHaveLength(1);
    expect(plan.cambios[0]).toMatchObject({
      codigo: 'A1', antes: 5, despues: 12, pid: 'p1', vid: 'p1-v1',
    });
  });

  it('el stock se TRUNCA sin decimales: 12.9 → 12 (no 13)', () => {
    expect(plan.cambios[0]!.despues).toBe(12);
  });

  it('el stock idéntico no genera escritura', () => {
    expect(plan.cambios.find((c) => c.codigo === 'A2')).toBeUndefined();
  });

  it('los códigos que no están en la tienda son las ALTAS (se crearían)', () => {
    expect(plan.altas.map((f) => f.codigo)).toEqual(['NUEVO1', 'NUEVO2']);
  });
});

describe('datosProductoNuevoStock (5.137 · alta INACTIVA, sin categoría, sin precio)', () => {
  const ahora = 1729600000123;
  const { producto, variante } = datosProductoNuevoStock(fila('NUEVO1', 12.9, 'BUJIA NGK CON RESISTECIA CORSA/AVEO'), ahora, 'bujia-ngk-con-resistecia-corsa-aveo');

  it('el producto nace INACTIVO (jamás sale a la venta a medio importar)', () => {
    expect(producto['active']).toBe(false);
  });

  it('SIN categoría y SIN precio (el dueño los pone desde el panel)', () => {
    expect(producto['categoryId']).toBe('');
    expect(producto['basePriceUsd']).toBe(0);
    expect(variante['priceUsd']).toBe(0);
  });

  it('el stock va entero (12.9 → 12) y los datos básicos quedan listos para editar', () => {
    expect(producto['stockTotal']).toBe(12);
    expect(producto['name']).toBe('BUJIA NGK CON RESISTECIA CORSA/AVEO');
    expect(producto['code']).toBe('NUEVO1');
    expect(producto['slug']).toBe('bujia-ngk-con-resistecia-corsa-aveo');
    expect(producto['variantCount']).toBe(1);
    expect(producto['createdAt']).toBe(ahora);
    expect(variante['sku']).toBe('NUEVO1');
    expect(variante['stock']).toBe(12);
    expect(variante['name']).toBe('Estándar');
  });
});
