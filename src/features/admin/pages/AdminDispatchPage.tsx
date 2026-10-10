import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Textarea } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { adminListOrders, adminSetOrderStatus, claimDeliveryOrder, releaseDeliveryOrder } from '../services/admin.service';
import { cancelOrder } from '@/features/orders/services/orders.service';
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
 *
 * Ronda 5.15 — POLÍTICA DE CANCELACIÓN DEL DUEÑO: el cliente ya no puede
 * cancelar un pedido con pago registrado (el comprobante viaja con la orden);
 * la cancelación de pedidos ya creados es SOLO del personal y vive aquí,
 * con modal de confirmación y motivo opcional (fn-cancelOrder repone el
 * stock y notifica al cliente por push). El botón solo aparece para admin
 * y en estados cancelables según la máquina de estados.
 *
 * Ronda 5.28 — DESPACHO CON RECLAMO (decisión del dueño): cuando un pedido
 * con envío queda PREPARADO, los deliverys reciben el push «listo para salir»
 * (y gerencia/admin, informativo). En esta cola:
 * · «Tomar pedido» — SOLO delivery: una acción lo asigna y lo pasa a EN
 *   CAMINO (transacción atómica; si otro llegó primero, el backend responde
 *   «ya lo tomó {nombre}»). El botón genérico «→ En camino» desaparece para
 *   todos en pedidos con envío: tomar es del delivery.
 * · Chip «En ruta: {nombre}» — todos ven quién lleva el pedido.
 * · «Reasignar» — SOLO gerencia/admin: suelta el pedido en camino, vuelve a
 *   Preparado y re-avisa a los deliverys (modal de confirmación).
 * · Culminar (→ Entregado) es del delivery en pedidos con envío; en RETIRO EN
 *   TIENDA la operación queda como siempre (admin/cajero la culminan).
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
  // Ronda 5.15: cancelación del personal — pedido seleccionado + motivo opcional.
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  // Ronda 5.28: reasignación (gerencia/admin) — pedido en camino a soltar.
  const [reassignTarget, setReassignTarget] = useState<Order | null>(null);

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

  /* 5.28 · «Tomar pedido» (solo delivery): una acción = claim + en_camino.
   * Si otro delivery llegó primero, el backend responde «ya lo tomó X». */
  const takeOrder = async (o: Order) => {
    setBusyId(o.id);
    try {
      await claimDeliveryOrder(o.id);
      toast.success(`${o.code} es tuyo. Cliente notificado por push.`);
      load();
    } catch (e) {
      toast.error(userMessage(e));
      load(); // refresca: la cola pudo cambiar (otro lo tomó) y el toast lo dice
    } finally {
      setBusyId(null);
    }
  };

  /* 5.28 · «Reasignar» (solo gerencia/admin): suelta el claim, vuelve a
   * Preparado y re-avisa a los deliverys. */
  const doReassign = async () => {
    if (!reassignTarget) return;
    setBusyId(reassignTarget.id);
    try {
      await releaseDeliveryOrder(reassignTarget.id);
      toast.success(`${reassignTarget.code} vuelve a Preparado. Deliverys notificados.`);
      setReassignTarget(null);
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyId(null);
    }
  };

  /* Ronda 5.15: cancelar con la misma fn-cancelOrder del cliente, pero con
   * token admin — el backend detecta el rol, permite el estado, repone el
   * stock (reserva o inventario) y notifica al cliente por push. */
  const doCancel = async () => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    try {
      await cancelOrder(cancelTarget.id, cancelReason.trim() || 'cancelado por administración');
      toast.success(`${cancelTarget.code} cancelado. Cliente notificado por push.`);
      setCancelTarget(null);
      setCancelReason('');
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
                    {/* 5.28 · Quién lleva el pedido: visible para todo el personal. */}
                    {o.delivery.claimedByName && o.status === 'en_camino' && (
                      <span className="rounded-brand border-2 border-line bg-ink px-2 py-0.5 font-display text-xs font-bold italic uppercase text-paper">
                        En ruta: {o.delivery.claimedByName}
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
                      (s) => {
                        if (s === 'cancelado') return false;
                        if (
                          role !== 'admin' &&
                          !(ROLE_MOVES[role] ?? []).some(([f, t]) => f === o.status && t === s)
                        ) {
                          return false;
                        }
                        // 5.28 · En pedidos con envío, el modelo de reclamo manda:
                        // «→ En camino» ya no existe como botón genérico (se TOMA);
                        // culminar (→ Entregado) es del delivery.
                        if (o.delivery.mode !== 'pickup') {
                          if (s === 'en_camino') return false;
                          if (s === 'entregado' && role !== 'delivery') return false;
                        }
                        return true;
                      },
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
                  {/* 5.28 · «Tomar pedido» — SOLO delivery. Una acción: lo asigna
                      y sale en ruta; first-grab-wins garantizado por transacción. */}
                  {role === 'delivery' && o.status === 'preparado' && o.delivery.mode !== 'pickup' && (
                    <Button size="sm" loading={busyId === o.id} onClick={() => void takeOrder(o)}>
                      Tomar pedido
                    </Button>
                  )}
                  {/* 5.28 · «Reasignar» — SOLO gerencia/admin, sobre pedidos en
                      ruta con claim: vuelve a Preparado y re-avisa deliverys. */}
                  {(role === 'admin' || role === 'gerente') &&
                    o.status === 'en_camino' &&
                    o.delivery.mode !== 'pickup' &&
                    o.delivery.claimedByUid && (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busyId === o.id}
                        onClick={() => setReassignTarget(o)}
                      >
                        Reasignar
                      </Button>
                    )}
                  {/* POLÍTICA DEL DUEÑO (5.15): cancelar un pedido ya creado es
                      del personal (admin) y con confirmación. Visible solo en
                      estados cancelables (la máquina de estados excluye
                      en_camino y entregado: lo que salió, se entrega). */}
                  {role === 'admin' &&
                    (STATUS_TRANSITIONS[o.status] ?? []).includes('cancelado') && (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        disabled={busyId === o.id}
                        onClick={() => {
                          setCancelReason('');
                          setCancelTarget(o);
                        }}
                      >
                        Cancelar pedido
                      </Button>
                    )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Ronda 5.15: confirmación de cancelación del personal. El motivo queda
          en la línea de tiempo del pedido (auditoría) y el cliente recibe la
          notificación push de «cancelado» que envía fn-cancelOrder. */}
      <Modal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        title={`Cancelar ${cancelTarget?.code ?? ''}`}
      >
        <p className="text-body-base text-paper">
          El stock vuelve al catálogo y el cliente recibe la notificación de pedido cancelado. Esta
          acción no se deshace.
        </p>
        <Textarea
          className="mt-4"
          label="Motivo (opcional, queda en la línea de tiempo)"
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={2}
          maxLength={200}
          placeholder="Ej. cliente lo solicitó por WhatsApp, pago no acreditado…"
        />
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={() => setCancelTarget(null)}>
            No cancelar
          </Button>
          <Button
            variant="danger-ghost"
            fullWidth
            loading={cancelTarget !== null && busyId === cancelTarget.id}
            onClick={() => void doCancel()}
          >
            Sí, cancelar pedido
          </Button>
        </div>
      </Modal>

      {/* 5.28: confirmación de reasignación. El claim se borra, el pedido
          vuelve a Preparado y los deliverys reciben el aviso de nuevo; el
          cliente es notificado del cambio de estado. Queda en auditoría. */}
      <Modal
        open={reassignTarget !== null}
        onClose={() => setReassignTarget(null)}
        title={`Reasignar ${reassignTarget?.code ?? ''}`}
      >
        <p className="text-body-base text-paper">
          {reassignTarget?.delivery.claimedByName ? (
            <>
              <span className="font-bold text-signal">{reassignTarget.delivery.claimedByName}</span> lo está
              llevando.{' '}
            </>
          ) : null}
          El pedido vuelve a «Preparado», queda disponible para cualquier delivery y los deliverys
          reciben el aviso de nuevo. El cliente será notificado del cambio de estado.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={() => setReassignTarget(null)}>
            No reasignar
          </Button>
          <Button
            fullWidth
            loading={reassignTarget !== null && busyId === reassignTarget.id}
            onClick={() => void doReassign()}
          >
            Sí, reasignar
          </Button>
        </div>
      </Modal>
    </div>
  );
}
