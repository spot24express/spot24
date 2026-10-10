import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { AuthBackdrop } from '@/shared/components/brand/AuthBackdrop';
import { PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import { formatBs } from '@/shared/lib/format';
import { subscribeOrder } from '@/features/orders/services/orders.service';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  enableOrderNotifications,
  hasRegisteredToken,
  isPushSupported,
} from '@/features/delivery/services/notifications.service';
import type { Order } from '@/features/orders/types';

/**
 * Pantalla de éxito tras crear la orden (paso 4 dedicado desde enlaces).
 *
 * Ronda 5.27 — EL MOMENTO de pedir las notificaciones: el cliente acaba de
 * pagar y está pendiente de su pedido, pero el botón de activar solo vivía
 * en Mi cuenta (si nunca pasó por allí, el «te avisamos» se quedaba en
 * promesa vacía). Tarjeta opcional: no bloquea nada, no estorba si el
 * navegador no soporta push (iPhone sin PWA instalada) y desaparece en un
 * botón deshabilitado «Notificaciones activas» al lograrlo.
 */
export default function CheckoutSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  useDocumentTitle('Pedido confirmado');
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  // null = aún comprobando soporte/estado (no pintar nada: evita parpadeo).
  const [supported, setSupported] = useState<boolean | null>(null);
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off'>('unknown');
  const [activating, setActivating] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    return subscribeOrder(orderId, setOrder);
  }, [orderId]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const ok = await isPushSupported();
      if (cancelled) return;
      if (!ok) {
        setSupported(false);
        return;
      }
      setSupported(true);
      const on = await hasRegisteredToken(user.uid);
      if (!cancelled) setPushState(on ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleActivate = async (): Promise<void> => {
    if (!user || activating) return;
    setActivating(true);
    const ok = await enableOrderNotifications(user.uid);
    setActivating(false);
    setPushState(ok ? 'on' : 'off');
  };

  return (
    <AuthBackdrop image="/img/local-atencion.jpg">
      <div className="w-full max-w-2xl rounded-brand-lg border-2 border-signal bg-surface-1/95 p-8 text-center backdrop-blur">
        <SpeedLines className="mx-auto mb-5" animated />
        <h1 className="font-display text-3xl font-extrabold italic uppercase text-paper">
          Pedido confirmado
        </h1>
        <p className="mt-2 text-body-lg text-muted">Abierto cuando importa.</p>
        {order && (
          <>
            <div className="mt-6 rounded-brand border-2 border-line bg-ink p-5">
              <p className="spot-label">Código de pedido</p>
              <p className="mt-1 font-display text-2xl font-black italic text-signal">{order.code}</p>
            </div>
            <dl className="mt-6 space-y-2 text-left">
              <div className="flex justify-between">
                <dt className="text-muted">Total</dt>
                <dd className="font-display text-xl font-extrabold italic text-signal">
                  {formatBs(order.totals.totalVes)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Entrega</dt>
                <dd className="font-semibold text-paper">
                  {order.delivery.mode === 'pickup' ? 'Retiro en tienda' : 'Envío a domicilio'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Método</dt>
                <dd className="font-semibold text-paper">{PAYMENT_METHOD_LABELS[order.payment.method]}</dd>
              </div>
            </dl>
          </>
        )}
        {user && supported && (
          <div className="mt-6 rounded-brand border-2 border-line bg-ink p-5 text-left">
            <p className="spot-label">Te avisamos en cada paso</p>
            <p className="mt-1 text-body-base text-paper">
              Confirmamos tu pago, lo preparamos y sale en ruta: con las notificaciones activas te enteras al
              instante, sin abrir la app.
            </p>
            {pushState === 'on' ? (
              <Button className="mt-4" variant="secondary" disabled>
                Notificaciones activas
              </Button>
            ) : (
              <Button className="mt-4" onClick={() => void handleActivate()} loading={activating}>
                Activar notificaciones
              </Button>
            )}
          </div>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => navigate(orderId ? `/pedido/${orderId}` : '/pedidos')} size="lg">
            Ver mi pedido
          </Button>
          <Button variant="secondary" onClick={() => navigate('/catalogo')} size="lg">
            Seguir comprando
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted">
          Tu pago está en verificación: te avisamos con la confirmación.
        </p>
      </div>
    </AuthBackdrop>
  );
}