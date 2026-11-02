import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { toast } from '@/shared/lib/toast';
import { logger } from '@/shared/lib/logger';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { adminSubscribeOrders } from '../services/admin.service';
import type { Order } from '@/features/orders/types';
import { PAYMENT_REQUIRES_RECEIPT } from '@/shared/constants/orders';

/**
 * Alerta global de pedidos nuevos para quien verifica pagos
 * (admin / gerente / cajero) — ronda 5i-j, endurecida en 5i-l.
 *
 * Montada en RootLayout: funciona en TODA la app (tienda incluida), no solo
 * dentro del panel. Antes vivía en AdminLayout y el personal que estaba
 * mirando la tienda no se enteraba de nada.
 *
 * · Píldora flotante con punto pulsante → lleva a /admin/pagos. Aparece
 *   SIEMPRE que haya pedidos con comprobante por verificar (no hace falta
 *   esperar un pedido «nuevo»).
 * · Toast al entrar un pedido nuevo a la cola (el 1.er snapshot no tostea:
 *   si el personal abre la app después de creado el pedido, lo que avisa es
 *   la píldora, no el toast).
 * · Contador en el título de la pestaña: visible aunque la pestaña esté de
 *   fondo. Prefija el título de la página actual (antes forzaba el del panel).
 * · Ronda 5i-l — NUNCA MÁS SILENCIOSO: si la suscripción en vivo cae
 *   (reglas/índices sin desplegar, red), antes el error se tragaba y el
 *   personal creía que «no hay pedidos». Ahora hay chip ámbar de
 *   «Alerta sin conexión» con botón Reintentar y auto-reintentos.
 *
 * · Ronda 5.114 · SEGUNDO RADAR: los PAGADOS POR EL BANCO (pago móvil
 *   automático, ronda 5.113) nacen 'pagado' sin comprobante y sin pasar por
 *   la cola de verificación — hasta hoy NINGÚN aviso del personal los veía.
 *   Píldora propia «N pedidos pagados por preparar» → /admin/despacho, donde
 *   la cola ya lista los 'pagado' y se marcan PREPARADO. El push FCM del
 *   aviso lo envía el backend (sendPaidAlert 5.114 → notifications.ts); esta
 *   pieza cubre la app abierta en pantalla (PC/tablet).
 *
 * El push FCM sigue siendo SOLO del cliente dueño de la orden (por diseño):
 * esta pieza es la alerta visual del PERSONAL, sin notificaciones push.
 */
const VERIFIER_ROLES: readonly string[] = ['admin', 'gerente', 'cajero'];
/** Reintentos automáticos ante caída de la suscripción (luego queda manual). */
const MAX_AUTO_RETRIES = 3;

