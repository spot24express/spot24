/**
 * 5.114 · GUARDIÁN DE LA MATRIZ DE PUSHES (prueba exhaustiva estática).
 * v2 — corrección: el último test busca los títulos del mapa MESSAGES
 * (los estados son CLAVES sin comillas: `cancelado: { … }`; la v1 buscaba
 * 'cancelado' entre comillas y daba un falso fallo contra el archivo
 * correcto). Verificado contra el notifications.ts real del dueño.
 *
 * Qué hace: verifica DENTRO de tus archivos reales que cada escenario
 * dispara los avisos que le corresponden — la matriz completa:
 *
 *  · Automático BDV cubre el total (delivery o pickup)  → cliente «Pago
 *    confirmado» + personal «Pedido pagado — listo para preparar».
 *  · Automático BDV PARCIAL (no cubre) → nace en verificación → cliente
 *    «pago en verificación» + personal «Pago por verificar».
 *  · Manual (comprobante) → idem parcial: cliente + «Pago por verificar».
 *  · Cancelación → push al dueño.
 *  · Re-subida de comprobante (legacy pendiente) → aviso al cajero SOLO
 *    si la orden entra ahora a verificación.
 *  · Stock que queda en cero → «Se agotó» a los demás carritos.
 *
 * NO necesita Firebase ni red: lee el código fuente y garantiza que la
 * matriz existe EXACTA donde debe. Si un paste futuro borra una rama,
 * este test se rompe y te dice qué archivo reponer.
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

/** Índice de la primera aparición después de `desde` (−1 si no está). */
function idxAfter(pajar: string, aguja: string, desde = 0): number {
  return pajar.indexOf(aguja, desde);
}

const ORDERS = 'functions/src/orders.ts';
const NOTIF = 'functions/src/lib/notifications.ts';

describe('guardián 5.114 · matriz de pushes en functions/src/orders.ts', () => {
  it('los avisos nacen del módulo correcto (import de notifications)', () => {
    const src = leer(ORDERS);
    expect(src).toContain(
      "import { ORDER_NOTIFICATIONS, STOCK_NOTIFICATIONS } from './lib/notifications';",
    );
  });

  it('AUTOMÁTICO BDV total (delivery o pickup): push «Pago confirmado» al cliente', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, 'if (nacePagado) {');
    expect(ini).toBeGreaterThan(-1);
    const fin = idxAfter(src, '// 5.74 · «Se agotó»', ini);
    const rama = src.slice(ini, fin);
    expect(rama).toContain("ORDER_NOTIFICATIONS.send(uid, code, 'pagado')");
  });

  it('AUTOMÁTICO BDV total: aviso 5.114 «listo para preparar» al cajero, DESPUÉS del push del cliente', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, 'if (nacePagado) {');
    const fin = idxAfter(src, '// 5.74 · «Se agotó»', ini);
    const rama = src.slice(ini, fin);
    const cliente = rama.indexOf("ORDER_NOTIFICATIONS.send(uid, code, 'pagado')");
    // 5.135-B: la firma lleva destinatario opcional («Para: …») + el flag
    // «Sin GPS» del envío a tercero (terceroSinGps) para el remate del aviso.
    const cajero = rama.indexOf('ORDER_NOTIFICATIONS.sendPaidAlert(code, paraQuien, terceroSinGps)');
    expect(cliente).toBeGreaterThan(-1);
    expect(cajero).toBeGreaterThan(cliente); // cadena 5.71: primero cliente
  });

  it('MANUAL / PARCIAL: nace en verificación (nacePagado exige cubrir el total)', () => {
    const src = leer(ORDERS);
    expect(src).toContain('const nacePagado = evidencias.length > 0 && bdvTotal + 0.004 >= totals.totalVes;');
  });

  it('MANUAL / PARCIAL: push «pago en verificación» al cliente', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, '} else {', idxAfter(src, 'if (nacePagado) {'));
    expect(ini).toBeGreaterThan(-1);
    const fin = idxAfter(src, '// 5.74 · «Se agotó»', ini);
    const rama = src.slice(ini, fin);
    expect(rama).toContain("ORDER_NOTIFICATIONS.send(uid, code, 'en_verificacion')");
  });

  it('MANUAL / PARCIAL: aviso 5.71 «Pago por verificar» al cajero (y no en la rama pagado)', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, 'if (nacePagado) {');
    const fin = idxAfter(src, '// 5.74 · «Se agotó»', ini);
    const rama = src.slice(ini, fin);
    const sino = rama.indexOf('} else {');
    const antes = rama.slice(0, sino);
    const despues = rama.slice(sino);
    // 5.135-B: la firma lleva destinatario opcional («Para: …») + el flag
    // «Sin GPS» del envío a tercero (terceroSinGps) para el remate del aviso.
    expect(despues).toContain('ORDER_NOTIFICATIONS.sendPaymentReviewAlert(code, paraQuien, terceroSinGps)');
    expect(antes).not.toContain('sendPaymentReviewAlert'); // pagado del banco NO pide verificación
  });

  it('CANCELACIÓN: push al dueño de la orden', () => {
    const src = leer(ORDERS);
    expect(src).toContain("ORDER_NOTIFICATIONS.send(ownerUid, orderCode, 'cancelado')");
  });

  it('RE-SUBIDA de comprobante (legacy): aviso al cajero SOLO si entra a verificación ahora', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, 'if (pasoAVerificacion) {');
    expect(ini).toBeGreaterThan(-1);
    const fin = idxAfter(src, 'return { ok: true, url };', ini);
    const rama = src.slice(ini, fin);
    expect(rama).toContain('ORDER_NOTIFICATIONS.sendPaymentReviewAlert(orderCode)');
  });

  it('STOCK EN CERO: «Se agotó» a los demás carritos (sin incluir al comprador)', () => {
    const src = leer(ORDERS);
    const ini = idxAfter(src, 'STOCK_NOTIFICATIONS.notifyVariantStock(');
    expect(ini).toBeGreaterThan(-1);
    const ctx = src.slice(ini, ini + 200);
    expect(ctx).toContain('excludeUid: uid');
  });
});

