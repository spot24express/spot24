import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { adminListOrders, adminSetOrderStatus } from '../services/admin.service';
import type { Order, OrderStatus } from '@/features/orders/types';
import { STATUS_LABELS, STATUS_TRANSITIONS } from '@/shared/constants/orders';
import { userMessage } from '@/shared/lib/errors';

/**
 * Panel de despacho (5.5): cola de pedidos activos, cambio de estado con
 * máquina de transiciones del backend y notificación FCM automática al cliente.
 */
const QUEUE: OrderStatus[] = ['pagado', 'preparado', 'en_camino'];

export default function AdminDispatchPage() {
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
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {o.contact.name} · {o.contact.phoneMasked} · {o.delivery.zoneName}
                  </p>
                  <p className="mt-1 text-sm text-paper">{o.delivery.addressPreview}</p>
                  <p className="mt-1 text-sm text-muted">
                    {o.lines.length} {o.lines.length === 1 ? 'línea' : 'líneas'} · ventana {o.delivery.window.start}–{o.delivery.window.end}
                    {o.delivery.trackingCode ? ` · tracking ${o.delivery.trackingCode}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(STATUS_TRANSITIONS[o.status] ?? []).filter((s) => s !== 'cancelado').map((next) => (
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
