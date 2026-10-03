/**
 * Checkout en pasos: Datos → Entrega → Pago → Confirmación (5.4).
 * · Reserva de stock 2 h al entrar (callable fn-reserveStock).
 * · Cotización autoritativa por zona y monto en Bs (callable fn-quoteTotals).
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
import {
  PAYMENT_METHOD_LABELS, PAYMENT_INSTRUCTIONS,
} from '@/shared/constants/orders';
import { VE_BANKS, DEFAULT_PAYMENT_ACCOUNTS, BRAND, type PaymentAccount } from '@/shared/constants/brand';
import { getPaymentAccounts } from '@/shared/services/settings.service';
import {
  isValidPersonName, isValidCedulaVE, isValidPhoneVE,
  isValidPaymentReference, normalizeCedulaVE, normalizePhoneVE, sanitizeMultiline, sanitizeText,
} from '@/shared/lib/validation';
import { userMessage, AppError } from '@/shared/lib/errors';
import { trackEvent } from '@/shared/lib/analytics';
import { formatBs, formatUsd, usdToBs } from '@/shared/lib/format';
import type { CreateOrderResponse, QuoteResponse, ReservationResponse, FulfillmentMode } from '../types';
import type { PaymentMethod } from '@/shared/constants/orders';
import { getGeneralSettings } from '@/shared/services/settings.service';

const STEPS = ['Datos', 'Entrega', 'Pago', 'Confirmación'] as const;

interface ContactForm {
  name: string; cedula: string; phone: string;
}
interface AddressForm {
  zoneId: string; details: string; notes: string;
}
interface PaymentForm {
  method: PaymentMethod;
  banco: string; cedula: string; telefono: string; referencia: string; fecha: string;
}

/** Operación actual: solo Maracay, Aragua. Estado y ciudad se fijan aquí. */
const ZONE_STATE = 'Aragua';
const ZONE_CITY = 'Maracay';

