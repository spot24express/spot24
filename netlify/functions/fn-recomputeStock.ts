/**
 * SPOT 24 · GET /.netlify/functions/fn-recomputeStock?key=...
 * Reparación ONE-SHOT del stockTotal de TODOS los productos (ronda 5.75).
 *
 * ¿Por qué existe? La tarjeta del panel muestra products.stockTotal, pero
 * las ventas anteriores al deploy 5.74 no lo bajaban (solo bajaban las
 * variantes) → docs hinchados: el panel decía «Stock 40» cuando en realidad
 * quedaban 32. La vitrina («Últimas N», «Sin stock») y el globo de los
 * carritos leen ese mismo stockTotal.
 *
 * Qué hace:
 *  1. Recorre TODOS los productos.
 *  2. Suma el stock real de sus variantes (subcolección products/{id}/variants).
 *  3. Corrige SOLO los docs donde stockTotal ≠ suma real (batch, máx 450/lote).
 *
 * Seguro por URL con BCV_RUN_KEY (la MISMA clave que ya configuraste para
 * el cron del BCV — no hay que añadir variables nuevas en Netlify).
 * Se puede re-ejecutar cuando sea necesario: si todo está cuadrado responde
 * fixed: 0 y no escribe nada.
 */
import { timingSafeEqual, createHash } from 'node:crypto';
import admin from 'firebase-admin';
import { getAdminApp } from '../../functions/src/lib/ctx';

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** Comparación en tiempo constante vía SHA-256 (mismo patrón que fn-runBcvRate). */
function safeEq(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export default async (req: Request): Promise<Response> => {
  try {
    if (req.method !== 'GET') {
      return json(405, { error: { code: 'invalid-argument', message: 'Usa GET en el navegador.' } });
    }
    const expected = process.env['BCV_RUN_KEY'] ?? '';
    if (!expected) {
      return json(
        503,
        { error: { code: 'unavailable', message: 'Configura BCV_RUN_KEY en Netlify (Environment variables) y redeploy.' } },
      );
    }
    const key = new URL(req.url).searchParams.get('key') ?? '';
    if (!safeEq(key, expected)) {
      return json(403, { error: { code: 'permission-denied', message: 'Clave inválida.' } });
    }

    // Namespace legacy (mismo criterio que admin.ts): admin.firestore(app)
    // SÍ está tipado y en runtime (extendApp ya inyectó los métodos).
    const db = admin.firestore(getAdminApp());

    // 1) Todos los productos (solo id + stockTotal para no cargar imágenes).
    const prods = await db.collection('products').select('stockTotal').get();

    // 2) Suma real de variantes por producto, en tandas de 25 consultas
    //    paralelas (con catálogos de 1000+ productos el secuencial podría
    //    rozar el timeout de 26 s de Netlify).
    const fixes: Array<{ id: string; from: number; to: number }> = [];
    const CHUNK = 25;
    for (let i = 0; i < prods.docs.length; i += CHUNK) {
      await Promise.all(
        prods.docs.slice(i, i + CHUNK).map(async (p: typeof prods.docs[number]) => {
          const vs = await db.collection('products').doc(p.id).collection('variants').get();
          const sum = vs.docs.reduce(
            (a: number, v: typeof vs.docs[number]) => a + Math.max(0, Math.floor(Number(v.data()['stock'] ?? 0))),
            0,
          );
          const current = Math.max(0, Math.floor(Number(p.data()['stockTotal'] ?? 0)));
          if (current !== sum) fixes.push({ id: p.id, from: current, to: sum });
        }),
      );
    }

    // 3) Corrige en lotes de 450 (límite Firestore = 500 ops/batch).
    let written = 0;
    for (let i = 0; i < fixes.length; i += 450) {
      const batch = db.batch();
      for (const f of fixes.slice(i, i + 450)) {
        batch.update(db.collection('products').doc(f.id), {
          stockTotal: f.to,
          updatedAt: Date.now(),
        });
      }
      await batch.commit();
      written += Math.min(450, fixes.length - i);
    }

    return json(200, {
      ok: true,
      productosRevisados: prods.size,
      corregidos: written,
      detalle: fixes.slice(0, 200).map((f) => `${f.id}: ${f.from} → ${f.to}`),
    });
  } catch (e) {
    const code = String((e as { code?: string }).code ?? 'internal');
    const message = (e as Error).message ?? 'Error interno.';
    return json(500, { error: { code, message } });
  }
};
