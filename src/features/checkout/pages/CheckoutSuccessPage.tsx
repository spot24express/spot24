import { useParams } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import { formatBs, formatUsd } from '@/shared/lib/format';
import { demoGetOrder } from '@/features/orders/services/orders.service';

/** Pantalla de éxito tras crear la orden (paso 4 dedicado desde enlaces). */
export default function CheckoutSuccessPage() {
  const { orderId } = useParams<{ orderId: string }>();
  useDocumentTitle('Pedido confirmado');
  const order = orderId ? demoGetOrder(orderId) : null;

  return (
    <div className="spot-container py-12">
      <div className="mx-auto max-w-2xl rounded-brand-lg border-2 border-signal bg-surface-1 p-8 text-center">
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
                  {formatUsd(order.totals.totalUsd)} · {formatBs(order.totals.totalVes)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Método</dt>
                <dd className="font-semibold text-paper">{PAYMENT_METHOD_LABELS[order.payment.method]}</dd>
              </div>
            </dl>
          </>
        )}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={() => window.location.assign(orderId ? `/pedido/${orderId}` : '/pedidos')} size="lg">
            Ver mi pedido
          </Button>
          <Button variant="secondary" onClick={() => window.location.assign('/catalogo')} size="lg">
            Seguir comprando
          </Button>
        </div>
      </div>
    </div>
  );
}
