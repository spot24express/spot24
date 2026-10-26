/**
 * SPOT 24 · Ronda 5.98 (punto G) · Reseñas — capa de servicios del cliente.
 * · getProductReviews: lee el doc del producto y devuelve las reseñas VISIBLES
 *   (las ocultas por moderación no viajan a la ficha). Lectura puntual: los
 *   listados del catálogo no se engordan con el array.
 * · submitReview: llama fn-addReview (el backend comprueba que compró y recibió
 *   la pieza — el cliente no puede saltarse la validación).
 */
import { doc, getDoc } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { callFunction } from '@/shared/lib/backend';
import { logger } from '@/shared/lib/logger';
import type { ProductReview } from '../types';

/** Reseñas visibles de un producto (más nuevas primero). Máx 50 (tope backend). */
export async function getProductReviews(productId: string): Promise<ProductReview[]> {
  const fb = await loadFirebase();
  if (!fb || !productId) return [];
  try {
    const snap = await getDoc(doc(fb.db, 'products', productId));
    if (!snap.exists()) return [];
    const raw = snap.data()['reviews'];
    if (!Array.isArray(raw)) return [];
    return (raw as Array<Record<string, unknown>>)
      .filter((r) => r && r['visible'] === true && typeof r['at'] === 'number')
      .map((r) => ({
        uid: String(r['uid'] ?? ''),
        name: String(r['name'] ?? 'Cliente').slice(0, 24),
        rating: Math.min(5, Math.max(1, Math.floor(Number(r['rating'] ?? 0)))),
        text: String(r['text'] ?? '').slice(0, 400),
        at: Number(r['at'] ?? 0),
        visible: true,
      }))
      .sort((a, b) => b.at - a.at);
  } catch (e) {
    logger.warn('lectura de reseñas falló', e);
    return [];
  }
}

/** Envía la reseña del cliente. Lanza AppError con el mensaje del backend. */
export async function submitReview(
  productId: string,
  rating: number,
  text: string,
): Promise<{ ratingAvg: number; ratingCount: number }> {
  const res = await callFunction<{ ok: boolean; ratingAvg: number; ratingCount: number }>(
    'fn-addReview',
    { productId, rating, text },
  );
  return { ratingAvg: res.ratingAvg, ratingCount: res.ratingCount };
}
