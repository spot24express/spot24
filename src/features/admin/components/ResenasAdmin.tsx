/**
 * SPOT 24 · Ronda 5.98 (G) · Moderación de RESEÑAS desde el panel.
 * Sección del editor de producto (Admin → Productos → editar): lista TODAS las
 * reseñas (visibles y ocultas) con acciones Ocultar / Mostrar / Eliminar.
 * Cada cambio recalcula ratingAvg/ratingCount del producto SOLO con las
 * visibles (admin.service). Sin reseñas: el bloque ni aparece.
 */
import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';
import {
  adminDeleteResena, adminGetResenas, adminSetResenaVisible,
} from '../services/admin.service';
import { StarIcon } from '@/features/catalog/components/ProductCard';
import type { ProductReview } from '@/features/catalog/types';

export function ResenasAdmin({ productId }: { productId: string }) {
  const [resenas, setResenas] = useState<ProductReview[] | null>(null);
  const [busy, setBusy] = useState<string>('');

  useEffect(() => {
    let alive = true;
    void adminGetResenas(productId)
      .then((r) => {
        if (alive) setResenas(r);
      })
      .catch((e) => {
        logger.warn('lectura de reseñas (panel) falló', e);
        if (alive) setResenas([]);
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!resenas || resenas.length === 0) return null;

  const accion = async (key: string, fn: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    try {
      await fn();
      const recargadas = await adminGetResenas(productId);
      setResenas(recargadas);
      toast.success('Reseña actualizada y rating recalculado.');
    } catch (e) {
      const msg = e instanceof AppError ? e.userMessage : 'No pudimos aplicar el cambio. Intenta de nuevo.';
      logger.warn('moderación de reseña falló', e);
      toast.error(msg);
      // Restaura la lista previa si la recarga falló: relectura directa.
      try {
        setResenas(await adminGetResenas(productId));
      } catch {
        setResenas([]);
      }
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-brand border-2 border-line p-4">
      <p className="mb-1 spot-label">Reseñas ({resenas.length}) — moderación</p>
      <p className="mb-3 text-xs text-muted">
        Ocultar la quita de la tienda (y baja del promedio) sin borrarla. Eliminar es definitivo.
      </p>
      <ul className="space-y-3">
        {resenas.map((r) => (
          <li
            key={`${r.uid}-${r.at}`}
            className={`rounded-brand border-2 p-3 ${r.visible ? 'border-line' : 'border-line opacity-60'}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2">
                <span className="font-display text-sm font-bold italic uppercase text-paper">{r.name}</span>
                <span className="inline-flex items-center gap-0.5 text-signal">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <span key={i} className={i <= r.rating ? 'text-signal' : 'text-line-strong'}>
                      <StarIcon />
                    </span>
                  ))}
                </span>
                {!r.visible && (
                  <span className="rounded-brand border-2 border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted">
                    Oculta
                  </span>
                )}
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void accion(`${r.uid}-${r.at}-v`, () =>
                      adminSetResenaVisible(productId, r.uid, r.at, !r.visible),
                    )
                  }
                  className="rounded-brand border-2 border-line px-2 py-1 text-xs font-semibold text-paper transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
                >
                  {r.visible ? 'Ocultar' : 'Mostrar'}
                </button>
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    if (!window.confirm('¿Eliminar la reseña para siempre? (mejor opción: Ocultar)')) return;
                    void accion(`${r.uid}-${r.at}-d`, () => adminDeleteResena(productId, r.uid, r.at));
                  }}
                  className="rounded-brand border-2 border-line px-2 py-1 text-xs font-semibold text-paper transition-colors hover:border-signal hover:text-signal disabled:opacity-40"
                >
                  Eliminar
                </button>
              </span>
            </div>
            <p className="mt-2 text-body-base leading-relaxed text-muted">{r.text}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
