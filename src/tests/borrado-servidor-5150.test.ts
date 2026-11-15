/**
 * 5.150 · GUARDIÁN DEL BORRADO DE PRODUCTOS POR SERVIDOR (prueba estática).
 *
 * El bug del 15/11: el dueño intenta borrar un producto desde el panel y ve
 * «Algo salió fuera de línea…». Causa raíz (doble):
 *  · La 5.124 construyó el core Admin SDK `fn-deleteProduct` (rol verificado,
 *    blindaje de reservas activas, idempotente, auditoría) PERO el panel
 *    siguió llamando al borrado CLIENTE (`writeBatch` sobre products/variants).
 *  · Las reglas lo niegan SIEMPRE: `request.resource.data` no existe en un
 *    DELETE → la variante cae → el lote entero aborta con permission-denied →
 *    el panel muestra el genérico «Algo salió fuera de línea».
 * La cura: `adminDeleteProduct` llama a la función de servidor. Este guardián
 * NO necesita Firebase ni red: lee el código fuente y garantiza que
 *  1. el panel va por fn-deleteProduct (y el writeBatch cliente NO vuelve),
 *  2. la función existe en Netlify y despacha el core correcto,
 *  3. el core conserva su rol (admin/gerente) y su blindaje de reservas,
 *  4. netlify.toml le da su margen de 26 s (sin él muere con el tope de
 *     fábrica de 10 s con la red degradada — mismo motivo de fn-deleteUser).
 * Si un paste futuro revierte cualquiera de las 4, este test se rompe y dice
 * qué archivo reponer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function leer(rel: string): string {
  try {
    return readFileSync(join(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
  } catch {
    throw new Error(`No pude leer ${rel}. Ejecuta npm test desde la RAÍZ del repo.`);
  }
}

/** Texto de la función `adminDeleteProduct` (desde su export hasta el siguiente). */
function funcionAdminDeleteProduct(): string {
  const src = leer('src/features/admin/services/admin.service.ts');
  const ini = src.indexOf('export async function adminDeleteProduct');
  expect(ini).toBeGreaterThan(-1);
  const fin = src.indexOf('/* ── Pedidos', ini);
  return src.slice(ini, fin > ini ? fin : undefined);
}

describe('guardián 5.150 · el panel borra por SERVIDOR (fn-deleteProduct)', () => {
  it('adminDeleteProduct llama a la función de servidor', () => {
    expect(funcionAdminDeleteProduct()).toContain(
      "callFunction('fn-deleteProduct', { productId })",
    );
  });

  it('el borrado CLIENTE no vuelve (ni writeBatch ni batch en la función)', () => {
    const cuerpo = funcionAdminDeleteProduct();
    expect(cuerpo).not.toContain('writeBatch');
    expect(cuerpo).not.toContain('batch.commit');
    expect(cuerpo).not.toContain("collection(fb.db, 'products', productId, 'variants')");
  });
});

describe('guardián 5.150 · la función de servidor existe y está completa', () => {
  it('adaptador Netlify presente y despacha el core', () => {
    const src = leer('netlify/functions/fn-deleteProduct.ts');
    expect(src).toContain('coreDeleteProduct');
    expect(src).toContain('handle');
  });

  it('el core verifica rol admin/gerente EN EL SERVIDOR', () => {
    const src = leer('functions/src/productDelete.ts');
    expect(src).toContain("role !== 'admin' && role !== 'gerente'");
  });

  it('el core conserva el blindaje de reservas activas (checkout en vuelo)', () => {
    const src = leer('functions/src/productDelete.ts');
    expect(src).toContain('reservaContieneProducto');
    expect(src).toContain("collection('reservations')");
  });

  it('netlify.toml le da 26 s (el tope de fábrica de 10 s la mataba)', () => {
    const toml = leer('netlify.toml');
    const ini = toml.indexOf('[functions."fn-deleteProduct"]');
    expect(ini).toBeGreaterThan(-1);
    const rama = toml.slice(ini, ini + 60);
    expect(rama).toContain('timeout = 26');
  });
});
