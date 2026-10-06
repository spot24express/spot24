import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { adminSubscribeOrders, adminVerifyPayment } from '../services/admin.service';
import type { Order } from '@/features/orders/types';
import { PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import { formatBs, usdToBs } from '@/shared/lib/format';
import { AppError, userMessage } from '@/shared/lib/errors';
import { VOICE } from '@/shared/constants/brand';

/**
 * Verificación manual de pagos (5.4): visor de comprobantes, aprobar/rechazar.
 * La acción real la ejecuta fn-verifyPayment con antifraude + auditoría (6.8/6.9).
 *
 * Ronda 5i-j — la cola va EN VIVO (onSnapshot) y está separada por pago:
 * · «Cola de verificación»: SOLO pedidos con comprobante subido (pago hecho).
 *   El servidor además rehúsa aprobar sin comprobante (guardia en payments.ts).
 * · «Sin comprobante todavía»: informativa, SIN botón de aprobar. En cuanto el
 *   cliente sube el archivo (fn-uploadReceipt deja la orden en
 *   en_verificacion), el pedido entra solo a la cola de arriba.
 * · La alerta global (NewOrderAlert) avisa al personal en cualquier página.
 *
 * Ronda 5.7 — la modal muestra el contenido real del pedido, desglose,
 * entrega y notas (los datos viven congelados en el doc que crea fn-createOrder).
 *
 * Ronda 5.8 — sin variante ni SKU en las líneas: datos internos de catálogo.
 *
 * Ronda 5.9 — a pedido del dueño:
 * · Referencia COMPLETA y teléfono COMPLETO (el doc ahora los guarda en
 *   claro; en órdenes viejas cae al enmascarado).
 * · SOLO bolívares en TODA la vista (el desglose usa los montos oficiales
 *   subtotalVes/shippingVes/ivaVes y, si faltan, convierte con la tasa
 *   exacta de la orden rateUsed — mismo patrón del detalle del cliente).
 *   La única cifra mixta que queda es «Tasa BCV aplicada» (su unidad es Bs/USD).
 * · Antifraude SIEMPRE visible: si la orden no trae señales se anuncia
 *   «sin señales de riesgo» en vez de ocultar el bloque.
 * · Sin contador «(N líneas)» y sin ventana de entrega (no aporta a caja).
 */
export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  // Reintento de la suscripción en vivo (cambia la key del efecto).
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const unsub = adminSubscribeOrders(
      ['pendiente', 'en_verificacion'],
      (o) => {
        setOrders(o);
        setError(false);
        setLoading(false);
      },
      () => {
        setError(true);
        setLoading(false);
      },
    );
    return unsub;
  }, [attempt]);

  // Separación por PAGO REALIZADO (comprobante subido), no por estado: cubre
  // también órdenes viejas que quedaron «pendiente» con comprobante ya subido.
  const queue = orders.filter((o) => o.payment?.hasReceipt === true);
  const waiting = orders.filter((o) => o.payment?.hasReceipt !== true);

  const verify = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await adminVerifyPayment(selected.id, approve, note);
      toast.success(approve ? 'Pago confirmado. El pedido entra al pit stop.' : 'Pago rechazado. Nota registrada.');
      setSelected(null);
      setNote('');
      // La lista se refresca SOLA (onSnapshot): no hay recarga manual.
    } catch (e) {
      // El servidor manda el motivo real (orden ya verificada, referencia
      // duplicada, comprobante faltante…): se muestra en vez del genérico.
      toast.error(
        e instanceof AppError && e.message && e.message !== 'Error interno.' && e.message !== e.userMessage
          ? e.message
          : userMessage(e),
      );
    } finally {
      setBusy(false);
    }
  };

  const retry = () => {
    setOrders([]);
    setLoading(true);
    setAttempt((a) => a + 1);
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Cola de verificación</h2>
      <p className="spot-subtitle mt-1 mb-6">
        Compara la referencia y el monto del comprobante con tu banco antes de aprobar.
      </p>

      {error ? (
        <ErrorState onRetry={retry} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : (
        <>
          {/* ALERTA VISUAL en la propia página: franja pulsante mientras haya
              pagos por confirmar. La píldora global (NewOrderAlert) cubre el
              resto del panel; esta franja es el punto de atención aquí. */}
          {queue.length > 0 && (
            <div
              className="mb-6 flex items-center gap-3 rounded-brand border-2 border-signal bg-signal/10 px-4 py-3 animate-pulse"
              role="status"
            >
              <span className="relative flex h-3 w-3 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-signal" />
              </span>
              <p className="font-display text-sm font-bold italic uppercase text-signal">
                {queue.length} pedido{queue.length === 1 ? '' : 's'} con pago por confirmar
              </p>
            </div>
          )}

          {queue.length === 0 ? (
            <EmptyState title="Cola limpia" message={VOICE.thanks} />
          ) : (
            <ul className="space-y-4">
              {queue.map((o) => (
                <li key={o.id} className="rounded-brand-lg border-2 border-line bg-surface-1 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-display text-lg font-extrabold italic text-signal">{o.code}</p>
                      <p className="text-sm text-muted">
                        {PAYMENT_METHOD_LABELS[o.payment.method]} · ref{' '}
                        {o.payment.reference || o.payment.referenceMasked || 'sin referencia'} ·{' '}
                        {formatBs(o.totals.totalVes)}
                      </p>
                      <p className="mt-0.5 text-sm text-muted">
                        {o.lines.length} {o.lines.length === 1 ? 'producto' : 'productos'} ·{' '}
                        {o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                      </p>
                      {/* Antifraude SIEMPRE visible (ronda 5.9): si la orden
                          no trae señales, se dice en vez de ocultar el bloque. */}
                      {o.riskFlags.length > 0 ? (
                        <p className="mt-1 text-sm font-semibold text-signal">
                          Antifraude: {o.riskFlags.join(', ')}
                        </p>
                      ) : (
                        <p className="mt-1 text-sm text-muted">Antifraude: sin señales de riesgo</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={o.status} />
                      <Button variant="secondary" onClick={() => setSelected(o)}>
                        Revisar
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Sin comprobante: INFORMATIVA. No hay aprobar posible (el backend
              lo rehúsa); el pedido entra solo a la cola cuando el cliente
              suba el archivo. Sin botones: aquí solo se vigila. */}
          {waiting.length > 0 && (
            <section className="mt-10">
              <h3 className="font-display text-lg font-bold italic uppercase text-paper">
                Sin comprobante todavía ({waiting.length})
              </h3>
              <p className="spot-subtitle mt-1 mb-4">
                El cliente creó el pedido pero aún no sube el pago. En cuanto lo suba, entra solo a la cola de arriba.
              </p>
              <ul className="space-y-3">
                {waiting.map((o) => (
                  <li key={o.id} className="rounded-brand-lg border-2 border-dashed border-line bg-surface-1 p-4 opacity-80">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-display text-base font-extrabold italic text-muted">{o.code}</p>
                        <p className="text-sm text-muted">
                          {PAYMENT_METHOD_LABELS[o.payment.method]} · {formatBs(o.totals.totalVes)}
                        </p>
                        <p className="mt-0.5 text-sm text-muted">
                          {o.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}
                        </p>
                      </div>
                      <StatusBadge status={o.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={`Verificar ${selected?.code ?? ''}`} wide>
        {selected && <VerifyBody order={selected} note={note} setNote={setNote} busy={busy} onVerify={verify} />}
      </Modal>
    </div>
  );
}

/**
 * Contenido interno de la modal de verificación. Vive como componente aparte
 * para poder derivar los helpers de Bs de la orden una sola vez (ronda 5.9).
 */
function VerifyBody({
  order,
  note,
  setNote,
  busy,
  onVerify,
}: {
  order: Order;
  note: string;
  setNote: (v: string) => void;
  busy: boolean;
  onVerify: (approve: boolean) => void;
}) {
  // Montos en Bs de ESTA orden: oficiales del servidor (subtotalVes/…) y,
  // si faltan (órdenes viejas), conversión con su tasa exacta rateUsed.
  const r = order.totals.rateUsed ?? 0;
  const bs = (usd: number, official?: number): string =>
    official && official > 0 ? formatBs(official) : r > 0 ? formatBs(usdToBs(usd, r)) : 'Bs. —';
  const bsLine = (usd: number): string => (r > 0 ? formatBs(usdToBs(usd, r)) : 'Bs. —');
  const hasRisk = order.riskFlags.length > 0;

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3">
        <Field label="Método" value={PAYMENT_METHOD_LABELS[order.payment.method]} />
        {/* Referencia COMPLETA (ronda 5.9): el cajero la coteja en el banco.
            Órdenes viejas (sin el campo): caen al enmascarado. */}
        <Field label="Referencia" value={order.payment.reference || order.payment.referenceMasked || '—'} />
        <Field label="Contacto" value={order.contact.name} />
        {/* Teléfono COMPLETO (ronda 5.9): para llamar/WhatsApp al cliente. */}
        <Field label="Teléfono" value={order.contact.phone || order.contact.phoneMasked || '—'} />
      </dl>

      {/* ANTIFRAUDE (ronda 5.9): bloque siempre visible. Las señales las
          calculó el servidor al crear la orden (cuenta nueva, monto alto…);
          los duplicados de referencia se revalidan al aprobar. */}
      <div
        className={`rounded-brand border-2 p-4 ${
          hasRisk ? 'border-signal bg-signal/10' : 'border-line bg-surface-1'
        }`}
      >
        <p className="spot-label mb-1">Antifraude</p>
        <p className={`text-sm ${hasRisk ? 'font-semibold text-signal' : 'text-paper'}`}>
          {hasRisk
            ? `Señales de riesgo: ${order.riskFlags.join(', ')} — revísalo antes de aprobar.`
            : 'Sin señales de riesgo en este pedido. El servidor revalida duplicados al aprobar.'}
        </p>
      </div>

      {/* CONTENIDO DEL PEDIDO: QUÉ compró, con foto, cantidad y monto por
          línea. Es el snapshot congelado al crear la orden: los precios NO
          cambian aunque el catálogo cambie después. Sin variante ni SKU
          (ronda 5.8) ni contador de líneas (ronda 5.9). */}
      <div className="rounded-brand border-2 border-line bg-ink p-4">
        <p className="spot-label mb-3">Contenido del pedido</p>
        <ul className="space-y-3">
          {order.lines.map((l) => (
            <li key={`${l.productId}-${l.variantId}`} className="flex items-center gap-3">
              <img
                src={l.image}
                alt=""
                className="h-12 w-12 shrink-0 rounded-brand border border-line object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-paper">
                  {l.qty} × {l.name}
                </p>
                <p className="truncate text-xs text-muted">
                  {l.brand ? `${l.brand} · ` : ''}
                  {bsLine(l.unitPriceUsd)} c/u
                </p>
              </div>
              <p className="shrink-0 text-sm font-bold text-paper">{bsLine(l.lineTotalUsd)}</p>
            </li>
          ))}
        </ul>
      </div>

      {/* Desglose oficial EN BOLÍVARES (ronda 5.9): partidas con los montos
          Bs del servidor; «Tasa BCV aplicada» queda en Bs/USD (es una tasa,
          no un cobro). TOTAL con el monto oficial totalVes. */}
      <div className="rounded-brand border-2 border-line bg-surface-1 p-4">
        <p className="spot-label mb-2">Desglose</p>
        <div className="space-y-1 text-sm text-paper">
          <Row label="Subtotal" value={bs(order.totals.subtotalUsd, order.totals.subtotalVes)} />
          <Row
            label="Envío"
            value={order.totals.shippingUsd === 0 ? 'Gratis' : bs(order.totals.shippingUsd, order.totals.shippingVes)}
          />
          {(order.totals.ivaPercent ?? 0) > 0 && (
            <Row label={`IVA ${order.totals.ivaPercent ?? 0}%`} value={bs(order.totals.ivaUsd ?? 0, order.totals.ivaVes)} />
          )}
          {order.totals.rateUsed > 0 && (
            <Row
              label="Tasa BCV aplicada"
              value={`${order.totals.rateUsed.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs/USD`}
            />
          )}
          <div className="flex items-center justify-between border-t-2 border-line pt-2 font-display font-bold">
            <span>TOTAL</span>
            <span>{formatBs(order.totals.totalVes)}</span>
          </div>
        </div>
      </div>

      {/* Entrega: modalidad y zona (en delivery). SIN ventana de horario
          (ronda 5.9) y sin dirección/GPS cuando es retiro en tienda. */}
      <div className="rounded-brand border-2 border-line bg-surface-1 p-4">
        <p className="spot-label mb-2">Entrega</p>
        <p className="text-sm text-paper">
          {order.delivery.mode === 'pickup' ? (
            <span className="font-display font-bold italic uppercase text-signal">Retiro en tienda</span>
          ) : (
            `Delivery · ${order.delivery.zoneName}`
          )}
        </p>
        {order.delivery.mode !== 'pickup' && (
          <p className="mt-1 text-sm text-muted">{order.delivery.addressPreview}</p>
        )}
        {order.delivery.mode !== 'pickup' && order.delivery.location && (
          <a
            className="mt-1 inline-block text-sm font-semibold text-signal underline"
            href={`https://maps.google.com/?q=${order.delivery.location.lat},${order.delivery.location.lng}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir ubicación GPS del cliente
          </a>
        )}
      </div>

      {/* Notas del cliente (puede estar vacía: nada que mostrar). */}
      {order.notes && (
        <div className="rounded-brand border-2 border-line bg-surface-1 p-4">
          <p className="spot-label mb-1">Notas del cliente</p>
          <p className="text-sm text-paper">{order.notes}</p>
        </div>
      )}

      {/* Visor de comprobante (imgbb vía fn-uploadReceipt). Esta modal
          SOLO se abre desde la cola (comprobante garantizado): la rama
          «sin archivo» queda como defensa por si hay datos viejos. */}
      <div className="rounded-brand border-2 border-line bg-ink p-4">
        <p className="spot-label mb-2">Comprobante</p>
        {order.payment.hasReceipt && order.payment.receiptUrl ? (
          <a href={order.payment.receiptUrl} target="_blank" rel="noreferrer">
            <img
              src={order.payment.receiptUrl}
              alt="Comprobante de pago"
              className="max-h-72 w-full rounded-brand object-contain"
            />
          </a>
        ) : order.payment.hasReceipt ? (
          <p className="text-sm text-muted">Comprobante archivado en Storage (orders/{order.id}).</p>
        ) : (
          <p className="text-sm text-muted">Comprobante no disponible.</p>
        )}
      </div>

      <textarea
        aria-label="Nota de verificación"
        placeholder="Nota interna (opcional, sin datos personales)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        className="w-full rounded-brand border-2 border-line bg-surface-1 px-4 py-3 text-paper focus:border-signal focus:outline-none"
      />

      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" loading={busy} onClick={() => onVerify(false)}>
          Rechazar
        </Button>
        <Button className="flex-1" loading={busy} onClick={() => onVerify(true)}>
          Confirmar pago
        </Button>
      </div>
    </div>
  );
}

/** Fila del desglose de montos. */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-brand border border-line bg-ink p-3">
      <dt className="spot-label">{label}</dt>
      <dd className="mt-0.5 font-semibold text-paper">{value}</dd>
    </div>
  );
}