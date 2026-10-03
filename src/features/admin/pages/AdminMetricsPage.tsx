import { useEffect, useState } from 'react';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { BigFigure } from '@/shared/components/ui/PriceTag';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { Button } from '@/shared/components/ui/Button';
import {
  adminGetMetrics, adminGetBcvRate, type AdminMetrics, type BcvRateInfo,
} from '../services/admin.service';
import { STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@/shared/constants/orders';
import { formatUsd } from '@/shared/lib/format';

/**
 * Métricas básicas de ventas y pedidos (5.6), calculadas en el backend.
 * La tarjeta «Tasa BCV» vive aquí y se muestra SIEMPRE (aunque fn-getAdminMetrics
 * no responda: en local esa función no existe, solo corre en producción).
 */
export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [error, setError] = useState(false);
  // Tasa BCV: undefined = cargando · null = sin doc todavía · objeto = publicada.
  const [rate, setRate] = useState<BcvRateInfo | null | undefined>(undefined);

  const load = () => {
    setError(true);
    void adminGetMetrics()
      .then((m) => {
        setMetrics(m);
        setError(false);
      })
      .catch(() => setError(true));
  };

  const loadRate = () => {
    setRate(undefined);
    void adminGetBcvRate()
      .then(setRate)
      .catch(() => setRate(null));
  };

  useEffect(load, []);
  useEffect(loadRate, []);

  const maxDay = metrics ? Math.max(1, ...metrics.ordersLast7d) : 1;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold italic uppercase text-paper">Métricas</h2>
        <p className="spot-subtitle mt-1">Pedidos por estado y ventas agregadas por el servidor.</p>
      </div>

      {/* Tasa BCV — SIEMPRE visible, independiente de las métricas */}
      <section aria-labelledby="bcv-metrics">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 id="bcv-metrics" className="spot-title text-xl">Tasa BCV</h3>
          <Button variant="secondary" size="sm" onClick={loadRate}>
            Actualizar
          </Button>
        </div>
        <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          {rate === undefined ? (
            <p className="spot-label">Cargando tasa…</p>
          ) : rate === null ? (
            <p className="spot-label">
              Aún no publicada. Se activa sola con el próximo deploy: la tasa se captura cada hora y
              entra en vigor a las 12:00 AM del día siguiente.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="spot-label">Tasa vigente (Bs por USD)</p>
                  <BigFigure>{rateText(rate.usdToVes)}</BigFigure>
                  <p className="mt-1 spot-label">Fecha valor: {fmtFechaValor(rate.fechaValor)}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="spot-label">
                    {rate.lastAttemptAt > 0
                      ? `Último intento: ${new Date(rate.lastAttemptAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'Sin intentos aún'}
                  </p>
                  <p className="mt-1 spot-label">
                    {rate.source === 'bcv.org.ve'
                      ? 'Resultado: capturada de bcv.org.ve (oficial)'
                      : 'Resultado: el BCV no respondió — se mantiene la tasa vigente'}
                  </p>
                  <p className="mt-1 spot-label">
                    {rate.updatedAt > 0
                      ? `Tasa vigente desde: ${new Date(rate.updatedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'Sin lectura aún'}
                  </p>
                </div>
              </div>
              {rate.nextUsdToVes > 0 && (
                <div className="mt-4 rounded-brand border-2 border-line bg-ink p-4">
                  <p className="spot-label">
                    Nueva tasa pendiente
                    {rate.nextCapturedAt > 0
                      ? ` (capturada el ${new Date(rate.nextCapturedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`
                      : ''}{' '}
                    · fecha valor {fmtFechaValor(rate.nextFechaValor)}:{' '}
                    <span className="font-display font-bold text-paper">{rateText(rate.nextUsdToVes)}</span>{' '}
                    — se activa sola a las 12:00 AM.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Métricas del servidor: en local la función no existe (aviso normal). */}
      {!metrics ? (
        error ? (
          <ErrorState
            onRetry={load}
            message="Las métricas las calcula fn-getAdminMetrics en el servidor. En local esa función no existe (normal): funcionará tras el deploy."
          />
        ) : (
          <ListSkeleton rows={4} />
        )
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}

/** Formatea la tasa al estilo venezolano: 36,58 */
function rateText(usdToVes: number): string {
  if (!(usdToVes > 0)) return '—';
  return usdToVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «2026-09-29» → «Martes, 29 de septiembre de 2026» (— si viene vacía). */
function fmtFechaValor(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}