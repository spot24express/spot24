/**
 * 5.116 · GUARDIÁN DE LA RED DE SEGURIDAD — FOTOS DEL PANEL (v2).
 * Reemplaza al respaldo-imagenes-5115b.test.ts anterior (mismo nombre:
 * reemplázalo completo y no dupliques).
 *
 * HALLAZGO 5.116 (con evidencia): las fotos del panel (productos, promos,
 * categorías y el QR de pago de Ajustes) salen por la puerta del cliente
 * imageUpload.service.ts → /.netlify/functions/fn-uploadImage → el archivo
 * netlify/functions/fn-uploadImage.ts, que trae su propia subida a imgbb
 * desde la ronda 3. El core functions/src/images.ts es el núcleo interno
 * heredado (hoy sin conectar), pero se blinda igual por si vuelve a
 * conectarse. Este guardián vigila AMBOS archivos:
 *
 *  · netlify/functions/fn-uploadImage.ts (la ruta viva):
 *      importa el respaldo, imgbb PRIMERO, respaldo SOLO en el catch, el
 *      error original de imgbb se relanza (mismo mensaje en el panel), la
 *      validación de rol queda ANTES del try, el tope de 15 s de imgbb y
 *      sus mensajes quedan intactos.
 *  · functions/src/images.ts (core interno, defensa extra): mismos cortes.
 *
 * El contrato { url, deleteUrl } no cambia (con respaldo deleteUrl va
 * vacío: el panel nunca lo usó — verificado en imageUpload.service.ts).
 *
 * NO necesita Firebase ni red: si un paste futuro borra la cadena, este
 * test se rompe y te dice qué reponer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function leer(rel: string): string {
  try {
    return readFileSync(join(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
  } catch {
    throw new Error(
      `No pude leer ${rel}. Ejecuta npm test desde la RAÍZ del repo (C:/Users/Erick/spot24).`,
    );
  }
}

const IMAGES = 'functions/src/images.ts';
const FN = 'netlify/functions/fn-uploadImage.ts';

describe('guardián 5.116 · RUTA VIVA netlify/functions/fn-uploadImage.ts', () => {
  it('fn-uploadImage importa el respaldo (misma lib de la 5.115)', () => {
    const src = leer(FN);
    expect(src).toContain(
      "import { subirComprobanteRespaldo } from '../../functions/src/lib/imagen-respaldo';",
    );
  });

  it('imgbb sigue PRIMERO y el respaldo entra SOLO en el catch', () => {
    const src = leer(FN);
    const ini = src.indexOf('try {');
    expect(ini).toBeGreaterThan(-1);
    const bloque = src.slice(ini, ini + 800);
    expect(bloque).toContain('return await subirAImgbb(key, image);');
    expect(bloque).toContain('catch (eImgbb)');
    expect(bloque).toContain('subirComprobanteRespaldo(image)');
    expect(bloque).toContain("if (urlRespaldo) return { url: urlRespaldo, deleteUrl: '' };");
    expect(bloque).toContain('throw eImgbb;');
  });

  it('la validación (rol, imagen, clave) queda ANTES del try y el tope de 15 s de imgbb queda intacto', () => {
    const src = leer(FN);
    const validacion = src.indexOf("role !== 'admin'");
    const intento = src.indexOf('try {');
    expect(validacion).toBeGreaterThan(-1);
    expect(intento).toBeGreaterThan(validacion);
    expect(src).toContain('AbortSignal.timeout(15_000)');
  });

  it('el contrato de respuesta { url, deleteUrl } no cambia', () => {
    const src = leer(FN);
    expect(src).toContain('Promise<{ url: string; deleteUrl: string }>');
    expect(src).toContain("deleteUrl: ''");
  });

  it('la subida original a imgbb quedó intacta dentro del ayudante subirAImgbb', () => {
    const src = leer(FN);
    expect(src).toContain('async function subirAImgbb(');
    expect(src).toContain('IMGBB_ENDPOINT');
    expect(src).toContain('No pudimos contactar a imgbb. Reintenta en unos segundos.');
    expect(src).toContain('imgbb rechazó la subida (HTTP ');
  });
});

describe('guardián 5.115-B · core interno functions/src/images.ts (defensa extra)', () => {
  it('images.ts importa el respaldo', () => {
    const src = leer(IMAGES);
    expect(src).toContain(
      "import { subirComprobanteRespaldo } from './lib/imagen-respaldo';",
    );
  });

  it('imgbb sigue PRIMERO y el respaldo entra SOLO en el catch', () => {
    const src = leer(IMAGES);
    const ini = src.indexOf('try {');
    expect(ini).toBeGreaterThan(-1);
    const bloque = src.slice(ini, ini + 700);
    expect(bloque).toContain('imgbbConReintentos(key, image)');
    expect(bloque).toContain('catch (eImgbb)');
    expect(bloque).toContain('subirComprobanteRespaldo(image)');
    expect(bloque).toContain("if (urlRespaldo) return { url: urlRespaldo, deleteUrl: '' };");
    expect(bloque).toContain('throw eImgbb;');
  });

  it('la validación (rol, imagen, clave) queda ANTES del try: el respaldo solo actúa si imgbb falló', () => {
    const src = leer(IMAGES);
    const validacion = src.indexOf("role !== 'admin'");
    const intento = src.indexOf('try {');
    expect(validacion).toBeGreaterThan(-1);
    expect(intento).toBeGreaterThan(validacion);
  });

  it('el contrato de respuesta { url, deleteUrl } no cambia', () => {
    const src = leer(IMAGES);
    expect(src).toContain('Promise<{ url: string; deleteUrl: string }>');
    expect(src).toContain("deleteUrl: ''");
  });
});
