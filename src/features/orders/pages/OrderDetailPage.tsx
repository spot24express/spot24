import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { StatusTimeline } from '@/shared/components/ui/Stepper';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState } from '@/shared/components/ui/States';
import { subscribeOrder, listOrderEvents, cancelOrder, uploadReceipt } from '../services/orders.service';
import type { Order, OrderEvent } from '../types';
import { STATUS_CUSTOMER_TEXT, STATUS_LABELS, PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import { formatBs, formatUsd, maskReference } from '@/shared/lib/format';
import { userMessage } from '@/shared/lib/errors';
import { AppError } from '@/shared/lib/errors';
import { canTransition } from '@/shared/constants/orders';

/** Seguimiento en vivo: listener acotado a un documento (5.5). */
export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  useDocumentTitle('Seguimiento');
  const [order, setOrder] = useState<Order | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!orderId) return;
    const unsub = subscribeOrder(orderId, (o) => {
      setOrder(o);
      setLoaded(true);
    });
    return unsub;
  }, [orderId]);

  useEffect(() => {
    if (!orderId || !order) return;
    void listOrderEvents(orderId).then(setEvents).catch(() => setEvents([]));
  }, [orderId, order?.updatedAt]);

  if (!loaded) {
    return (
      <div className="spot-container py-8">
        <ListSkeleton />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="spot-container py-16">
        <EmptyState
          title="Pedido no encontrado"
          message="Revisa el enlace o vuelve a tus pedidos."
          action={{ label: 'Mis pedidos', onClick: () => window.location.assign('/pedidos') }}
        />
      </div>
    );
  }

  const canCancel = canTransition(order.status, 'cancelado');
  const needsReceipt = !order.payment.hasReceipt && order.payment.method !== 'efectivo' && order.status !== 'entregado' && order.status !== 'cancelado';

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadReceipt(order.id, file);
      setReceiptUrl(url);
      setReceiptOpen(true);
      toast.success('Comprobante recibido. En verificación a la brevedad.');
    } catch (e) {
      toast.error(e instanceof AppError ? e.userMessage : userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="spot-container py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="spot-title">{order.code}</h1>
          <p className="spot-subtitle mt-1">{STATUS_CUSTOMER_TEXT[order.status]}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_380px]">
        {/* TIMELINE + LÍNEAS */}
        <div className="space-y-8">
          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Seguimiento</h2>
            <div className="mt-5">
              <StatusTimeline current={order.status} events={events} />
            </div>
            {order.delivery.trackingCode && (
              <p className="mt-4 spot-label">Número de seguimiento: {order.delivery.trackingCode}</p>
            )}
          </section>

          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Artículos</h2>
            <ul className="mt-4 space-y-4">
              {order.lines.map((line) => (
                <li key={line.variantId} className="flex items-center gap-4">
                  <img src={line.image} alt={line.name} className="h-16 w-16 rounded-brand border border-line object-cover" loading="lazy" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-paper">{line.name}</p>
                    <p className="text-sm text-muted">{line.variantName} × {line.qty}</p>
                  </div>
                  <span className="font-display font-bold italic text-paper">{formatUsd(line.lineTotalUsd)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* TOTALES + PAGO + ENTREGA */}
        <aside className="space-y-6">
          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Totales</h2>
            <dl className="mt-4 space-y-2">
              <Row label="Subtotal" value={formatUsd(order.totals.subtotalUsd)} />
              <Row label="Envío" value={order.totals.shippingUsd === 0 ? 'Gratis' : formatUsd(order.totals.shippingUsd)} />
              <Row label="Total USD" value={formatUsd(order.totals.totalUsd)} strong />
              <Row label="Total Bs · tasa BCV" value={formatBs(order.totals.totalVes)} />
              <Row label="Tasa" value={`1 USD = ${formatBs(order.totals.rateUsed)}`} />
            </dl>
          </section>

          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Pago</h2>
            <p className="mt-2 text-paper">{PAYMENT_METHOD_LABELS[order.payment.method]}</p>
            {order.payment.referenceMasked && (
              <p className="mt-1 text-sm text-muted">Referencia {maskReference(order.payment.referenceMasked)}</p>
            )}
            {order.payment.verifiedAt && (
              <p className="mt-1 text-sm text-muted">
                Verificado {new Date(order.payment.verifiedAt).toLocaleString('es-VE')}
              </p>
            )}
            {needsReceipt && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  aria-label="Subir comprobante"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                  }}
                />
                <Button className="mt-4" variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
                  Subir comprobante
                </Button>
              </>
            )}
          </section>

          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Entrega</h2>
            <dl className="mt-3 space-y-2">
              <Row label="Zona" value={order.delivery.zoneName || '—'} />
              <Row
                label="Ventana"
                value={order.delivery.window.start && order.delivery.window.end ? `${order.delivery.window.start}–${order.delivery.window.end}` : 'Por confirmar'}
              />
              <Row label="Dirección" value={order.delivery.addressPreview || '—'} />
              <Row label="Contacto" value={order.contact.name} />
              <Row label="Teléfono" value={order.contact.phoneMasked} />
            </dl>
            {order.notes && <p className="mt-3 text-sm text-muted">Nota: {order.notes}</p>}
          </section>

          {canCancel && (
            <Button
              variant="danger-ghost"
              fullWidth
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await cancelOrder(order.id, 'cancelado por el cliente');
                  toast.info('Pedido cancelado. Cuando quieras, aquí estamos.');
                } catch (e) {
                  toast.error(userMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              Cancelar pedido
            </Button>
          )}
        </aside>
      </div>

      {/* Visor del comprobante subido */}
      <Modal open={receiptOpen} onClose={() => setReceiptOpen(false)} title="Comprobante">
        {receiptUrl && order.payment.method !== 'efectivo' && (
          <div>
            {/* En demo mostramos imagen local; PDFs abren en pestaña nueva */}
            <img src={receiptUrl} alt="Comprobante de pago" className="w-full rounded-brand border-2 border-line" />
            <p className="mt-3 text-sm text-muted">
              {STATUS_LABELS[order.status]} — lo revisaremos y tu pedido seguirá su curso.
            </p>
          </div>
        )}
      </Modal>

      <SpeedDivider className="mt-12" />
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right ${strong ? 'font-display text-lg font-extrabold italic text-signal' : 'text-paper'}`}>
        {value}
      </dd>
    </div>
  );
}
