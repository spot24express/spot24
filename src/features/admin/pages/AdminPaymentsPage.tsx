import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Modal } from '@/shared/components/ui/Modal';
import { StatusBadge } from '@/shared/components/ui/Badge';
import { adminListOrders, adminVerifyPayment } from '../services/admin.service';
import type { Order } from '@/features/orders/types';
import { PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import { formatBs, formatUsd } from '@/shared/lib/format';
import { userMessage } from '@/shared/lib/errors';
import { VOICE } from '@/shared/constants/brand';

/**
 * Verificación manual de pagos (5.4): visor de comprobantes, aprobar/rechazar.
 * La acción real la ejecuta fn-verifyPayment con antifraude + auditoría (6.8/6.9).
 */
export default function AdminPaymentsPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<Order | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListOrders(['pendiente', 'en_verificacion'])
      .then((o) => {
        setOrders(o);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const verify = async (approve: boolean) => {
    if (!selected) return;
    setBusy(true);
    try {
      await adminVerifyPayment(selected.id, approve, note);
      toast.success(approve ? 'Pago confirmado. El pedido entra al pit stop.' : 'Pago rechazado. Nota registrada.');
      setSelected(null);
      setNote('');
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Cola de verificación</h2>
      <p className="spot-subtitle mt-1 mb-6">
        Pagos por confirmar. Revisa el comprobante y el antifraude antes de aprobar.
      </p>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={3} />
      ) : orders.length === 0 ? (
        <EmptyState title="Cola limpia" message={VOICE.thanks} />
      ) : (
        <ul className="space-y-4">
          {orders.map((o) => (
            <li key={o.id} className="rounded-brand-lg border-2 border-line bg-surface-1 p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="font-display text-lg font-extrabold italic text-signal">{o.code}</p>
                  <p className="text-sm text-muted">
                    {PAYMENT_METHOD_LABELS[o.payment.method]} · ref {o.payment.referenceMasked || 'sin referencia'} ·{' '}
                    {formatUsd(o.totals.totalUsd)} / {formatBs(o.totals.totalVes)}
                  </p>
                  {o.riskFlags.length > 0 && (
                    <p className="mt-1 text-sm font-semibold text-signal">
                      Riesgo: {o.riskFlags.join(', ')}
                    </p>
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

      <Modal open={selected !== null} onClose={() => setSelected(null)} title={`Verificar ${selected?.code ?? ''}`} wide>
        {selected && (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3">
              <Field label="Método" value={PAYMENT_METHOD_LABELS[selected.payment.method]} />
              <Field label="Referencia" value={selected.payment.referenceMasked || '—'} />
              <Field label="Total USD" value={formatUsd(selected.totals.totalUsd)} />
              <Field label="Total Bs" value={formatBs(selected.totals.totalVes)} />
              <Field label="Contacto" value={selected.contact.name} />
              <Field label="Teléfono" value={selected.contact.phoneMasked} />
            </dl>

            {/* Visor de comprobante (Storage) */}
            <div className="rounded-brand border-2 border-line bg-ink p-4">
              <p className="spot-label mb-2">Comprobante</p>
              {selected.payment.hasReceipt ? (
                <img
                  src={`/receipts/${selected.id}/latest`} // URL firmada real la provee Storage en producción
                  alt="Comprobante"
                  className="max-h-72 w-full rounded-brand object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).replaceWith(
                      Object.assign(document.createElement('p'), {
                        textContent: 'Comprobante disponible en Storage (orders/' + selected.id + ').',
                        className: 'text-sm text-muted',
                      }),
                    );
                  }}
                />
              ) : (
                <p className="text-sm text-muted">
                  El cliente aún no sube el archivo. Solicítalo por teléfono antes de aprobar.
                </p>
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
              <Button variant="secondary" className="flex-1" loading={busy} onClick={() => void verify(false)}>
                Rechazar
              </Button>
              <Button className="flex-1" loading={busy} onClick={() => void verify(true)}>
                Confirmar pago
              </Button>
            </div>
          </div>
        )}
      </Modal>
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