export function NewOrderAlert() {
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const active = VERIFIER_ROLES.includes(role);

  const [queue, setQueue] = useState<Order[]>([]);
  // 5.114 · Cola de PAGADOS POR EL BANCO (radar aparte del de verificación).
  const [paidQueue, setPaidQueue] = useState<Order[]>([]);
  const [failed, setFailed] = useState(false);
  // Intento de suscripción actual (cambiarlo re-crea el listener).
  const [attempt, setAttempt] = useState(0);
  // Ids ya vistos: null = primer snapshot (solo registro, SIN toasts).
  const seenIds = useRef<Set<string> | null>(null);
  // Título base capturado (sin el prefijo «(N) ») para restaurar limpio.
  const baseTitle = useRef<string | null>(null);

  useEffect(() => {
    if (!active) return;
    let unsub: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    const handleError = (e: unknown) => {
      if (cancelled) return;
      // Visible en consola con el código real (failed-precondition = falta el
      // índice compuesto; permission-denied = reglas sin desplegar).
      logger.error('[NewOrderAlert] alerta en vivo caída:', e);
      setFailed(true);
      // Auto-reintento con espera creciente (8 s, 16 s, 24 s): cubre cortes
      // de red y despliegues a medias sin martillar Firestore.
      if (attempt < MAX_AUTO_RETRIES) {
        retryTimer = setTimeout(() => {
          if (!cancelled) setAttempt((a) => a + 1);
        }, 8000 * (attempt + 1));
      }
    };

    unsub = adminSubscribeOrders(
      ['pendiente', 'en_verificacion', 'pagado'],
      (orders) => {
        // (5.80) Pedidos ACCIONABLES: con comprobante por verificar O de
        // contra entrega (efectivo/punto de venta — no suben comprobante,
        // se cobran al recibir; igual necesitan que el personal los mire).
        // 5.114 · Los 'pagado' salen de ESTE radar (la cola de /admin/pagos
        // nunca los lista): si quedaran aquí, la píldora contaría algo que
        // no está en la cola a la que lleva.
        const q = orders.filter(
          (o) =>
            o.status !== 'pagado' &&
            (o.payment?.hasReceipt === true ||
              PAYMENT_REQUIRES_RECEIPT[o.payment?.method ?? 'pago_movil'] === false),
        );
        // (5.114) PAGADOS POR EL BANCO: el pago móvil automático nace 'pagado'
        // sin comprobante y sin verificación — es OTRA acción (PREPARAR, no
        // verificar). Un 'pagado' manual lleva comprobante (el cajero lo
        // aprobó) → queda fuera: ya lo vio el personal al aprobarlo.
        const paid = orders.filter(
          (o) =>
            o.status === 'pagado' &&
            o.payment?.hasReceipt !== true &&
            PAYMENT_REQUIRES_RECEIPT[o.payment?.method ?? 'pago_movil'] === true,
        );
        const ids = new Set([...q, ...paid].map((o) => o.id));
        if (seenIds.current !== null) {
          for (const o of paid) {
            if (!seenIds.current.has(o.id)) {
              toast.info(`Nuevo pedido ${o.code} · pagado por el banco — prepáralo en despacho`);
            }
          }
          for (const o of q) {
            if (!seenIds.current.has(o.id)) {
              toast.info(
                o.payment?.hasReceipt === true
                  ? `Nuevo pedido ${o.code} por verificar`
                  : `Nuevo pedido ${o.code} · pago al recibir`,
              );
            }
          }
        }
        seenIds.current = ids;
        setQueue(q);
        setPaidQueue(paid);
        setFailed(false); // la suscripción volvió: se apaga el chip de error
      },
      handleError,
    );

    return () => {
      cancelled = true;
      unsub?.();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [active, attempt]);

  // 5.114 · Radar total: verificación + pagados por preparar.
  const totalRadar = queue.length + paidQueue.length;

  // Contador en el título de la pestaña (funciona en cualquier página:
  // prefija el título vigente en vez de imponer el del panel).
  useEffect(() => {
    if (!active) return;
    if (totalRadar > 0) {
      const base = document.title.replace(/^\(\d+\)\s*/, '');
      baseTitle.current = base;
      document.title = `(${totalRadar}) ${base}`;
    } else if (baseTitle.current !== null) {
      document.title = baseTitle.current;
      baseTitle.current = null;
    }
    return () => {
      if (baseTitle.current !== null) {
        document.title = baseTitle.current;
        baseTitle.current = null;
      }
    };
  }, [active, totalRadar]);

  const manualRetry = () => {
    setFailed(false);
    setAttempt((a) => a + 1);
  };

  return (
    <>
      {/* Chip de diagnóstico (ronda 5i-l): si la cola en vivo cae, el personal
          lo SABE en vez de creer que la cola está limpia. */}
      {failed && (
        <div
          role="alert"
          className="fixed bottom-[196px] left-4 z-40 flex items-center gap-2 rounded-brand border-2 border-ink bg-amber-500 px-3 py-2 shadow-lg sm:bottom-[132px]"
        >
          <p className="font-display text-xs font-bold italic uppercase text-ink">
            Alerta en vivo sin conexión
          </p>
          <button
            type="button"
            onClick={manualRetry}
            className="min-h-[32px] rounded-brand border-2 border-ink bg-ink px-2 font-display text-xs font-bold italic uppercase text-paper transition hover:scale-105 active:scale-95"
          >
            Reintentar
          </button>
        </div>
      )}

      {active && queue.length > 0 && (
        <NavLink
          to="/admin/pagos"
          className="fixed bottom-[76px] left-4 z-40 inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-signal px-4 py-3 font-display text-sm font-bold italic uppercase text-paper shadow-lg transition hover:scale-105 active:scale-95 sm:bottom-6"
          aria-label={`${queue.length} pedido${queue.length === 1 ? '' : 's'} por verificar, abrir cola de pagos`}
        >
          <span className="relative flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-paper opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-paper" />
          </span>
          {queue.length} pedido{queue.length === 1 ? '' : 's'} por verificar
        </NavLink>
      )}

      {/* 5.114 · Radar de PAGADOS POR EL BANCO: el pago móvil automático nace
          'pagado' y no entra en la cola de verificación. Píldora propia que
          abre el panel de despacho (ahí se marca PREPARADO). */}
      {active && paidQueue.length > 0 && (
        <NavLink
          to="/admin/despacho"
          className="fixed bottom-[136px] left-4 z-40 inline-flex items-center gap-2.5 rounded-full border-2 border-ink bg-signal px-4 py-3 font-display text-sm font-bold italic uppercase text-paper shadow-lg transition hover:scale-105 active:scale-95 sm:bottom-[76px]"
          aria-label={`${paidQueue.length} pedido${paidQueue.length === 1 ? '' : 's'} pagado${paidQueue.length === 1 ? '' : 's'} por preparar, abrir panel de despacho`}
        >
          <span className="relative flex h-3 w-3" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-paper opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-paper" />
          </span>
          {paidQueue.length} pedido{paidQueue.length === 1 ? '' : 's'} pagado{paidQueue.length === 1 ? '' : 's'} por preparar
        </NavLink>
      )}
    </>
  );
}
