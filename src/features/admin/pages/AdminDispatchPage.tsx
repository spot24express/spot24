import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { Textarea } from '@/shared/components/ui/Input';
import { StatusBadge } from '@/shared/components/ui/Badge';
import {
  adminListOrders,
  adminSetOrderStatus,
  claimDeliveryOrder,
  releaseDeliveryOrder,
} from '../services/admin.service';
import { cancelOrder } from '@/features/orders/services/orders.service';
import type { Order, OrderStatus } from '@/features/orders/types';
import { STATUS_LABELS, STATUS_TRANSITIONS } from '@/shared/constants/orders';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { userMessage } from '@/shared/lib/errors';
import { formatBs, formatDateTime, usdToBs } from '@/shared/lib/format';
import { unirConPuntos } from '@/shared/lib/lineaMeta';

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
 *
 * Ronda 5.41 — HISTORIAL DE ENTREGAS (a pedido del dueño): admin, gerente y
 * delivery ya pueden ver qué pedidos se entregaron, a qué zona, quién los
 * llevó y cuándo. Pestaña «Entregadas» (el cajero no la ve: su trabajo
 * termina en Preparado):
 * · Consulta directa de Firestore con la MISMA forma de consulta que ya
 *   funciona en producción (status + createdAt) → sin índices nuevos ni
 *   backend nuevo (las reglas ya dejan leer orders al personal). Tope 60
 *   pedidos, el mismo tope de todas las colas del panel.
 * · Cada tarjeta: zona (o Retiro en tienda), «Entregó: {nombre}» — el claim
 *   del 5.28 se conserva al entregar —, fecha/hora de la entrega (deliveredAt
 *   lo fija fn-updateOrderStatus; en órdenes viejas cae a updatedAt),
 *   cliente, dirección, contenido real y total en Bs con la tasa de la orden.
 * · Chips de zona con conteo (sobre la lista cargada) y FILTRO al tocarlos:
 *   gerencia responde «¿qué se entregó y a qué zona?» de un vistazo.
 * · Para delivery: alternancia «Mías / Todas» (Mías = pedidos que él tomó y
 *   entregó). Los pedidos anteriores al reclamo 5.28 no llevan claim, así
 *   que solo aparecen bajo «Todas».
 */
const QUEUE: OrderStatus[] = ['pagado', 'preparado', 'en_camino'];

/** Roles que ven la pestaña «Entregadas» (5.41, a pedido del dueño). */
const HISTORY_ROLES: ReadonlyArray<string> = ['admin', 'gerente', 'delivery'];

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

/** Pestañas del despacho. */
type TabFilter = OrderStatus | 'todas' | 'entregadas';

/** Clave interna del chip «Retiro en tienda» en el filtro de zonas. */
const PICKUP_KEY = '__retiro__';

