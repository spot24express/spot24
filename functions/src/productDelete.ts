/**
 * SPOT 24 · Ronda 5.124 · Eliminar producto del panel (admin Y gerente).
 * Core agnóstico del runtime + wrapper Netlify (POST fn-deleteProduct).
 *
 * Problema del dueño: «ni admin ni gerente han podido [eliminar productos]
 * porque le da falla». CAUSA RAÍZ (doble):
 *  · La regla de /products solo permitía `delete` a admin → gerente, no.
 *  · La regla de /variants/{id} era `allow write` con validaciones sobre
 *    `request.resource.data` — que en un DELETE no existe → la condición da
 *    falso y NADIE podía borrar variantes. Como el borrado (5.92c) es un
 *    lote atómico (variantes + ficha), SIEMPRE abortaba: permission-denied
 *    garantizado para todos.
 * SOLUCIÓN: el borrado pasa por aquí (Admin SDK, inmune a reglas del
 * cliente) con rol verificado EN EL SERVIDOR. No hay que desplegar reglas:
 * el push de Netlify basta. Mismo criterio del panel para crear/editar
 * (admin/gerente, cat.ts) y mismo lote atómico completo de la 5.92c.
 *
 * Reglas del juego:
 *  · Rol admin/gerente desde el CLAIM (igual que fnAdjustStock); el uid
 *    viene del Bearer, jamás del body.
 *  · BLINDAJE: si el producto tiene reservas ACTIVAS (carritos en checkout,
 *    viven 2 h) se rechaza con mensaje accionable — evita romper el
 *    checkout o la cancelación de ese cliente tocando variantes muertas.
 *  · Idempotente: borrar dos veces no es error (doble clic, reintento).
 *  · Auditoría (6.9): action 'producto_eliminado' con nombre y nº de
 *    variantes en la nota — el dueño reconoce el artículo sin buscar ids.
 */
import admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { isSafeDocId } from './lib/items';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/** Sanea el id del producto que llega del panel. '' si no sirve. */
export function sanearProductId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const limpio = raw.trim().slice(0, 120);
  return isSafeDocId(limpio) ? limpio : '';
}

/** ¿Alguna de estas reservas (listas de ítems) menciona el producto? */
export function reservaContieneProducto(
  reservas: Array<Array<Record<string, unknown>>>,
  productId: string,
): boolean {
  return reservas.some((items) =>
    (items ?? []).some((it) => String(it?.['productId'] ?? '') === productId),
  );
}

/** Tamaño de commit por lotes (caso defensivo: catálogo normal tiene <10). */
const BATCH_MAX = 400;

/**
 * Elimina el producto y TODAS sus variantes en un lote atómico.
 * POST fn-deleteProduct: { productId }.
 */
export async function coreDeleteProduct(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para continuar.');
  // 5.124 (pedido del dueño): gerente TAMBIÉN elimina — misma jefatura que
  // crea, edita y ajusta stock. El claim manda; el uid viene del Bearer.
  const role = ctx.auth.token['role'];
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Solo administración o gerencia.');
  }
  const uid = ctx.auth.uid;

  const productId = sanearProductId(ctx.data?.['productId']);
  if (!productId) throw new HttpsError('invalid-argument', 'Producto inválido.');

  const pRef = db().collection('products').doc(productId);
  const pSnap = await pRef.get();

  // Idempotente: si ya no existe (doble clic o reintento), respuesta ok.
  if (!pSnap.exists) return { ok: true, yaNoExistia: true };

  // BLINDAJE: con reservas activas el checkout del cliente (createOrder) o su
  // cancelación tocarían variantes que ya no existen. Se rechaza con mensaje
  // accionable: la reserva vence sola en 2 h y el carrito queda usable.
  const activas = await db().collection('reservations').where('status', '==', 'activa').get();
  const itemsDeActivas = activas.docs.map((d) =>
    Array.isArray(d.data()['items']) ? (d.data()['items'] as Array<Record<string, unknown>>) : [],
  );
  if (reservaContieneProducto(itemsDeActivas, productId)) {
    throw new HttpsError(
      'failed-precondition',
      'Este artículo tiene carritos en checkout (reserva activa). Espera unos minutos o pide al cliente terminar o cancelar su pedido.',
    );
  }

  // Borrado COMPLETO en lote(s): TODAS las variantes + la ficha (5.92c).
  const varsSnap = await pRef.collection('variants').get();
  let batch = db().batch();
  let variantes = 0;
  for (const v of varsSnap.docs) {
    batch.delete(v.ref);
    variantes++;
    if (variantes % BATCH_MAX === 0) {
      await batch.commit();
      batch = db().batch();
    }
  }
  batch.delete(pRef);
  await batch.commit();

  await writeAudit({
    action: 'producto_eliminado',
    adminUid: uid,
    targetId: productId,
    note: `${String(pSnap.data()?.['name'] ?? '').slice(0, 80)} · ${variantes} variante(s)`,
  });

  console.log(`[deleteProduct] ${uid}: ${productId} eliminado con ${variantes} variante(s).`);
  return { ok: true, variantes };
}
