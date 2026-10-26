/**
 * SPOT 24 · Ronda 5.98 (punto G) · Bloque de RESEÑAS de la ficha de producto.
 * · Lista de reseñas VISIBLES (moderadas por el dueño desde el panel) con
 *   promedio y estrellas. Sin reseñas → el bloque NO aparece (arranque limpio).
 * · Formulario SOLO con sesión activa: 5 estrellas + texto corto. El backend
 *   (fn-addReview) comprueba que la pieza fue COMPRADA y ENTREGADA — si no,
 *   el mensaje del servidor sale en el toast (nada de promesas falsas).
 * Solo reseñas: sin cupones ni recompensas (decisión del dueño).
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/shared/components/ui/Button';
import { RatingLine, StarIcon } from './ProductCard';
import { getProductReviews, submitReview } from '../services/reviews.service';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { toast } from '@/shared/lib/toast';
import { AppError } from '@/shared/lib/errors';
import { logger } from '@/shared/lib/logger';

function fechaCorta(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

export function ResenasProducto({ productId }: { productId: string }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { data: reviews } = useQuery({
    queryKey: ['catalog', 'reviews', productId] as const,
    queryFn: () => getProductReviews(productId),
    staleTime: 5 * 60 * 1000,
  });

  const [rating, setRating] = useState(5);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  if (!reviews || reviews.length === 0) return null;
  const suma = reviews.reduce((acc, r) => acc + r.rating, 0);
  const promedio = Math.round((suma / reviews.length) * 10) / 10;
  const yaResenio = Boolean(user && reviews.some((r) => r.uid === user.uid));

  const publicar = async (): Promise<void> => {
    if (sending) return;
    if (text.trim().length < 3) {
      toast.error('Cuéntanos tu experiencia en al menos 3 letras.');
      return;
    }
    setSending(true);
    try {
      await submitReview(productId, rating, text);
      toast.success('¡Gracias! Tu reseña ya está publicada.');
      setText('');
      setFormOpen(false);
      void qc.invalidateQueries({ queryKey: ['catalog'] });
    } catch (e) {
      const msg = e instanceof AppError ? e.userMessage : 'No pudimos publicar tu reseña. Intenta de nuevo.';
      logger.warn('publicar reseña falló', e);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="mt-12" aria-labelledby="rev-title">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="rev-title" className="spot-title">
            Reseñas <span className="text-muted">({reviews.length})</span>
          </h2>
          <p className="spot-subtitle mt-2">
            Opiniones de clientes que compraron y recibieron esta pieza.
          </p>
        </div>
        <RatingLine avg={promedio} count={reviews.length} />
      </div>

      <div className="space-y-3">
        {reviews.slice(0, 10).map((r) => (
          <article key={`${r.uid}-${r.at}`} className="rounded-brand-lg border-2 border-line bg-surface-1 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-sm font-bold italic uppercase text-paper">{r.name}</p>
              <span className="inline-flex items-center gap-0.5 text-signal" aria-label={`${r.rating} de 5 estrellas`}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <span key={i} className={i <= r.rating ? 'text-signal' : 'text-line-strong'}>
                    <StarIcon />
                  </span>
                ))}
              </span>
            </div>
            <p className="mt-2 text-body-base leading-relaxed text-muted">{r.text}</p>
            <p className="mt-2 spot-label">{fechaCorta(r.at)}</p>
          </article>
        ))}
      </div>

      {/* Formulario: solo con sesión. Quien ya reseñó ve el agradecimiento. */}
      {user ? (
        yaResenio ? (
          <p className="mt-6 spot-label">Ya dejaste tu reseña de esta pieza. ¡Gracias!</p>
        ) : formOpen ? (
          <div className="mt-6 rounded-brand-lg border-2 border-line bg-surface-1 p-5">
            <p className="font-display text-base font-bold italic uppercase text-paper">Tu reseña</p>
            <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label="Tu calificación">
              {[1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  type="button"
                  role="radio"
                  aria-checked={i === rating}
                  aria-label={`${i} estrellas`}
                  onClick={() => setRating(i)}
                  className={`p-1 transition-transform hover:scale-110 ${i <= rating ? 'text-signal' : 'text-line-strong'}`}
                >
                  <StarIcon />
                </button>
              ))}
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 400))}
              rows={3}
              maxLength={400}
              placeholder="¿Cómo te fue con la pieza? (máx. 400 letras)"
              className="mt-3 w-full rounded-brand border-2 border-line bg-ink px-3 py-2 text-body-base text-paper placeholder:text-muted focus:border-signal focus:outline-none"
            />
            <div className="mt-3 flex gap-3">
              <Button size="sm" disabled={sending} onClick={() => void publicar()}>
                {sending ? 'Publicando…' : 'Publicar reseña'}
              </Button>
              <Button size="sm" variant="ghost" disabled={sending} onClick={() => setFormOpen(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6">
            <Button size="sm" variant="ghost" onClick={() => setFormOpen(true)}>
              Escribe tu reseña
            </Button>
          </div>
        )
      ) : (
        <p className="mt-6 spot-label">
          <Link to="/cuenta/login" className="text-signal hover:underline">
            Inicia sesión
          </Link>{' '}
          para dejar tu reseña (solo piezas compradas y recibidas).
        </p>
      )}
    </section>
  );
}
