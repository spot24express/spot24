import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { listMyOrders } from '../services/orders.service';
import type { Order } from '../types';
import type { Page } from '@/shared/types';
import { VOICE } from '@/shared/constants/brand';
import { formatBs, formatUsd } from '@/shared/lib/format';
import { useAuth } from '@/features/auth/hooks/useAuth';

/** Mis pedidos con paginación por cursor (7.1). */
export default function MyOrdersPage() {
  useDocumentTitle('Mis pedidos');
  const { user } = useAuth();
  const [page, setPage] = useState<Page<Order> | null>(null);
  const [all, setAll] = useState<Order[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void listMyOrders(null)
      .then((p) => {
        if (!alive) return;
        setAll(p.items);
        setPage(p);
      })
      .catch(() => alive && setError(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [user?.uid]);

  const loadMore = async () => {
    if (!page?.hasMore || !page.cursor) return;
    const next = await listMyOrders(page.cursor);
    setAll((prev) => [...prev, ...next.items]);
    setPage(next);
  };

  return (
    <div className="spot-container py-8">
      <h1 className="spot-title">Mis pedidos</h1>
      <p className="spot-subtitle mt-1">Sigue cada parada en vivo.</p>

      <div className="mt-8">
        {error ? (
          <ErrorState onRetry={() => window.location.reload()} />
        ) : loading ? (
          <ListSkeleton />
        ) : all.length === 0 ? (
          <EmptyState
            title="Sin pedidos todavía"
            message={VOICE.emptyOrders}
            action={{ label: 'Explorar catálogo', onClick: () => window.location.assign('/catalogo') }}
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
                        {formatUsd(o.totals.totalUsd)}{' '}
                        <span className="text-sm font-medium not-italic text-muted">{formatBs(o.totals.totalVes)}</span>
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {page?.hasMore && (
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
