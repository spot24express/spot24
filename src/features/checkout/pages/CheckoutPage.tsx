/**
 * Checkout en pasos: Datos → Entrega → Pago → Confirmación (5.4).
 * · Reserva de stock 2 h al entrar (callable fn-reserveStock).
 * · Cotización autoritativa por zona/peso y monto en Bs (callable fn-quoteTotals).
 * · La orden la crea EXCLUSIVAMENTE la Cloud Function fn-createOrder con App
 *   Check e idempotencia: el cliente nunca escribe en orders ni calcula montos.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input, Select, Textarea } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { EmptyState } from '@/shared/components/ui/States';
import { useCart } from '@/features/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useZones } from '@/features/delivery/hooks/useZones';
import { reserveStock, quoteTotals, createOrder } from '../services/checkout.service';
import { buildIdempotencyKey } from '../lib/idempotency';
import { useBcvRate } from '@/features/catalog/hooks/useCatalog';
import {
  PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_INSTRUCTIONS,
} from '@/shared/constants/orders';
import { VE_BANKS, DEFAULT_PAYMENT_ACCOUNTS, BRAND } from '@/shared/constants/brand';
import {
  isValidPersonName, isValidCedulaVE, isValidPhoneVE, isValidEmail,
  isValidPaymentReference, normalizeCedulaVE, normalizePhoneVE, sanitizeMultiline, sanitizeText,
} from '@/shared/lib/validation';
import { userMessage, AppError } from '@/shared/lib/errors';
import { trackEvent } from '@/shared/lib/analytics';
import { formatBs, formatUsd } from '@/shared/lib/format';
import type { CreateOrderResponse, QuoteResponse, ReservationResponse } from '../types';
import type { PaymentMethod } from '@/shared/constants/orders';

const STEPS = ['Datos', 'Entrega', 'Pago', 'Confirmación'] as const;

interface ContactForm {
  name: string; cedula: string; phone: string;
}
interface AddressForm {
  zoneId: string; state: string; city: string; details: string; notes: string;
}
interface PaymentForm {
  method: PaymentMethod;
  banco: string; cedula: string; telefono: string; referencia: string; fecha: string;
  bancoOrigen: string; referenciaTransferencia: string;
  correoZelle: string; referenciaZelle: string;
}

export default function CheckoutPage() {
  useDocumentTitle('Checkout');
  const navigate = useNavigate();
  const { items, clear, isEmpty } = useCart();
  const { user } = useAuth();
  const { data: zones } = useZones();
  const { data: rate } = useBcvRate();

  const [step, setStep] = useState(0);
  const [contact, setContact] = useState<ContactForm>({ name: '', cedula: '', phone: '' });
  const [address, setAddress] = useState<AddressForm>({ zoneId: '', state: '', city: '', details: '', notes: '' });
  const [payment, setPayment] = useState<PaymentForm>({
    method: 'pago_movil', banco: '', cedula: '', telefono: '', referencia: '', fecha: '',
    bancoOrigen: '', referenciaTransferencia: '', correoZelle: '', referenciaZelle: '',
  });
  const [reservation, setReservation] = useState<ReservationResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<CreateOrderResponse | null>(null);

  // Reserva de stock 2 h al entrar al checkout (5.2).
  useEffect(() => {
    if (isEmpty) return;
    let alive = true;
    void reserveStock(
      items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
    )
      .then((res) => {
        if (alive) setReservation(res);
      })
      .catch(() => {
        // La reserva se reintentará al confirmar; no bloquea el flujo.
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datos precargados del perfil.
  useEffect(() => {
    if (user) {
      setContact((c) => ({ ...c, name: user.name || c.name, phone: user.phone ?? c.phone }));
    }
  }, [user]);

  // Cotización autoritativa al elegir zona.
  const zone = zones?.find((z) => z.id === address.zoneId) ?? null;
  useEffect(() => {
    if (!address.zoneId || isEmpty) return;
    let alive = true;
    void quoteTotals({
      zoneId: address.zoneId,
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
    })
      .then((q) => alive && setQuote(q))
      .catch(() => alive && setQuote(null));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.zoneId]);

  const zoneAccounts = useMemo(
    () => DEFAULT_PAYMENT_ACCOUNTS.filter((a) => a.method === payment.method),
    [payment.method],
  );

  if (isEmpty && !created) {
    return (
      <div className="spot-container py-16">
        <EmptyState
          title="Carrito vacío"
          message="Nada para pagar todavía. Tu primera parada empieza aquí."
          action={{ label: 'Ir al catálogo', onClick: () => navigate('/catalogo') }}
        />
      </div>
    );
  }

  /* ── Validaciones por paso ── */
  const validateStep0 = (): boolean => {
    const e: Record<string, string | null> = {};
    if (!isValidPersonName(contact.name)) e['name'] = 'Nombre y apellido completos.';
    if (!isValidCedulaVE(contact.cedula)) e['cedula'] = 'Cédula: V-12345678 o E-87654321.';
    if (!isValidPhoneVE(contact.phone)) e['phone'] = 'Teléfono móvil venezolano.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const validateStep1 = (): boolean => {
    const e: Record<string, string | null> = {};
    if (!address.zoneId) e['zoneId'] = 'Elige tu zona de entrega.';
    if (sanitizeText(address.city, 60).length < 3) e['city'] = 'Ciudad requerida.';
    if (sanitizeMultiline(address.details, 500).length < 8) e['details'] = 'Dirección con urbanización, calle y casa/piso.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string | null> = {};
    const p = payment;
    if (p.method === 'pago_movil') {
      if (!p.banco) e['banco'] = 'Selecciona el banco del pago.';
      if (!isValidCedulaVE(p.cedula)) e['cedula'] = 'Cédula del pagador.';
      if (!isValidPhoneVE(p.telefono)) e['telefono'] = 'Teléfono del pago móvil.';
      if (!isValidPaymentReference(p.referencia, 've')) e['referencia'] = 'Referencia de 6 a 20 dígitos.';
      if (!p.fecha) e['fecha'] = 'Fecha del pago.';
    } else if (p.method === 'transferencia') {
      if (!p.bancoOrigen) e['bancoOrigen'] = 'Banco de origen.';
      if (!isValidPaymentReference(p.referenciaTransferencia, 've')) e['referenciaTransferencia'] = 'Referencia de 6 a 20 dígitos.';
      if (!p.fecha) e['fecha'] = 'Fecha del pago.';
    } else if (p.method === 'zelle') {
      if (!isValidEmail(p.correoZelle)) e['correoZelle'] = 'Correo del emisor en Zelle.';
      if (!isValidPaymentReference(p.referenciaZelle, 'zelle')) e['referenciaZelle'] = 'Referencia de confirmación.';
    }
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  /* ── Confirmación: crea la orden vía Cloud Function ── */
  const confirm = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const uid = user.uid;
      const idempotencyKey = buildIdempotencyKey({
        uid,
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
        contact: { name: contact.name, phone: normalizePhoneVE(contact.phone), cedula: normalizeCedulaVE(contact.cedula) },
        address: {
          state: sanitizeText(address.state, 40), city: sanitizeText(address.city, 60),
          zoneId: address.zoneId, zoneName: zone?.name ?? '', details: sanitizeMultiline(address.details, 500),
        },
        paymentMethod: payment.method,
        now: Date.now(),
      });

      const paymentDetails: Record<string, string> = {};
      if (payment.method === 'pago_movil') {
        paymentDetails['banco'] = payment.banco;
        paymentDetails['cedula'] = normalizeCedulaVE(payment.cedula);
        paymentDetails['telefono'] = normalizePhoneVE(payment.telefono);
        paymentDetails['referencia'] = payment.referencia;
        paymentDetails['fecha'] = payment.fecha;
      } else if (payment.method === 'transferencia') {
        paymentDetails['bancoOrigen'] = payment.bancoOrigen;
        paymentDetails['referencia'] = payment.referenciaTransferencia;
        paymentDetails['fecha'] = payment.fecha;
      } else if (payment.method === 'zelle') {
        paymentDetails['correo'] = payment.correoZelle.trim().toLowerCase();
        paymentDetails['referencia'] = payment.referenciaZelle;
      }

      const response = await createOrder(
        {
          idempotencyKey,
          reservationId: reservation?.reservationId ?? null,
          contact: {
            name: sanitizeText(contact.name, 80),
            phone: normalizePhoneVE(contact.phone),
            cedula: normalizeCedulaVE(contact.cedula),
          },
          address: {
            state: sanitizeText(address.state, 40),
            city: sanitizeText(address.city, 60),
            zoneId: address.zoneId,
            zoneName: zone?.name ?? '',
            details: sanitizeMultiline(address.details, 500),
          },
          deliveryWindow: zone?.windows[0]
            ? { start: zone.windows[0].start, end: zone.windows[0].end }
            : { start: '08:00', end: '20:00' },
          notes: sanitizeMultiline(address.notes, 300),
          paymentMethod: payment.method,
          paymentDetails,
        },
        items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
      );

      void trackEvent({
        name: 'purchase',
        params: { orderId: response.orderId, valueUsd: response.totals.totalUsd, items: items.length, method: payment.method },
      });
      clear();
      setCreated(response);
      setStep(3);
    } catch (e) {
      if (e instanceof AppError && e.code === 'reservation') {
        // Reserva vencida: re-reserva y pide confirmar de nuevo.
        try {
          const fresh = await reserveStock(items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })));
          setReservation(fresh);
        } catch {
          /* reintento en la próxima confirmación */
        }
      }
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="spot-container py-8">
      <h1 className="spot-title mb-6">Checkout</h1>
      <Stepper steps={STEPS} current={created ? 3 : step} />

      {created ? (
        /* ── PASO 4: CONFIRMACIÓN ── */
        <div className="mx-auto mt-10 max-w-2xl rounded-brand-lg border-2 border-signal bg-surface-1 p-8 text-center">
          <SpeedLines className="mx-auto mb-5" animated />
          <h2 className="font-display text-3xl font-extrabold italic uppercase text-paper">
            Pedido en la bahía
          </h2>
          <p className="mt-2 text-body-lg text-muted">{BRAND.closing}</p>
          <div className="mt-6 rounded-brand border-2 border-line bg-ink p-5">
            <p className="spot-label">Código de pedido</p>
            <p className="mt-1 font-display text-2xl font-black italic text-signal">{created.code}</p>
          </div>
          <dl className="mt-6 space-y-2 text-left">
            <Row label="Total USD" value={formatUsd(created.totals.totalUsd)} strong />
            <Row label="Total Bs (tasa BCV)" value={formatBs(created.totals.totalVes)} />
            <Row label="Envío" value={created.totals.shippingUsd === 0 ? 'Gratis' : formatUsd(created.totals.shippingUsd)} />
          </dl>
          <div className="mt-6 rounded-brand border-2 border-line bg-ink p-4 text-left">
            <p className="spot-label mb-1">Siguiente paso</p>
            <p className="text-body-base text-paper">{PAYMENT_INSTRUCTIONS[payment.method]}</p>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button onClick={() => navigate(`/pedido/${created.orderId}`)} size="lg">
              Ver mi pedido
            </Button>
            <Button variant="secondary" onClick={() => navigate('/catalogo')} size="lg">
              Seguir comprando
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); }} className="mt-8">
          {/* ── PASO 0: DATOS ── */}
          {step === 0 && (
            <div className="mx-auto max-w-xl space-y-4 rounded-brand-lg border-2 border-line bg-surface-1 p-6">
              <h2 className="font-display text-lg font-bold italic uppercase text-paper">Tus datos</h2>
              <Input label="Nombre y apellido" value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} error={errors['name']} required />
              <Input label="Cédula" value={contact.cedula} onChange={(e) => setContact((c) => ({ ...c, cedula: e.target.value }))} placeholder="V-12345678" error={errors['cedula']} required />
              <Input label="Teléfono" type="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} placeholder="04141234567" error={errors['phone']} required />
              <Button
                size="lg"
                fullWidth
                onClick={() => validateStep0() && setStep(1)}
              >
                Seguir a entrega
              </Button>
            </div>
          )}

          {/* ── PASO 1: ENTREGA ── */}
          {step === 1 && (
            <div className="mx-auto max-w-xl space-y-4 rounded-brand-lg border-2 border-line bg-surface-1 p-6">
              <h2 className="font-display text-lg font-bold italic uppercase text-paper">Entrega a domicilio</h2>
              <Select
                label="Zona de cobertura"
                value={address.zoneId}
                onChange={(e) => {
                  const z = zones?.find((zz) => zz.id === e.target.value);
                  setAddress((a) => ({ ...a, zoneId: e.target.value, state: z?.state ?? a.state }));
                }}
                error={errors['zoneId']}
                required
              >
                <option value="">Selecciona tu zona…</option>
                {zones?.filter((z) => z.active).map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name} · ${z.feeUsd.toFixed(2)} · {z.etaMinMinutes}-{z.etaMaxMinutes} min
                  </option>
                ))}
              </Select>
              <Input label="Estado" value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))} required />
              <Input label="Ciudad" value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} error={errors['city']} required />
              <Textarea
                label="Dirección completa"
                value={address.details}
                onChange={(e) => setAddress((a) => ({ ...a, details: e.target.value }))}
                placeholder="Urbanización, calle, casa/apto, piso, punto de referencia"
                error={errors['details']}
                required
              />
              <Textarea
                label="Nota para el mensajero (opcional)"
                value={address.notes}
                onChange={(e) => setAddress((a) => ({ ...a, notes: e.target.value }))}
                rows={2}
              />
              {zone && (
                <p className="spot-label">
                  Ventanas: {zone.windows.map((w) => w.label).join(' · ')} · peso máximo {zone.maxWeightKg} kg
                </p>
              )}
              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setStep(0)}>Volver</Button>
                <Button size="lg" className="flex-1" type="button" onClick={() => validateStep1() && setStep(2)}>
                  Seguir al pago
                </Button>
              </div>
            </div>
          )}

          {/* ── PASO 2: PAGO ── */}
          {step === 2 && (
            <div className="mx-auto max-w-2xl space-y-6">
              {/* Cotización autoritativa del backend */}
              <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6" aria-label="Resumen de montos">
                <h2 className="font-display text-lg font-bold italic uppercase text-paper">Montos</h2>
                {quote ? (
                  <dl className="mt-4 space-y-2">
                    <Row label="Subtotal" value={formatUsd(quote.subtotalUsd)} />
                    <Row label={`Envío · ${quote.zoneName}`} value={quote.freeShipping ? 'Gratis' : formatUsd(quote.shippingUsd)} />
                    <Row label="Total USD" value={formatUsd(quote.totalUsd)} strong />
                    <Row label="Total Bs · tasa BCV" value={formatBs(quote.totalVes)} />
                    <Row label="Tasa aplicada" value={`1 USD = ${formatBs(quote.rateUsed)}`} />
                    <Row label="Peso aproximado" value={`${quote.weightKg} kg`} />
                  </dl>
                ) : (
                  <p className="mt-3 text-muted">Calculando montos en el servidor…</p>
                )}
                {rate && (
                  <p className="mt-3 spot-label">Tasa BCV publicada {new Date(rate.updatedAt).toLocaleString('es-VE')}</p>
                )}
                {reservation && (
                  <p className="mt-3 spot-label text-signal">
                    Stock reservado por 2 horas · vence {new Date(reservation.expiresAt).toLocaleTimeString('es-VE')}
                  </p>
                )}
              </section>

              {/* Métodos de pago */}
              <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
                <h2 className="font-display text-lg font-bold italic uppercase text-paper">Método de pago</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Método de pago">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={payment.method === m}
                      onClick={() => setPayment((p) => ({ ...p, method: m }))}
                      className={`min-h-[56px] rounded-brand border-2 px-4 py-3 text-left font-body font-semibold transition-colors ${
                        payment.method === m
                          ? 'border-signal bg-signal/10 text-signal'
                          : 'border-line text-paper hover:border-line-strong'
                      }`}
                    >
                      {PAYMENT_METHOD_LABELS[m]}
                    </button>
                  ))}
                </div>

                {/* Datos de recaudación */}
                {zoneAccounts.length > 0 && zoneAccounts[0] && (
                  <div className="mt-4 rounded-brand border-2 border-dashed border-line bg-ink p-4">
                    <p className="spot-label mb-2">Datos de SPOT 24 para pagar</p>
                    <ul className="space-y-1 text-body-base text-paper">
                      <li>Banco: <strong>{zoneAccounts[0].bank}</strong></li>
                      <li>RIF: <strong>{zoneAccounts[0].rif}</strong></li>
                      {zoneAccounts[0].phone && <li>Teléfono: <strong>{zoneAccounts[0].phone}</strong></li>}
                      {zoneAccounts[0].accountNumber && <li>Cuenta: <strong>{zoneAccounts[0].accountNumber}</strong></li>}
                      {zoneAccounts[0].email && <li>Correo: <strong>{zoneAccounts[0].email}</strong></li>}
                    </ul>
                  </div>
                )}

                {/* Formularios por método */}
                {payment.method === 'pago_movil' && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Select label="Banco del pago" value={payment.banco} onChange={(e) => setPayment((p) => ({ ...p, banco: e.target.value }))} error={errors['banco']} required>
                      <option value="">Selecciona…</option>
                      {VE_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </Select>
                    <Input label="Cédula del pagador" value={payment.cedula} onChange={(e) => setPayment((p) => ({ ...p, cedula: e.target.value }))} error={errors['cedula']} required />
                    <Input label="Teléfono del pago" type="tel" value={payment.telefono} onChange={(e) => setPayment((p) => ({ ...p, telefono: e.target.value }))} error={errors['telefono']} required />
                    <Input label="Referencia" value={payment.referencia} onChange={(e) => setPayment((p) => ({ ...p, referencia: e.target.value.replace(/\D/g, '') }))} error={errors['referencia']} inputMode="numeric" required />
                    <Input label="Fecha del pago" type="date" value={payment.fecha} onChange={(e) => setPayment((p) => ({ ...p, fecha: e.target.value }))} error={errors['fecha']} required />
                  </div>
                )}
                {payment.method === 'transferencia' && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Select label="Banco de origen" value={payment.bancoOrigen} onChange={(e) => setPayment((p) => ({ ...p, bancoOrigen: e.target.value }))} error={errors['bancoOrigen']} required>
                      <option value="">Selecciona…</option>
                      {VE_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </Select>
                    <Input label="Referencia" value={payment.referenciaTransferencia} onChange={(e) => setPayment((p) => ({ ...p, referenciaTransferencia: e.target.value.replace(/\D/g, '') }))} error={errors['referenciaTransferencia']} inputMode="numeric" required />
                    <Input label="Fecha del pago" type="date" value={payment.fecha} onChange={(e) => setPayment((p) => ({ ...p, fecha: e.target.value }))} error={errors['fecha']} required />
                  </div>
                )}
                {payment.method === 'zelle' && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <Input label="Correo del emisor" type="email" value={payment.correoZelle} onChange={(e) => setPayment((p) => ({ ...p, correoZelle: e.target.value }))} error={errors['correoZelle']} required />
                    <Input label="Referencia de confirmación" value={payment.referenciaZelle} onChange={(e) => setPayment((p) => ({ ...p, referenciaZelle: e.target.value.trim() }))} error={errors['referenciaZelle']} required />
                  </div>
                )}
                {payment.method === 'efectivo' && (
                  <p className="mt-4 rounded-brand border-2 border-line bg-ink p-4 text-body-base text-paper">
                    Prepara el monto exacto en divisas. El mensajero cobra al entregar y te
                    contactará antes de salir. Sin comprobante previo.
                  </p>
                )}
              </section>

              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setStep(1)}>Volver</Button>
                <Button size="lg" className="flex-1" loading={busy} onClick={() => { if (validateStep2()) setStep(3); }}>
                  Revisar y confirmar
                </Button>
              </div>
            </div>
          )}

          {/* ── PASO 3 intermedio: revisión + crear orden ── */}
          {step === 3 && !created && (
            <div className="mx-auto max-w-2xl space-y-6">
              <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
                <h2 className="font-display text-lg font-bold italic uppercase text-paper">Revisión final</h2>
                <dl className="mt-4 space-y-2">
                  <Row label="Nombre" value={contact.name} />
                  <Row label="Cédula" value={normalizeCedulaVE(contact.cedula)} />
                  <Row label="Teléfono" value={normalizePhoneVE(contact.phone)} />
                  <Row label="Zona" value={zone?.name ?? address.zoneId} />
                  <Row label="Método de pago" value={PAYMENT_METHOD_LABELS[payment.method]} />
                  {quote && <Row label="Total a pagar" value={`${formatUsd(quote.totalUsd)} · ${formatBs(quote.totalVes)}`} strong />}
                </dl>
                <p className="mt-4 text-sm text-muted">
                  Al confirmar, el servidor valida stock, calcula los montos finales con la tasa
                  BCV y crea tu orden. Los reintentos no duplican pedidos.
                </p>
              </section>
              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setStep(2)} disabled={busy}>Volver</Button>
                <Button size="lg" className="flex-1" loading={busy} onClick={(e) => void confirm(e as unknown as FormEvent)}>
                  Confirmar pedido
                </Button>
              </div>
            </div>
          )}
        </form>
      )}

      <SpeedDivider className="mt-12" />
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className={`text-right ${strong ? 'font-display text-xl font-extrabold italic text-signal' : 'font-semibold text-paper'}`}>
        {value}
      </dd>
    </div>
  );
}
