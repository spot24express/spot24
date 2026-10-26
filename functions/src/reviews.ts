/**
 * SPOT 24 · Ronda 5.98 (punto G) · Reseñas de clientes — SOLO reseñas (sin
 * cupones, decisión del dueño). Core agnóstico del runtime + wrapper Netlify.
 *
 * Reglas del juego (aprobadas por el dueño):
 *  · SOLO puede reseñar quien COMPRÓ la pieza y ya la RECIBIÓ (hay pedido
 *    entregado con esa línea). Se valida SERVER-SIDE (el cliente no manda
 *    «yo compré»: el backend lo comprueba contra sus pedidos).
 *  · UNA reseña por cliente por producto (re-intento = error amable).
 *  · La reseña vive DENTRO del doc del producto (array `reviews`, máx 50
 *    últimas): SIN colecciones nuevas y SIN cambiar reglas de Firestore.
 *  · ratingAvg/ratingCount se recalculan SOLO con las visibles; el admin
 *    oculta/elimina desde el panel y el promedio se ajusta al instante.
 *  · Moderación por ocultamiento (visible:false) — nada se pierde para auditoría.
 */
import admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/** Tope de reseñas guardadas por producto (las más nuevas; 1 MB doc lejos). */
const MAX_REVIEWS = 50;
/** Pedidos revisados para comprobar la compra (los más nuevos primero). */
const MAX_ORDERS_REVISADOS = 50;

/** Texto saneado: sin caracteres de control, recortado a 400. */
function limpiarTexto(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 400);
}

interface ReviewEntry {
  uid: string;
  name: string;
  rating: number;
  text: string;
  at: number;
  visible: boolean;
}

/** Promedio SOLO de las visibles, a 1 decimal (0 si no hay). */
function promedio(reviews: ReviewEntry[]): number {
  const visibles = reviews.filter((r) => r.visible);
  if (visibles.length === 0) return 0;
  const suma = visibles.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((suma / visibles.length) * 10) / 10;
}

function camposRating(reviews: ReviewEntry[]): { ratingAvg: number; ratingCount: number } {
  return {
    ratingAvg: promedio(reviews),
    ratingCount: reviews.filter((r) => r.visible).length,
  };
}

/**
 * Publica (o deja lista) la reseña del cliente. POST fn-addReview:
 *   { productId, rating (1-5), text }
 */
export async function coreAddReview(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Inicia sesión para reseñar.');
  const uid = ctx.auth.uid;

  const productId = String(ctx.data?.['productId'] ?? '').trim().slice(0, 120);
  if (!productId) throw new HttpsError('invalid-argument', 'Producto inválido.');

  const rating = Math.floor(Number(ctx.data?.['rating'] ?? 0));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    throw new HttpsError('invalid-argument', 'Elige de 1 a 5 estrellas.');
  }

  const text = limpiarTexto(ctx.data?.['text']);
  if (text.length < 3) {
    throw new HttpsError('invalid-argument', 'Cuéntanos tu experiencia en al menos 3 letras.');
  }

  const pRef = db().collection('products').doc(productId);
  const pSnap = await pRef.get();
  if (!pSnap.exists) throw new HttpsError('not-found', 'Esa pieza ya no existe.');

  // ¿Ya reseñó esta pieza? (1 reseña por cliente/producto)
  const previas = Array.isArray(pSnap.data()?.['reviews'])
    ? (pSnap.data()!['reviews'] as ReviewEntry[])
    : [];
  if (previas.some((r) => r && r.uid === uid)) {
    throw new HttpsError('failed-precondition', 'Ya dejaste tu reseña de esta pieza. ¡Gracias!');
  }

  // Compra entregada comprobada server-side: recorremos los pedidos del
  // cliente (más nuevos primero, solo campos necesarios) buscando una línea
  // de este producto en un pedido ENTREGADO. Cancelados NO cuentan.
  const ordersSnap = await db()
    .collection('orders')
    .where('uid', '==', uid)
    .orderBy('createdAt', 'desc')
    .limit(MAX_ORDERS_REVISADOS)
    .select('uid', 'status', 'lines')
    .get();
  const compro = ordersSnap.docs.some((d) => {
    const o = d.data();
    if (String(o['status'] ?? '') !== 'entregado') return false;
    const lines = Array.isArray(o['lines']) ? (o['lines'] as Array<Record<string, unknown>>) : [];
    return lines.some((l) => String(l?.['productId'] ?? '') === productId);
  });
  if (!compro) {
    throw new HttpsError(
      'failed-precondition',
      'Solo puedes reseñar piezas que compraste y ya recibiste.',
    );
  }

  // Nombre visible: primer nombre del perfil (fallback genérico).
  let name = 'Cliente';
  try {
    const usnap = await db().collection('users').doc(uid).get();
    const raw = String(usnap.data()?.['name'] ?? '').trim();
    const first = raw ? raw.split(/\s+/)[0] : '';
    if (first) name = first.slice(0, 24);
  } catch {
    /* perfil ilegible: sigue el fallback */
  }

  const entry: ReviewEntry = {
    uid,
    name,
    rating,
    text,
    at: Date.now(),
    visible: true,
  };
  const reviews = [...previas.filter((r) => r && typeof r.at === 'number'), entry]
    .sort((a, b) => b.at - a.at)
    .slice(0, MAX_REVIEWS);

  const ratingCampos = camposRating(reviews);
  await pRef.update({ reviews, ...ratingCampos });

  await writeAudit({
    action: 'resena_nueva',
    adminUid: uid,
    targetId: productId,
    note: `${rating}★ · ${text.slice(0, 80)}`,
  });
  return { ok: true, ...ratingCampos };
}
