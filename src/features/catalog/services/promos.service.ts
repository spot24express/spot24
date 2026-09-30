/**
 * Módulo catálogo · Promos públicas del carrusel «Visítanos».
 * Lectura directa de Firestore (reglas: lectura pública, escritura solo admin).
 * Si no hay promos activas devuelve [] y el Home conserva su banner del local.
 */
import { collection, getDocs, limit as fbLimit, query } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';

export interface PromoSlide {
  title: string;
  imageUrl: string;
}

export async function listActivePromos(): Promise<PromoSlide[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(query(collection(fb.db, 'promos'), fbLimit(12)));
  return snap.docs
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