export default function AdminDispatchPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<TabFilter>('todas');
  // Ronda 5.15: cancelación del personal — pedido seleccionado + motivo opcional.
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  // Ronda 5.28: reasignación (gerencia/admin) — pedido en camino a soltar.
  const [reassignTarget, setReassignTarget] = useState<Order | null>(null);
  // Ronda 5.41: historial de entregas.
  const [delivered, setDelivered] = useState<Order[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [mineOnly, setMineOnly] = useState(true); // solo aplica a delivery
  const [zoneFilter, setZoneFilter] = useState<string | null>(null);

  const canSeeHistory = HISTORY_ROLES.includes(role);

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

  /* 5.41 · Historial: MISMA forma de consulta que el resto del panel
   * (status + createdAt → el índice compuesto ya existe en producción).
   * Se pide cada vez que entras a la pestaña: siempre fresco. */
  const loadDelivered = () => {
    setHistoryLoading(true);
    void adminListOrders(['entregado'])
      .then((o) => {
        setDelivered(o);
        setHistoryError(false);
      })
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  };

  const switchTab = (t: TabFilter) => {
    setFilter(t);
    setZoneFilter(null);
    if (t === 'entregadas') loadDelivered();
  };

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

  /* ── 5.41 · Derivados del historial ── */
  const mineOk = (o: Order) =>
    role !== 'delivery' || !mineOnly || o.delivery.claimedByUid === user?.uid;
  const zoneKey = (o: Order): string =>
    o.delivery.mode === 'pickup' ? PICKUP_KEY : o.delivery.zoneName || 'Sin zona';
  const zoneCounts = new Map<string, number>();
  delivered.filter(mineOk).forEach((o) => {
    const k = zoneKey(o);
    zoneCounts.set(k, (zoneCounts.get(k) ?? 0) + 1);
  });
  const deliveredVisible = delivered
    .filter(mineOk)
    .filter((o) => !zoneFilter || zoneKey(o) === zoneFilter);

  const visible = filter === 'todas' ? orders : orders.filter((o) => o.status === filter);

  const tabs: TabFilter[] = ['todas', ...QUEUE];
  if (canSeeHistory) tabs.push('entregadas');

  const chipCls = (active: boolean) =>
    `min-h-[40px] rounded-brand border-2 px-4 py-1.5 text-sm font-semibold ${
      active ? 'border-signal bg-signal/10 text-signal' : 'border-line text-paper hover:border-line-strong'
    }`;

  return (
    <div>
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Cola de despacho</h2>
      <p className="spot-subtitle mt-1 mb-4">Operación 24/7. Cada cambio de estado notifica al cliente.</p>

      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={filter === s}
            onClick={() => switchTab(s)}
            className={chipCls(filter === s)}
          >
            {s === 'todas' ? 'Todas' : s === 'entregadas' ? 'Entregadas' : STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {filter === 'entregadas' ? (
        /* ── 5.41 · HISTORIAL DE ENTREGAS ── */
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {role === 'delivery' && (
              <>
                <button
                  type="button"
                  aria-pressed={mineOnly}
                  onClick={() => setMineOnly(true)}
                  className={chipCls(mineOnly)}
                >
                  Mías
                </button>
                <button
                  type="button"
                  aria-pressed={!mineOnly}
                  onClick={() => setMineOnly(false)}
                  className={chipCls(!mineOnly)}
                >
                  Todas
                </button>
              </>
            )}
            {[...zoneCounts.entries()].map(([z, n]) => (
              <button
                key={z}
                type="button"
                aria-pressed={zoneFilter === z}
                onClick={() => setZoneFilter(zoneFilter === z ? null : z)}
                className={chipCls(zoneFilter === z)}
              >
                {z === PICKUP_KEY ? 'Retiro en tienda' : z} · {n}
              </button>
            ))}
          </div>

          {historyError ? (
            <ErrorState onRetry={loadDelivered} />
          ) : historyLoading ? (
            <ListSkeleton rows={3} />
          ) : deliveredVisible.length === 0 ? (
            <EmptyState
              title="Sin entregas en este filtro"
              message={
                role === 'delivery' && mineOnly
                  ? 'No aparece ninguna entrega tuya en los últimos pedidos. Prueba «Todas» para ver el historial completo.'
                  : 'No hay pedidos entregados que coincidan con este filtro.'
              }
            />
          ) : (
            <ul className="space-y-4">
              {deliveredVisible.map((o) => (
                <li key={o.id} className="rounded-brand-lg border-2 border-line bg-surface-1 p-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-display text-lg font-extrabold italic text-signal">{o.code}</p>
                      <StatusBadge status={o.status} />
                      {o.delivery.mode === 'pickup' ? (
                        <span className="rounded-brand border-2 border-signal px-2 py-0.5 font-display text-xs font-bold italic uppercase text-signal">
                          Retiro en tienda
                        </span>
                      ) : (
                        <span className="rounded-brand border-2 border-signal px-2 py-0.5 font-display text-xs font-bold italic uppercase text-signal">
                          Zona: {o.delivery.zoneName}
                        </span>
                      )}
                      {/* El claim del 5.28 se conserva al entregar: dice quién
                          llevó el pedido. Órdenes anteriores al 5.28: sin chip. */}
                      {o.delivery.claimedByName && (
                        <span className="rounded-brand border-2 border-line bg-ink px-2 py-0.5 font-display text-xs font-bold italic uppercase text-paper">
                          Entregó: {o.delivery.claimedByName}
                        </span>
                      )}
                    </div>
                    {/* Teléfono COMPLETO (ronda 5.9); en órdenes viejas cae al
                        enmascarado. */}
                    <p className="mt-1 text-sm text-muted">
                      {o.contact.name} · {o.contact.phone || o.contact.phoneMasked}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-paper">
                      Entregado el {formatDateTime(o.deliveredAt ?? o.updatedAt)}
                    </p>
                    {o.delivery.mode === 'pickup' ? (
                      <p className="mt-1 text-sm font-semibold text-paper">
                        El cliente pasó a buscar por tienda.
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-paper">{o.delivery.addressPreview}</p>
                    )}

                    {/* Contenido real entregado (snapshot congelado al crear). */}
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
                            {(l.brand || l.code) && (
                              /* 5.112-A: marca y código del producto (interno,
                                  SOLO personal). Órdenes viejas: solo marca. */
                              <p className="truncate text-xs text-muted">{unirConPuntos(l.brand, l.code && `Cód. ${l.code}`)}</p>
                            )}
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-paper">{lineBs(o, l.lineTotalUsd)}</p>
                        </li>
                      ))}
                    </ul>

                    {/* Total oficial de la orden en Bs (totalVes lo fija el
                        backend al crear; fallback: tasa de la orden). */}
                    <p className="mt-3 text-sm font-bold text-paper">
                      Total: {o.totals.totalVes > 0 ? formatBs(o.totals.totalVes) : lineBs(o, o.totals.totalUsd)}
                    </p>

                    {o.notes && (
                      <p className="mt-2 rounded-brand border border-line bg-ink px-3 py-2 text-sm text-paper">
                        <span className="font-bold text-signal">Nota:</span> {o.notes}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : error ? (
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
                          {(l.brand || l.code) && (
                            /* 5.112-A: marca y código del producto (interno,
                                SOLO personal). Órdenes viejas: solo marca. */
                            <p className="truncate text-xs text-muted">{unirConPuntos(l.brand, l.code && `Cód. ${l.code}`)}</p>
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
                    .concat(
                      /* 5.112.1 · Retiro en tienda: el salto del mostrador
                          (preparado → entregado) no existe en la máquina global
                          (es exclusivo de pickup). Se inyecta aquí para pintar
                          el botón; el backend lo valida con canTransitionFor. */
                      o.delivery.mode === 'pickup' && o.status === 'preparado'
                        ? (['entregado'] as OrderStatus[])
                        : [],
                    )
                    .filter(
                      (s) => {
                        if (s === 'cancelado') return false;
                        /* 5.112.1 · RETIRO EN TIENDA: «En camino» DESAPARECE del
                            flujo (nadie sale a entregarlo — antes quedaba visible
                            y el pedido seguía como envío) y el cierre es del
                            personal de caja/gerencia con el gesto «→ Retirado en
                            tienda». El delivery no ve botones en estos pedidos.
                            Legacy: un pickup viejo ya en en_camino se cierra con
                            → Entregado (la máquina base lo permite). */
                        if (o.delivery.mode === 'pickup') {
                          if (s === 'en_camino') return false;
                          if (s === 'entregado') {
                            if (!['admin', 'gerente', 'cajero'].includes(role)) return false;
                            return o.status === 'preparado' || o.status === 'en_camino';
                          }
                        } else {
                          /* 5.28 · En pedidos con envío, el modelo de reclamo
                              manda: «→ En camino» ya no existe como botón
                              genérico (se TOMA); culminar (→ Entregado) es del
                              delivery. */
                          if (s === 'en_camino') return false;
                          if (s === 'entregado' && role !== 'delivery') return false;
                        }
                        if (
                          role !== 'admin' &&
                          !(ROLE_MOVES[role] ?? []).some(([f, t]) => f === o.status && t === s)
                        ) {
                          return false;
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
                      → {next === 'entregado' && o.delivery.mode === 'pickup' ? 'Retirado en tienda' : STATUS_LABELS[next]}
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