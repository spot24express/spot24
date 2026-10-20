import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { MY_ORDERS_PAGE_SIZE, listMyOrders, subscribeMyOrders } from '../services/orders.service';
import type { Order } from '../types';
import { VOICE } from '@/shared/constants/brand';
import { formatBs } from '@/shared/lib/format';
import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Mis pedidos EN VIVO (vigía 5.75) con «Cargar más» por cursor (7.1).
 * La primera página llega por onSnapshot (subscribeMyOrders): las tarjetas
 * cambian solas cuando el pedido avanza de estatus, entra el tracking o se
 * crea un pedido nuevo. Las páginas viejas cargadas con «Cargar más» se
 * conservan: el merge sustituye cada doc por su versión nueva y reordena.
 */
export default function MyOrdersPage() {
  useDocumentTitle('Mis pedidos');
  const navigate = useNavigate();
  const { user } = useAuth();
  const [all, setAll] = useState<Order[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // FIX 5.32 + vigía 5.75: la consulta pide SOLO los pedidos de este usuario
    // (where uid), como exigen las reglas de Firestore. Mientras la sesión no
    // esté lista no se escucha nada (el guard de la ruta ya redirige al login).
    if (!user?.uid) return;
    let alive = true;
    setLoading(true);
    setError(false);
    const unsub = subscribeMyOrders(
      user.uid,
      (live) => {
        if (!alive) return;
        // Merge: los docs del snapshot reemplazan a su versión anterior
        // (mismo id); el resto (páginas viejas de «Cargar más») se conserva
        // y todo queda ordenado de más nuevo a más viejo.
        setAll((prev) => {
          const liveIds = new Set(live.map((o) => o.id));
          const rest = prev.filter((o) => !liveIds.has(o.id));
          return [...live, ...rest].sort((a, b) => b.createdAt - a.createdAt);
        });
        setHasMore(live.length >= MY_ORDERS_PAGE_SIZE);
        setLoading(false);
      },
      () => {
        // Fallo del canal: solo se muestra la pantalla de error si NO hay
        // lista en pantalla (la condición vive en el render, no aquí, para
        // no depender del closure del efecto). El vigía reconecta solo y el
        // próximo snapshot repone los datos.
        if (!alive) return;
        setError(true);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
      unsub();
    };
  }, [user?.uid]);

  const loadMore = async () => {
    if (!user?.uid || !hasMore || all.length === 0) return;
    try {
      // Cursor: createdAt del ÚLTIMO doc ya cargado (el vigía puede haber
      // insertado pedidos nuevos arriba; el cursor no se movió).
      const cursor = String(all[all.length - 1]?.createdAt ?? 0);
      const next = await listMyOrders(user.uid, cursor);
      setAll((prev) => {
        const seen = new Set(prev.map((o) => o.id));
        return [...prev, ...next.items.filter((o) => !seen.has(o.id))].sort(
          (a, b) => b.createdAt - a.createdAt,
        );
      });
      setHasMore(next.hasMore);
    } catch {
      setError(true);
    }
  };

  return (
    <div className="spot-container py-8">
      <h1 className="spot-title">Mis pedidos</h1>
      <p className="spot-subtitle mt-1">Sigue cada parada en vivo.</p>

      <div className="mt-8">
        {error && all.length === 0 ? (
          <ErrorState onRetry={() => window.location.reload()} />
        ) : loading ? (
          <ListSkeleton />
        ) : all.length === 0 ? (
          <EmptyState
            title="Sin pedidos todavía"
            message={VOICE.emptyOrders}
            action={{ label: 'Explorar catálogo', onClick: () => navigate('/catalogo') }}
          />
        ) : (
          <>
            <ul className="space-y-4">
              {all.map((o) => (
                <li key={o.id}>
                  <Link
                    to={`/pedido/${o.id}`}
                    className="flex flex-col gap-3 rounded-brand-lg border-2 border-line bg-surface-1 p-5 transition-colors hover:border-signal sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-display text-lg font-extrabold italic text-signal">{o.code}</p>
                      <p className="mt-1 text-sm text-muted">
                        {new Date(o.createdAt).toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · {o.lines.length} {o.lines.length === 1 ? 'artículo' : 'artículos'}
                      </p>
                      {o.delivery.trackingCode && (
                        <p className="mt-1 spot-label">Tracking: {o.delivery.trackingCode}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                      <span className="font-display text-lg font-extrabold italic text-paper">
                        {formatBs(o.totals.totalVes)}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {hasMore && (
              <div className="mt-6 flex justify-center">
                <Button variant="secondary" onClick={() => void loadMore()}>
                  Cargar más
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <SpeedDivider className="mt-12" />
    </div>
  );
}