import { useEffect, useState } from 'react';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { BigFigure } from '@/shared/components/ui/PriceTag';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { adminGetMetrics, type AdminMetrics } from '../services/admin.service';
import { STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@/shared/constants/orders';
import { formatUsd } from '@/shared/lib/format';

/** Métricas básicas de ventas y pedidos (5.6), calculadas en el backend. */
export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState(false);

  const load = () => {
    setError(true);
    void adminGetMetrics()
      .then((m) => {
        setMetrics(m);
        setError(false);
      })
      .catch(() => setError(true));
  };

  useEffect(load, []);

  if (error && !metrics) {
    return (
      <div className="space-y-4">
        <ErrorState onRetry={load} message="Las métricas las calcula fn-getAdminMetrics en el servidor." />
      </div>
    );
  }

  if (!metrics) {
    return <ListSkeleton rows={4} />;
  }

  const maxDay = Math.max(1, ...metrics.ordersLast7d);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold italic uppercase text-paper">Métricas</h2>
        <p className="spot-subtitle mt-1">Pedidos por estado y ventas agregadas por el servidor.</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <p className="spot-label">Ventas 30 días</p>
          <BigFigure tone="signal">{formatUsd(metrics.revenueUsd30d).replace('US$', '$')}</BigFigure>
        </div>
        <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <p className="spot-label">Pedidos totales</p>
          <BigFigure>
            {Object.values(metrics.ordersByStatus).reduce((a, b) => a + b, 0)}
          </BigFigure>
        </div>
        <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <p className="spot-label">En ruta ahora</p>
          <BigFigure>{metrics.ordersByStatus['en_camino'] ?? 0}</BigFigure>
        </div>
      </div>

      {/* Por estado */}
      <section aria-labelledby="status-metrics">
        <h3 id="status-metrics" className="mb-4 spot-title text-xl">Pedidos por estado</h3>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {ORDER_STATUSES.filter((s): s is OrderStatus => s !== 'entregado' || true).map((s) => (
            <li key={s} className="rounded-brand-lg border-2 border-line bg-surface-1 p-4">
              <p className="spot-label">{STATUS_LABELS[s]}</p>
              <p className="mt-1 font-display text-3xl font-extrabold italic text-paper">
                {metrics.ordersByStatus[s] ?? 0}
              </p>
            </li>
          ))}
        </ul>
      </section>

      {/* Últimos 7 días */}
      <section aria-labelledby="week-metrics">
        <h3 id="week-metrics" className="mb-4 spot-title text-xl">Pedidos últimos 7 días</h3>
        <div className="flex h-40 items-end gap-3 rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          {metrics.ordersLast7d.map((n, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`w-full rounded-t-brand ${i === metrics.ordersLast7d.length - 1 ? 'bg-signal' : 'bg-surface-3'}`}
                style={{ height: `${Math.max(6, (n / maxDay) * 100)}%` }}
                role="img"
                aria-label={`${n} pedidos`}
              />
              <span className="spot-label">{['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'][(new Date().getDay() - (metrics.ordersLast7d.length - 1 - i) + 7) % 7]}</span>
            </div>
          ))}
        </div>
      </section>

      <SpeedLines />
    </div>
  );
}
