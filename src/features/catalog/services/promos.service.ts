/**
 * Módulo catálogo · Promos públicas del carrusel «Visítanos».
 * Lectura directa de Firestore (reglas: lectura pública, escritura solo admin).
 * Si no hay promos activas devuelve [] y el Home conserva su banner del local.
 */
import {
  collection, getDocs, limit as fbLimit, onSnapshot, query,
  type DocumentData, type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';

export interface PromoSlide {
  title: string;
  imageUrl: string;
}

/** Mapa de la colección promos → diapositivas activas ordenadas (compartido
 *  por la lectura puntual y el vigía en vivo). */
function mapPromos(docs: QueryDocumentSnapshot<DocumentData>[]): PromoSlide[] {
  return docs
    .map((d) => ({
      title: String(d.data()['title'] ?? ''),
      imageUrl: String(d.data()['imageUrl'] ?? ''),
      active: d.data()['active'] !== false,
      order: Number(d.data()['order'] ?? 0),
    }))
    .filter((p) => p.active && p.imageUrl)
    .sort((a, b) => a.order - b.order)
    .map(({ title, imageUrl }) => ({ title, imageUrl }));
}

export async function listActivePromos(): Promise<PromoSlide[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(query(collection(fb.db, 'promos'), fbLimit(12)));
  return mapPromos(snap.docs);
}

/** Vigía en vivo de las promos: crear, editar (título/imagen/orden) o
 *  activar/desactivar actualiza el carrusel del Home al instante. */
export function subscribeActivePromos(cb: () => void): () => void {
  let unsub: (() => void) | null = null;
  let cancelled = false;
  let prev: string | null = null;
  void loadFirebase().then((fb) => {
    if (!fb || cancelled) return;
    unsub = onSnapshot(
      query(collection(fb.db, 'promos'), fbLimit(12)),
      (snap) => {
        const sig = JSON.stringify(mapPromos(snap.docs));
        if (prev !== null && sig !== prev) cb();
        prev = sig;
      },
      (err) => logger.warn('vigía promos detenido', err),
    );
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}