export default function CheckoutPage() {
  useDocumentTitle('Checkout');
  const navigate = useNavigate();
  const { items, clear, isEmpty } = useCart();
  const { user } = useAuth();
  const { data: zones } = useZones();

  const [step, setStep] = useState(0);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>('delivery');
  const [contact, setContact] = useState<ContactForm>({ name: '', cedula: '', phone: '' });
  const [address, setAddress] = useState<AddressForm>({ zoneId: '', details: '', notes: '' });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [payment, setPayment] = useState<PaymentForm>({
    method: 'pago_movil', banco: '', cedula: '', telefono: '', referencia: '', fecha: '',
  });
  const [pickupInfo, setPickupInfo] = useState<{ address: string; hours: string }>({ address: '', hours: '' });
  const [reservation, setReservation] = useState<ReservationResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteState, setQuoteState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
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

  // Datos del local para retiro (settings/general, editable en /admin/ajustes).
  useEffect(() => {
    let alive = true;
    void getGeneralSettings()
      .then((g) => {
        if (alive && g) setPickupInfo({ address: g.pickupAddress, hours: g.pickupHours });
      })
      .catch(() => {
        /* sin ajustes: usamos el texto por defecto de retiro */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Cotización autoritativa: al elegir zona (delivery) o de una vez (pickup).
  // Con estado visible: loading → montos; error → Reintentar (no cuelga).
  const zone = zones?.find((z) => z.id === address.zoneId) ?? null;
  useEffect(() => {
    if (isEmpty) return;
    if (fulfillment === 'delivery' && !address.zoneId) return;
    let alive = true;
    setQuoteState('loading');
    void quoteTotals({
      fulfillment,
      zoneId: fulfillment === 'pickup' ? '' : address.zoneId,
      items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
    })
      .then((q) => {
        if (!alive) return;
        setQuote(q);
        setQuoteState('ok');
      })
      .catch(() => {
        if (!alive) return;
        setQuote(null);
        setQuoteState('error');
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fulfillment, address.zoneId, quoteAttempt]);

  // Datos de recaudación: primero Firestore (editable desde /admin/ajustes
  // sin deploy); si aún no hay documento o falla la red, se usa la semilla.
  const [accounts, setAccounts] = useState<readonly PaymentAccount[]>(DEFAULT_PAYMENT_ACCOUNTS);
  useEffect(() => {
    let alive = true;
    void getPaymentAccounts()
      .then((a) => {
        if (alive && a && a.length > 0) setAccounts(a);
      })
      .catch(() => {
        /* respaldo silencioso: seguimos con la semilla del repo */
      });
    return () => {
      alive = false;
    };
  }, []);

  const zoneAccounts = useMemo(
    () => accounts.filter((a) => a.method === payment.method),
    [accounts, payment.method],
  );

  // GPS del cliente: OBLIGATORIO en delivery — el mensajero recibe el punto
  // exacto para llegar. En retiro en tienda no se pide (no aplica).
  const captureGps = () => {
    if (!navigator.geolocation) {
      toast.error('Tu navegador no permite GPS. Prueba desde otro navegador.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
        });
        setGpsBusy(false);
        toast.success('Ubicación capturada. El mensajero la usará para llegar exacto.');
      },
      () => {
        setGpsBusy(false);
        toast.error('No pudimos leer tu ubicación. Permite el GPS en el navegador e intenta de nuevo: es obligatoria para el envío.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

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
    if (!isValidCedulaVE(contact.cedula)) e['cedula'] = 'Cédula: solo los números, ej. 12345678.';
    if (!isValidPhoneVE(contact.phone)) e['phone'] = 'Teléfono móvil: 0412, 0414, 0416, 0422, 0424 o 0426.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const validateStep1 = (): boolean => {
    if (fulfillment === 'pickup') {
      // Retiro en tienda: no hay dirección ni GPS que validar.
      setErrors({});
      return true;
    }
    const e: Record<string, string | null> = {};
    if (!address.zoneId) e['zoneId'] = 'Elige tu zona de entrega.';
    if (!gps) e['gps'] = 'Captura tu ubicación GPS: el mensajero la necesita para llegar.';
    if (sanitizeMultiline(address.details, 500).length < 8) e['details'] = 'Dirección con urbanización, calle y casa/piso.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const validateStep2 = (): boolean => {
    const e: Record<string, string | null> = {};
    if (!payment.banco) e['banco'] = 'Selecciona el banco del pago.';
    if (!isValidCedulaVE(payment.cedula)) e['cedula'] = 'Cédula del pagador: solo los números.';
    if (!isValidPhoneVE(payment.telefono)) e['telefono'] = 'Teléfono móvil del pago.';
    if (!isValidPaymentReference(payment.referencia)) e['referencia'] = 'Los últimos 6 dígitos de la referencia (los muestra el banco).';
    if (!payment.fecha) e['fecha'] = 'Fecha del pago.';
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
      const pickupAddress = fulfillment === 'pickup'
        ? (pickupInfo.address || 'Retiro en tienda · Maracay, Aragua')
        : '';
      const idempotencyKey = buildIdempotencyKey({
        uid,
        items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
        contact: { name: contact.name, phone: normalizePhoneVE(contact.phone), cedula: normalizeCedulaVE(contact.cedula) },
        address: {
          state: ZONE_STATE,
          city: ZONE_CITY,
          zoneId: fulfillment === 'pickup' ? '' : address.zoneId,
          zoneName: fulfillment === 'pickup' ? 'Retiro en tienda' : zone?.name ?? '',
          details: fulfillment === 'pickup' ? pickupAddress : sanitizeMultiline(address.details, 500),
        },
        paymentMethod: payment.method,
        now: Date.now(),
      });

      const paymentDetails: Record<string, string> = {
        banco: payment.banco,
        cedula: normalizeCedulaVE(payment.cedula),
        telefono: normalizePhoneVE(payment.telefono),
        referencia: payment.referencia,
        fecha: payment.fecha,
      };

      const response = await createOrder(
        {
          idempotencyKey,
          reservationId: reservation?.reservationId ?? null,
          fulfillment,
          // Líneas explícitas: el backend las exige (revalida contra Firestore).
          items: items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
          contact: {
            name: sanitizeText(contact.name, 80),
            phone: normalizePhoneVE(contact.phone),
            cedula: normalizeCedulaVE(contact.cedula),
          },
          address: fulfillment === 'pickup'
            ? {
                state: ZONE_STATE,
                city: ZONE_CITY,
                zoneId: '',
                zoneName: 'Retiro en tienda',
                details: pickupAddress,
                location: null,
              }
            : {
                state: ZONE_STATE,
                city: ZONE_CITY,
                zoneId: address.zoneId,
                zoneName: zone?.name ?? '',
                details: sanitizeMultiline(address.details, 500),
                location: gps,
              },
          deliveryWindow: fulfillment === 'pickup'
            ? { start: '08:00', end: '20:00' }
            : zone?.windows[0]
              ? { start: zone.windows[0].start, end: zone.windows[0].end }
              : { start: '12:00', end: '23:59' },
          notes: sanitizeMultiline(address.notes, 300),
          paymentMethod: payment.method,
          paymentDetails,
        },
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
            <Row label="Total a pagar" value={formatBs(created.totals.totalVes)} strong />
            <Row label="Equivale a" value={formatUsd(created.totals.totalUsd)} />
            <Row
              label="Envío"
              value={
                created.totals.shippingUsd === 0
                  ? 'Gratis'
                  : created.totals.rateUsed > 0
                    ? formatBs(usdToBs(created.totals.shippingUsd, created.totals.rateUsed))
                    : formatUsd(created.totals.shippingUsd)
              }
            />
            {(created.totals.ivaPercent ?? 0) > 0 && (
              <Row
                label={`IVA (${String(created.totals.ivaPercent).replace('.', ',')}%)`}
                value={
                  created.totals.rateUsed > 0
                    ? formatBs(usdToBs(created.totals.ivaUsd ?? 0, created.totals.rateUsed))
                    : formatUsd(created.totals.ivaUsd ?? 0)
                }
              />
            )}
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
              <Input label="Cédula (solo números)" value={contact.cedula} onChange={(e) => setContact((c) => ({ ...c, cedula: e.target.value }))} placeholder="12345678" inputMode="numeric" error={errors['cedula']} required />
              <Input label="Teléfono" type="tel" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} placeholder="04241234567" error={errors['phone']} required />
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
              <h2 className="font-display text-lg font-bold italic uppercase text-paper">¿Cómo lo recibes?</h2>

              {/* Modalidad: retiro en tienda o envío a domicilio */}
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Modalidad de entrega">
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === 'pickup'}
                  onClick={() => setFulfillment('pickup')}
                  className={`rounded-brand border-2 p-4 text-left transition ${fulfillment === 'pickup' ? 'border-signal bg-signal/10' : 'border-line hover:border-muted'}`}
                >
                  <p className={`font-display text-sm font-bold italic uppercase ${fulfillment === 'pickup' ? 'text-signal' : 'text-paper'}`}>
                    Retiro en tienda
                  </p>
                  <p className="mt-1 text-xs text-muted">Pasas por el local en Maracay. Sin costo de envío.</p>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={fulfillment === 'delivery'}
                  onClick={() => setFulfillment('delivery')}
                  className={`rounded-brand border-2 p-4 text-left transition ${fulfillment === 'delivery' ? 'border-signal bg-signal/10' : 'border-line hover:border-muted'}`}
                >
                  <p className={`font-display text-sm font-bold italic uppercase ${fulfillment === 'delivery' ? 'text-signal' : 'text-paper'}`}>
                    Envío a domicilio
                  </p>
                  <p className="mt-1 text-xs text-muted">Llevamos tu pedido a tu zona en Maracay, Aragua.</p>
                </button>
              </div>

              {fulfillment === 'pickup' ? (
                /* RETIRO: datos del local (settings/general, editable por el admin) */
                <div className="rounded-brand border-2 border-dashed border-line bg-ink p-4">
                  <p className="spot-label mb-2">Retira tu pedido aquí</p>
                  <p className="text-body-base text-paper">
                    {pickupInfo.address || 'Retiro en tienda · Maracay, Aragua'}
                  </p>
                  {pickupInfo.hours && (
                    <p className="mt-2 text-sm text-muted">Horario: {pickupInfo.hours}</p>
                  )}
                  <p className="mt-2 text-sm text-muted">
                    Te avisamos cuando esté listo. Pago por Pago Móvil igual que siempre.
                  </p>
                </div>
              ) : (
                <>  {/* DOMICILIO: zona + dirección */}
                  <Select
                    label="Zona de cobertura"
                    value={address.zoneId}
                    onChange={(e) => setAddress((a) => ({ ...a, zoneId: e.target.value }))}
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
                  <Textarea
                    label="Dirección completa"
                    value={address.details}
                    onChange={(e) => setAddress((a) => ({ ...a, details: e.target.value }))}
                    placeholder="Urbanización, calle, casa/apto, piso, punto de referencia"
                    error={errors['details']}
                    required
                  />
                  {/* Ubicación GPS: OBLIGATORIA en delivery — viaja al mensajero. */}
                  <div className="rounded-brand border-2 border-dashed border-line bg-ink p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="secondary" type="button" loading={gpsBusy} onClick={captureGps}>
                        {gps ? 'Capturar de nuevo' : 'Capturar mi ubicación'}
                      </Button>
                      {gps && (
                        <span className="spot-label text-signal">Ubicación capturada ✓</span>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Obligatoria: el mensajero recibe tu punto exacto para llegar sin llamadas.
                    </p>
                    {errors['gps'] && (
                      <p className="mt-1 text-sm font-semibold text-signal">{errors['gps']}</p>
                    )}
                  </div>
                  <Textarea
                    label="Nota para el mensajero (opcional)"
                    value={address.notes}
                    onChange={(e) => setAddress((a) => ({ ...a, notes: e.target.value }))}
                    rows={2}
                  />
                  {zone && (
                    <p className="spot-label">
                      Horario de entregas: {zone.windows.map((w) => w.label).join(' · ')}
                    </p>
                  )}
                </>
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
                {quoteState === 'ok' && quote ? (
                  quote.rateUsed > 0 ? (
                    <>
                      <dl className="mt-4 space-y-2">
                        <Row label="Subtotal" value={formatBs(usdToBs(quote.subtotalUsd, quote.rateUsed))} />
                        <Row
                          label="Envío"
                          value={
                            quote.shippingUsd === 0
                              ? fulfillment === 'pickup'
                                ? 'Retiro en tienda · Gratis'
                                : 'Gratis'
                              : formatBs(usdToBs(quote.shippingUsd, quote.rateUsed))
                          }
                        />
                        {(quote.ivaPercent ?? 0) > 0 && (
                          <Row
                            label={`IVA (${String(quote.ivaPercent).replace('.', ',')}%)`}
                            value={formatBs(usdToBs(quote.ivaUsd ?? 0, quote.rateUsed))}
                          />
                        )}
                        <Row label="Total a pagar" value={formatBs(quote.totalVes)} strong />
                      </dl>
                      <p className="mt-3 spot-label">
                        Tasa BCV: {quote.rateUsed.toFixed(2).replace('.', ',')} Bs/USD · Equivale a {formatUsd(quote.totalUsd)}
                      </p>
                    </>
                  ) : (
                    <>
                      {/* Sin tasa publicada aún: mostramos USD y avisamos. */}
                      <dl className="mt-4 space-y-2">
                        <Row label="Subtotal" value={formatUsd(quote.subtotalUsd)} />
                        <Row
                          label="Envío"
                          value={
                            quote.shippingUsd === 0
                              ? fulfillment === 'pickup'
                                ? 'Retiro en tienda · Gratis'
                                : 'Gratis'
                              : formatUsd(quote.shippingUsd)
                          }
                        />
                        {(quote.ivaPercent ?? 0) > 0 && (
                          <Row label={`IVA (${String(quote.ivaPercent).replace('.', ',')}%)`} value={formatUsd(quote.ivaUsd ?? 0)} />
                        )}
                        <Row label="Total a pagar" value={formatUsd(quote.totalUsd)} strong />
                      </dl>
                      <p className="mt-3 spot-label text-signal">
                        Tasa BCV aún no publicada: mostramos montos en USD mientras tanto.
                      </p>
                    </>
                  )
                ) : quoteState === 'error' ? (
                  <div className="mt-3">
                    <p className="text-muted">
                      No pudimos calcular tus montos: el servidor no respondió. Verifica tu conexión y reintenta.
                    </p>
                    <Button variant="secondary" className="mt-3" type="button" onClick={() => setQuoteAttempt((n) => n + 1)}>
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-muted">Calculando montos en el servidor…</p>
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
                <div
                  aria-label="Método de pago"
                  className="mt-4 flex min-h-[56px] items-center rounded-brand border-2 border-signal bg-signal/10 px-4 py-3 font-body font-semibold text-signal"
                >
                  {PAYMENT_METHOD_LABELS['pago_movil']}
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

                {/* Formulario Pago Móvil */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Select label="Banco del pago" value={payment.banco} onChange={(e) => setPayment((p) => ({ ...p, banco: e.target.value }))} error={errors['banco']} required>
                    <option value="">Selecciona…</option>
                    {VE_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </Select>
                  <Input label="Cédula del pagador (solo números)" value={payment.cedula} onChange={(e) => setPayment((p) => ({ ...p, cedula: e.target.value }))} placeholder="12345678" inputMode="numeric" error={errors['cedula']} required />
                  <Input label="Teléfono del pago" type="tel" value={payment.telefono} onChange={(e) => setPayment((p) => ({ ...p, telefono: e.target.value }))} placeholder="04241234567" error={errors['telefono']} required />
                  <Input label="Referencia (últimos 6 dígitos)" value={payment.referencia} onChange={(e) => setPayment((p) => ({ ...p, referencia: e.target.value.replace(/\D/g, '').slice(0, 6) }))} error={errors['referencia']} inputMode="numeric" maxLength={6} placeholder="123456" required />
                  <Input label="Fecha del pago" type="date" value={payment.fecha} onChange={(e) => setPayment((p) => ({ ...p, fecha: e.target.value }))} error={errors['fecha']} required />
                </div>
              </section>

              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setStep(1)}>Volver</Button>
                <Button
                  size="lg"
                  className="flex-1"
                  type="button"
                  disabled={quoteState !== 'ok'}
                  onClick={() => { if (validateStep2()) setStep(3); }}
                >
                  Revisar y confirmar
                </Button>
              </div>
              {quoteState !== 'ok' && (
                <p className="text-center text-sm text-muted">
                  Esperando los montos del servidor para seguir.
                </p>
              )}
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
                  <Row
                    label="Entrega"
                    value={fulfillment === 'pickup' ? 'Retiro en tienda' : (zone?.name ?? address.zoneId)}
                  />
                  <Row label="Método de pago" value={PAYMENT_METHOD_LABELS[payment.method]} />
                  {quote && (
                    <Row
                      label="Total a pagar"
                      value={quote.totalVes > 0 ? `${formatBs(quote.totalVes)} · ≈ ${formatUsd(quote.totalUsd)}` : formatUsd(quote.totalUsd)}
                      strong
                    />
                  )}
                </dl>
                <p className="mt-4 text-sm text-muted">
                  Al confirmar, el servidor valida el stock, calcula los montos finales en
                  bolívares y crea tu orden. Los reintentos no duplican pedidos.
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