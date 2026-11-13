/**
 * 5.115 · GUARDIÁN DE LA RED DE SEGURIDAD DE IMÁGENES (v2 multi-proveedor).
 *
 * Qué garantiza leyendo tus archivos reales (sin Firebase ni red):
 *
 *  · La lib imagen-respaldo.ts existe y habla con los tres respaldos
 *    (freeimage.host, Cloudinary, catbox.moe).
 *  · Sin variables de entorno NO hace nada (comportamiento de hoy intacto).
 *  · El respaldo está acotado en el tiempo (AbortController + timeout).
 *  · orders.ts: imgbb sigue PRIMERO y el respaldo entra SOLO en el catch;
 *    si el respaldo también falla, se relanza el error original de imgbb
 *    (mismo mensaje al cliente, cero órdenes huérfanas).
 *  · La re-subida legacy (fn-uploadReceipt) hereda el respaldo gratis.
 *  · El mensaje amigable de imgbb.ts queda intacto.
 *  · Regresión 5.114: el aviso al cajero sigue en su sitio.
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

const ORDERS = 'functions/src/orders.ts';
const RESPALDO = 'functions/src/lib/imagen-respaldo.ts';
const IMGBB = 'functions/src/lib/imgbb.ts';

describe('guardián 5.115 · lib/functions/src/lib/imagen-respaldo.ts', () => {
  it('la lib del respaldo existe y habla con los tres respaldos', () => {
    const src = leer(RESPALDO);
    expect(src).toContain('freeimage.host');
    expect(src).toContain('api.cloudinary.com');
    expect(src).toContain('catbox.moe');
    expect(src).toContain('secure_url');
  });

  it('cada proveedor es opt-in por variable y sin nada configurado NO hace nada', () => {
    const src = leer(RESPALDO);
    expect(src).toContain('FREEIMAGE_API_KEY');
    expect(src).toContain('CLOUDINARY_CLOUD_NAME');
    expect(src).toContain('CLOUDINARY_UPLOAD_PRESET');
    expect(src).toContain('RESPALDO_CATBOX');
    expect(src).toContain('candidatos.length === 0');
    expect(src).toContain('return null;');
  });

  it('respaldo acotado en el tiempo (AbortController + timeout por intento)', () => {
    const src = leer(RESPALDO);
    expect(src).toContain('AbortController');
    expect(src).toContain('ctrl.abort()');
    expect(src).toContain('TIMEOUT_MS');
  });

  it('los errores internos se atrapan: solo devuelve URL o null (jamás lanza)', () => {
    const src = leer(RESPALDO);
    expect(src).toContain('catch (e)');
    expect(src.trim().endsWith('return null;\n}')).toBe(true);
  });
});

describe('guardián 5.115 · cadena en functions/src/orders.ts', () => {
  it('orders.ts importa el respaldo', () => {
    const src = leer(ORDERS);
    expect(src).toContain(
      "import { subirComprobanteRespaldo } from './lib/imagen-respaldo';",
    );
  });

  it('imgbb sigue PRIMERO y el respaldo entra SOLO en el catch', () => {
    const src = leer(ORDERS);
    const ini = src.indexOf('async function uploadReceiptToImgbb(');
    expect(ini).toBeGreaterThan(-1);
    const envoltorio = src.slice(ini, ini + 1200);
    expect(envoltorio).toContain('uploadReceiptToImgbbImgbb(image)');
    expect(envoltorio).toContain('catch (eImgbb)');
    expect(envoltorio).toContain('subirComprobanteRespaldo(image)');
    expect(envoltorio).toContain('if (urlRespaldo) return urlRespaldo;');
    expect(envoltorio).toContain('throw eImgbb;');
  });

  it('la re-subida legacy (fn-uploadReceipt) hereda el respaldo gratis', () => {
    const src = leer(ORDERS);
    // El envoltorio mantiene nombre y firma → la llamada legacy
    // `await uploadReceiptToImgbb(image)` sigue existiendo sin cambios.
    expect(src).toMatch(/await uploadReceiptToImgbb\(image\)/);
  });

  it('el mensaje amigable de imgbb queda intacto (mismo texto si ambos fallan)', () => {
    const imgbb = leer(IMGBB);
    expect(imgbb).toContain('está caído');
  });

  it('regresión 5.114: el aviso al cajero sigue en su sitio', () => {
    const src = leer(ORDERS);
    // 5.135-B: la firma lleva destinatario opcional («Para: …») + el flag
    // «Sin GPS» del envío a tercero (terceroSinGps) para el remate del aviso.
    expect(src).toContain('ORDER_NOTIFICATIONS.sendPaidAlert(code, paraQuien, terceroSinGps)');
  });
});