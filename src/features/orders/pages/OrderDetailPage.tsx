import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { formatBs, usdToBs, maskReference } from '@/shared/lib/format';
import { getProductsByIds } from '@/features/catalog/services/catalog.service';
import { cleanProductName } from '@/shared/lib/display';
import { userMessage } from '@/shared/lib/errors';
import { AppError } from '@/shared/lib/errors';
import { canTransition } from '@/shared/constants/orders';

/** Seguimiento en vivo: listener acotado a un documento (5.5). */
export default function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  useDocumentTitle('Seguimiento');
  const [order, setOrder] = useState<Order | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<OrderEvent[]>([]);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [brands, setBrands] = useState<Record<string, string>>({});
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

  /* Marca visible como en el carrito: las órdenes nuevas la traen congelada
   * en cada línea; en las viejas se consulta el catálogo (1 lectura por
   * producto, tope 30 — misma política de reparación del carrito). */
  useEffect(() => {
    if (!order) return;
    const missing = [...new Set(order.lines.filter((l) => !l.brand).map((l) => l.productId))];
    if (missing.length === 0) return;
    let alive = true;
    void getProductsByIds(missing)
      .then((ps) => {
        if (!alive) return;
        const map: Record<string, string> = {};
        for (const p of ps) map[p.id] = p.brand || '';
        setBrands((prev) => ({ ...prev, ...map }));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [order?.id]);

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
          action={{ label: 'Mis pedidos', onClick: () => navigate('/pedidos') }}
        />
      </div>
    );
  }

  const canCancel = canTransition(order.status, 'cancelado');
  const needsReceipt = !order.payment.hasReceipt && order.status !== 'entregado' && order.status !== 'cancelado';
  const receiptToShow = order.payment.receiptUrl ?? null;

  /* Ronda 3: el cliente SOLO ve bolívares. Toda partida se muestra en Bs con
   * el monto oficial del servidor (subtotalVes/shippingVes/ivaVes) y, en las
   * órdenes creadas antes de esta ronda (que no traen el desglose), se
   * convierte en pantalla con la tasa exacta de la orden (rateUsed). */
  const orderRate = order.totals.rateUsed ?? 0;
  const toBs = (usd: number, official?: number): string =>
    official && official > 0 ? formatBs(official) : orderRate > 0 ? formatBs(usdToBs(usd, orderRate)) : 'Bs. —';

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const url = await uploadReceipt(order.id, file);
      setReceiptUrl(url);
      setReceiptOpen(true);
      toast.success('Comprobante recibido. En verificación a la brevedad.');
    } catch (e) {
      // Si el servidor manda un motivo accionable (formato, tamaño…), se muestra;
      // si no, el mensaje genérico de marca.
      toast.error(
        e instanceof AppError && e.message && e.message !== 'Error interno.' && e.message !== e.userMessage
          ? e.message
          : userMessage(e),
      );
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
              {order.lines.map((line) => {
                /* Key compuesta productId+variantId: en órdenes viejas varias
                   líneas comparten variantId «v1» y una key simple duplicaba. */
                /* Marca SIEMPRE arriba, sola (snapshot de la orden o catálogo
                   en órdenes viejas); el nombre no repite la marca. La variante
                   no se muestra al cliente: solo la cantidad. */
                const brand = line.brand || brands[line.productId] || '';
                const displayName = brand ? cleanProductName(line.name, brand) : line.name;
                return (
                  <li key={`${line.productId}:${line.variantId}`} className="flex items-center gap-4">
                    <img src={line.image} alt={displayName} className="h-16 w-16 rounded-brand border border-line object-cover" loading="lazy" />
                    <div className="min-w-0 flex-1">
                      {brand && <p className="spot-label">{brand}</p>}
                      <p className="truncate font-semibold text-paper">{displayName}</p>
                      <p className="text-sm text-muted">Cantidad: {line.qty}</p>
                    </div>
                    <span className="font-display font-bold italic text-paper">
                      {toBs(line.lineTotalUsd)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* TOTALES + PAGO + ENTREGA */}
        <aside className="space-y-6">
          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Totales</h2>
            <dl className="mt-4 space-y-2">
              <Row label="Subtotal" value={toBs(order.totals.subtotalUsd, order.totals.subtotalVes)} />
              <Row
                label="Envío"
                value={
                  order.totals.shippingUsd === 0
                    ? order.delivery.mode === 'pickup'
                      ? 'Retiro en tienda · Gratis'
                      : 'Gratis'
                    : toBs(order.totals.shippingUsd, order.totals.shippingVes)
                }
              />
              {(order.totals.ivaPercent ?? 0) > 0 && (
                <Row
                  label={`IVA (${String(order.totals.ivaPercent).replace('.', ',')}%)`}
                  value={toBs(order.totals.ivaUsd ?? 0, order.totals.ivaVes)}
                />
              )}
              <Row label="Total a pagar" value={formatBs(order.totals.totalVes)} strong />
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
                  accept="image/jpeg,image/png,image/webp"
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
                <p className="mt-2 text-xs text-muted">
                  Captura de pantalla del pago (JPG, PNG o WebP). Con ella verificamos más rápido.
                </p>
              </>
            )}
            {receiptToShow && (
              <Button className="mt-4" variant="ghost" onClick={() => { setReceiptUrl(receiptToShow); setReceiptOpen(true); }}>
                Ver comprobante subido
              </Button>
            )}
          </section>

          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">Entrega</h2>
            <dl className="mt-3 space-y-2">
              <Row label="Modalidad" value={order.delivery.mode === 'pickup' ? 'Retiro en tienda' : 'Envío a domicilio'} />
              {order.delivery.mode === 'pickup' ? (
                <Row label="Local" value={order.delivery.addressPreview || 'Retiro en tienda'} />
              ) : (
                <>
                  <Row label="Zona" value={order.delivery.zoneName || '—'} />
                  <Row label="Dirección" value={order.delivery.addressPreview || '—'} />
                </>
              )}
              <Row
                label="Horario de entrega"
                value={order.delivery.window.start && order.delivery.window.end ? `${order.delivery.window.start}–${order.delivery.window.end}` : 'Por confirmar'}
              />
              <Row label="Contacto" value={order.contact.name} />
              <Row label="Teléfono" value={order.contact.phoneMasked} />
            </dl>
            {order.delivery.location && (
              <a
                className="mt-3 inline-block text-sm font-semibold text-signal underline"
                href={`https://maps.google.com/?q=${order.delivery.location.lat},${order.delivery.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                Abrir ubicación GPS en Google Maps
              </a>
            )}
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
        {receiptUrl && (
          <div>
            {/* Imagen en línea; PDFs abren en pestaña nueva */}
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