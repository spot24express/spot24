import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { adminListOrders, adminSetOrderStatus } from '../services/admin.service';
import type { Order, OrderStatus } from '@/features/orders/types';
import { STATUS_LABELS, STATUS_TRANSITIONS } from '@/shared/constants/orders';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { userMessage } from '@/shared/lib/errors';
import { formatBs, usdToBs } from '@/shared/lib/format';

/**
 * Panel de despacho (5.5): cola de pedidos activos, cambio de estado con
 * máquina de transiciones del backend y notificación FCM automática al cliente.
 * Los botones se filtran por rol (el backend re-valida): cajero prepara,
 * delivery lleva y entrega, admin puede todo.
 *
 * Ronda 5.7 — cada pedido lista su contenido real (el snapshot congelado por
 * fn-createOrder), las notas del cliente y distingue RETIRO EN TIENDA de
 * delivery (sin dirección/GPS si es retiro).
 *
 * Ronda 5.8 — sin variante ni SKU en las líneas: datos internos de catálogo.
 *
 * Ronda 5.9 — a pedido del dueño:
 * · Teléfono COMPLETO del cliente (el doc ahora lo guarda en claro; en
 *   órdenes viejas cae al enmascarado) para llamar/WhatsApp.
 * · Montos de las líneas SOLO en bolívares: se convierten con la tasa exacta
 *   de la orden (rateUsed, congelada al crearla — la misma que pagó el cliente).
 * · Sin ventana de horario (no aporta al repartidor; la zona y la dirección
 *   sí). El tracking se conserva cuando existe.
 */
const QUEUE: OrderStatus[] = ['pagado', 'preparado', 'en_camino'];

/** Botones visibles por rol además de las transiciones válidas. */
const ROLE_MOVES: Partial<Record<string, ReadonlyArray<readonly [OrderStatus, OrderStatus]>>> = {
  cajero: [
    ['pendiente', 'en_verificacion'], ['en_verificacion', 'pagado'], ['pagado', 'preparado'],
  ],
  delivery: [['preparado', 'en_camino'], ['en_camino', 'entregado']],
};

/** Monto de una línea en Bs con la tasa EXACTA de la orden (rateUsed). */
function lineBs(o: Order, usd: number): string {
  const r = o.totals.rateUsed ?? 0;
  return r > 0 ? formatBs(usdToBs(usd, r)) : 'Bs. —';
}

export default function AdminDispatchPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<OrderStatus | 'todas'>('todas');

  const load = () => {
    setLoading(true);
    void adminListOrders([...QUEUE, 'pendiente', 'en_verificacion'])
      .then((o) => {
        setOrders(o);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const advance = async (o: Order, to: OrderStatus) => {
    setBusyId(o.id);
    try {
      await adminSetOrderStatus(o.id, to, '');
      toast.success(`${o.code} → ${STATUS_LABELS[to]}. Cliente notificado por push.`);
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  const visible = filter === 'todas' ? orders : orders.filter((o) => o.status === filter);

  return (
    <div>
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Cola de despacho</h2>
      <p className="spot-subtitle mt-1 mb-4">Operación 24/7. Cada cambio de estado notifica al cliente.</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {(['todas', ...QUEUE] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => setFilter(s as OrderStatus | 'todas')}
            className={`min-h-[40px] rounded-brand border-2 px-4 py-1.5 text-sm font-semibold ${
              filter === s ? 'border-signal bg-signal/10 text-signal' : 'border-line text-paper hover:border-line-strong'
            }`}
          >
            {s === 'todas' ? 'Todas' : STATUS_LABELS[s as OrderStatus]}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : visible.length === 0 ? (
        <EmptyState title="Bahía despejada" message="No hay pedidos en esta cola ahora mismo." />
      ) : (
        <ul className="space-y-4">
          {visible.map((o) => (
            <li key={o.id} className="rounded-brand-lg border-2 border-line bg-surface-1 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-display text-lg font-extrabold italic text-signal">{o.code}</p>
                    <StatusBadge status={o.status} />
                    {o.delivery.mode === 'pickup' && (
                      <span className="rounded-brand border-2 border-signal px-2 py-0.5 font-display text-xs font-bold italic uppercase text-signal">
                        Retiro en tienda
                      </span>
                    )}
                  </div>
                  {/* Teléfono COMPLETO (ronda 5.9) para llamar/WhatsApp al
                      cliente; en órdenes viejas cae al enmascarado. */}
                  <p className="mt-1 text-sm text-muted">
                    {o.contact.name} · {o.contact.phone || o.contact.phoneMasked}
                    {o.delivery.mode !== 'pickup' ? ` · ${o.delivery.zoneName}` : ''}
                  </p>
                  {o.delivery.mode === 'pickup' ? (
                    <p className="mt-1 text-sm font-semibold text-paper">
                      El cliente pasa a buscar por tienda.
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-sm text-paper">{o.delivery.addressPreview}</p>
                      {o.delivery.location && (
                        <a
                          className="mt-1 inline-block text-sm font-semibold text-signal underline"
                          href={`https://maps.google.com/?q=${o.delivery.location.lat},${o.delivery.location.lng}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Abrir ubicación GPS del cliente
                        </a>
                      )}
                      {/* Tracking sin ventana de horario (ronda 5.9). */}
                      {o.delivery.trackingCode && (
                        <p className="mt-1 text-sm text-muted">tracking {o.delivery.trackingCode}</p>
                      )}
                    </>
                  )}

                  {/* CONTENIDO REAL DEL PEDIDO (ronda 5.7): el snapshot
                      congelado al crear la orden. El delivery necesita saber
                      QUÉ y CUÁNTOS artículos buscar y entregar. Montos en Bs
                      con la tasa de la orden (ronda 5.9), sin variante/SKU. */}
                  <ul className="mt-3 space-y-2 border-t-2 border-line pt-3">
                    {o.lines.map((l) => (
                      <li key={`${l.productId}-${l.variantId}`} className="flex items-center gap-3">
                        <img
                          src={l.image}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-brand border border-line object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-paper">
                            {l.qty} × {l.name}
                          </p>
                          {l.brand && (
                            <p className="truncate text-xs text-muted">{l.brand}</p>
                          )}
                        </div>
                        <p className="shrink-0 text-sm font-semibold text-paper">{lineBs(o, l.lineTotalUsd)}</p>
                      </li>
                    ))}
                  </ul>

                  {/* Notas del cliente (instrucciones de entrega, referencias). */}
                  {o.notes && (
                    <p className="mt-2 rounded-brand border border-line bg-ink px-3 py-2 text-sm text-paper">
                      <span className="font-bold text-signal">Nota:</span> {o.notes}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(STATUS_TRANSITIONS[o.status] ?? [])
                    .filter(
                      (s) =>
                        s !== 'cancelado' &&
                        (role === 'admin' ||
                          (ROLE_MOVES[role] ?? []).some(([f, t]) => f === o.status && t === s)),
                    )
                    .map((next) => (
                    <Button
                      key={next}
                      size="sm"
                      loading={busyId === o.id}
                      onClick={() => void advance(o, next)}
                    >
                      → {STATUS_LABELS[next]}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}