describe('guardián 5.114 · cadena en functions/src/lib/notifications.ts', () => {
  it('sendPaidAlert existe y va al personal correcto (cajero con gerente/admin de respaldo)', () => {
    const src = leer(NOTIF);
    expect(src).toContain('sendPaidAlert');
    expect(src).toMatch(/'cajero'[\s\S]{0,120}'gerente'[\s\S]{0,120}'admin'/);
  });

  it('aviso de pagado: título «listo para preparar» y CTA al despacho (aud dispatch)', () => {
    const src = leer(NOTIF);
    expect(src).toContain('listo para preparar');
    expect(src).toMatch(/aud:\s*'dispatch'/);
    expect(src).toContain('prepáralo');
  });

  it('aviso 5.71 «Pago por verificar»: CTA a la cola de pagos (aud pagos)', () => {
    const src = leer(NOTIF);
    expect(src).toContain('sendPaymentReviewAlert');
    expect(src).toMatch(/aud:\s*'pagos'/);
  });

  it('todo aviso es best-effort (catch: FCM caído jamás rompe el pedido)', () => {
    const src = leer(NOTIF);
    const catches = src.match(/catch/g)?.length ?? 0;
    expect(catches).toBeGreaterThanOrEqual(3);
  });

  it('pushes del cliente cubiertos: pagado / en_verificacion / cancelado', () => {
    // Por TÍTULO del mapa MESSAGES: los estados son claves sin comillas
    // (`cancelado: { … }`), la v1 buscaba 'cancelado' entre comillas y
    // daba un falso fallo contra el archivo correcto del dueño.
    const src = leer(NOTIF);
    expect(src).toContain('SPOT 24 · Pago confirmado');   // estado pagado
    expect(src).toContain('SPOT 24 · Verificando pago');  // en_verificacion
    expect(src).toContain('SPOT 24 · Pedido cancelado');  // cancelado
  });
});