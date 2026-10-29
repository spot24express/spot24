/**
 * Checkout en pasos: Datos → Entrega → Pago → Confirmación (5.4).
 * · Reserva de stock 2 h al entrar (callable fn-reserveStock).
 * · Cotización autoritativa por zona y monto en Bs (callable fn-quoteTotals).
 * · La orden la crea EXCLUSIVAMENTE la Cloud Function fn-createOrder con App
 *   Check e idempotencia: el cliente nunca escribe en orders ni calcula montos.
 * · FLUJO ESTRICTO (ronda 5i-k): el comprobante de pago se adjunta OBLIGA-
 *   TORIAMENTE en el paso Pago y viaja con fn-createOrder (base64 comprimido).
 *   El servidor lo sube a imgbb ANTES de crear la orden → el pedido nace en
 *   en_verificacion con hasReceipt: true. Ya no existen pedidos sin pago y
 *   el cajero solo ve pedidos ya pagados en su cola.
 * · 5.112-B: «Envío a domicilio» obedece la franja del delivery guardada en
 *   Ajustes (deliveryStart/deliveryEnd, HORA DE VENEZUELA): fuera de la
 *   franja solo se ofrece RETIRO EN TIENDA, con aviso y auto-cambio.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input, Select, Textarea } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { EmptyState } from '@/shared/components/ui/States';
import { Modal } from '@/shared/components/ui/Modal';
import { useCart } from '@/features/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useZones } from '@/features/delivery/hooks/useZones';
import { reserveStock, quoteTotals, createOrder } from '../services/checkout.service';
import { buildIdempotencyKey } from '../lib/idempotency';
import {
  PAYMENT_METHOD_LABELS, PAYMENT_INSTRUCTIONS, PAYMENT_REQUIRES_RECEIPT,
  type PaymentMethod,
} from '@/shared/constants/orders';
import { VE_BANKS, DEFAULT_PAYMENT_ACCOUNTS, BRAND, type PaymentAccount } from '@/shared/constants/brand';
import {
  activeAccountsOf, accountChipLabel, accountKey, buildPaymentDetails,
  copyRowsForAccount, qrForAccount, validatePaymentForm,
  usesVeForm, EMPTY_PAYMENT_FORM, type PaymentFormState,
} from '@/shared/lib/paymentMethods';
import { getGeneralSettings, getPaymentAccounts } from '@/shared/services/settings.service';
import {
  deliveryAbierto, esHHMM, hhmmBonito, minutosAhoraCaracas,
  type FranjaDelivery,
} from '@/shared/lib/horarioDelivery';
import {
  isValidPersonName, isValidCedulaVE, isValidPhoneVE,
  normalizeCedulaVE, normalizePhoneVE, sanitizeMultiline, sanitizeText,
  isAllowedUploadType, RECEIPT_IMAGE_TYPES,
} from '@/shared/lib/validation';
import { MAX_INPUT_MB, fileToBase64 } from '@/shared/lib/imageCompress';
import { userMessage, AppError } from '@/shared/lib/errors';
import { trackEvent } from '@/shared/lib/analytics';
import { formatBs, usdToBs, cleanAmountBs } from '@/shared/lib/format';
import { copyText } from '@/shared/lib/clipboard';
import { useBcvRate } from '@/shared/hooks/useBcvRate';
import type { CreateOrderResponse, QuoteResponse, ReservationResponse, FulfillmentMode } from '../types';

const STEPS = ['Datos', 'Entrega', 'Pago', 'Confirmación'] as const;

interface ContactForm {
  name: string; cedula: string; phone: string;
}
interface AddressForm {
  zoneId: string; details: string; notes: string;
}
/* Formulario del paso Pago: forma + campos viven en paymentMethods.ts (5.79):
   una sola fuente de verdad compartida con el panel y los tests. */
/** Comprobante ya comprimido y listo para viajar con createOrder (5i-k). */
interface ReceiptReady {
  name: string;
  sizeKb: number;
  base64: string;
  /** dataURL para el visor: el cliente VE su foto, no solo el nombre (5.15). */
  previewUrl: string;
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
  // Tasa BCV en vivo: para mostrar el envío por zona en Bs en el selector.
  const liveRate = useBcvRate();

  const [step, setStep] = useState(0);
  const [fulfillment, setFulfillment] = useState<FulfillmentMode>('delivery');
  const [contact, setContact] = useState<ContactForm>({ name: '', cedula: '', phone: '' });
  const [address, setAddress] = useState<AddressForm>({ zoneId: '', details: '', notes: '' });
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [payment, setPayment] = useState<PaymentFormState>(EMPTY_PAYMENT_FORM);
  const [pickupInfo, setPickupInfo] = useState<{ address: string; hours: string }>({ address: '', hours: '' });
  // 5.112-B: franja REAL del delivery (settings/general) + reloj de Venezuela.
  const [franja, setFranja] = useState<FranjaDelivery>({ start: '', end: '' });
  const [nowMin, setNowMin] = useState(() => minutosAhoraCaracas());
  const [reservation, setReservation] = useState<ReservationResponse | null>(null);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoteState, setQuoteState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [created, setCreated] = useState<CreateOrderResponse | null>(null);
  // FLUJO ESTRICTO (5i-k): comprobante obligatorio en el paso Pago.
  const [receipt, setReceipt] = useState<ReceiptReady | null>(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);
  // POLÍTICA DEL DUEÑO (5.26): cancelar solo en el paso Pago y solo SIN
  // comprobante. Tras pagar (comprobante adjunto) y tras confirmar el pedido
  // NO existe cancelación para el cliente, ni aviso de WhatsApp.
  const [cancelOpen, setCancelOpen] = useState(false);

  // Reserva de stock 2 h al entrar al checkout (5.2).
  // Ronda 5i-b: guard con useRef — StrictMode (dev) monta→desmonta→monta y
  // disparaba DOS fn-reserveStock simultáneos, justo cuando el servidor está
  // en frío tras reiniciar netlify dev (la 1ª llamada tarda 10-30 s locales).
  // Con una sola llamada y la reserva idempotente por uid del servidor
  // (Ronda 5i-b), reintentar es seguro: libera el hold anterior y crea el
  // nuevo sin apilar stockReserved fantasma.
  const reserveFired = useRef(false);
  useEffect(() => {
    if (isEmpty || reserveFired.current) return;
    reserveFired.current = true;
    const reservar = (intento: number) => {
      void reserveStock(
        items.map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.qty })),
      )
        .then((res) => {
          setReservation(res);
        })
        .catch(() => {
          // 1 reintento automático: el arranque en frío de netlify dev a veces
          // supera los 25 s del cliente; el 2º intento ya va tibio y la
          // reserva es idempotente en el servidor. Si también falla, no
          // bloquea el flujo: al confirmar, createOrder revalida el stock.
          if (intento === 0) setTimeout(() => reservar(1), 1500);
        });
    };
    reservar(0);
    // Sin cleanup alive: React 18 hace no-op el setState tras desmontar y una
    // reserva huérfana se libera sola (vence ≤2 h; la barre el servidor o la
    // próxima reserva del mismo uid la reemplaza).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Datos precargados del perfil. El teléfono vive en users/{uid}.phoneE164
  // como +58XXXXXXXXX (uso interno): al cliente NUNCA se le muestra el +58,
  // se normaliza a formato local 04XXXXXXXXX antes de tocar la pantalla.
  // 5.75: la cédula y la dirección del registro/«Mis datos» prellenan el
  // contacto, la dirección de entrega Y la «Cédula del pagador» del pago
  // móvil (casi siempre es la misma persona). Solo si el campo está vacío:
  // lo que el cliente ya escribió en esta compra JAMÁS se pisa.
  useEffect(() => {
    if (user) {
      setContact((c) => ({
        ...c,
        name: user.name || c.name,
        phone: normalizePhoneVE(user.phone ?? '') || c.phone,
        cedula: c.cedula || user.cedula || '',
      }));
      setAddress((a) => ({ ...a, details: a.details || user.address || '' }));
      setPayment((p) => ({ ...p, cedula: p.cedula || user.cedula || '' }));
    }
  }, [user]);

  // Datos del local para retiro (settings/general, editable en /admin/ajustes).
  useEffect(() => {
    let alive = true;
    void getGeneralSettings()
      .then((g) => {
        if (alive && g) {
          setPickupInfo({ address: g.pickupAddress, hours: g.pickupHours });
          // 5.112-B: la franja viaja en la MISMA lectura de settings/general
          // que ya se hace para el retiro: cero lecturas extra a Firestore.
          setFranja({ start: g.deliveryStart, end: g.deliveryEnd });
        }
      })
      .catch(() => {
        /* sin ajustes: usamos el texto por defecto de retiro */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 5.112-B: reloj vivo cada 30 s — si el cliente deja el checkout abierto al
  // cruzar el límite de la franja, la app reacciona sola, sin recargar.
  useEffect(() => {
    const t = window.setInterval(() => setNowMin(minutosAhoraCaracas()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  // 5.112-B: ¿delivery DISPONIBLE ahora mismo? Sin franja guardada = siempre
  // disponible (los ajustes viejos no restringen nada hasta que el dueño
  // guarde la franja). Manda en la UI (opción deshabilitada) y en los guards.
  const deliveryOk = useMemo(
    () => deliveryAbierto(franja, nowMin),
    [franja, nowMin],
  );
  // "12:00"–"23:59" → "de 12:00 pm a 11:59 pm". '' si no hay franja válida.
  const franjaTexto =
    esHHMM(franja.start) && esHHMM(franja.end) && franja.start !== franja.end
      ? `de ${hhmmBonito(franja.start)} a ${hhmmBonito(franja.end)}`
      : '';

  // 5.112-B: si el delivery CERRÓ (o ya estaba cerrado al entrar al checkout),
  // el cliente vuela a RETIRO EN TIENDA con aviso claro. El backend revalida
  // la franja al crear la orden: doble llave — jamás un envío fuera de horario.
  useEffect(() => {
    if (created || deliveryOk || fulfillment !== 'delivery') return;
    setFulfillment('pickup');
    toast.warning(
      franjaTexto
        ? `El envío a domicilio solo está disponible ${franjaTexto}. Tomamos tu pedido para RETIRO EN TIENDA.`
        : 'El envío a domicilio no está disponible ahora. Tomamos tu pedido para RETIRO EN TIENDA.',
    );
  }, [created, deliveryOk, fulfillment, franjaTexto]);

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

  // Formas de pago: primero Firestore (el dueño activa/desactiva desde
  // /admin/ajustes sin deploy); si aún no hay documento o falla la red, se
  // usa la semilla. El checkout SOLO ofrece las formas activas (5.79).
  const [accounts, setAccounts] = useState<readonly PaymentAccount[]>(DEFAULT_PAYMENT_ACCOUNTS);
  useEffect(() => {
    let alive = true;
    void getPaymentAccounts()
      .then((a) => {
        if (alive && a) setAccounts(a);
      })
      .catch(() => {
        /* respaldo silencioso: seguimos con la semilla del repo */
      });
    return () => {
      alive = false;
    };
  }, []);

  const activeAccounts = useMemo(() => activeAccountsOf(accounts), [accounts]);
  // Cuenta ELEGIDA (5.80: puede haber varias del mismo método — el cliente
  // escoge una concreta, no solo un método). Si la elegida se desactivó (o
  // Firestore cargó tarde), cae a la primera activa y se sincroniza solo.
  const [accId, setAccId] = useState<string | null>(null);
  const zoneAccount = useMemo(
    () => activeAccounts.find((a) => accountKey(a) === accId) ?? activeAccounts[0] ?? null,
    [activeAccounts, accId],
  );
  useEffect(() => {
    if (zoneAccount && (zoneAccount.method !== payment.method || accountKey(zoneAccount) !== accId)) {
      setPayment((p) => ({ ...p, method: zoneAccount.method }));
      setAccId(accountKey(zoneAccount));
    }
  }, [zoneAccount, accId, payment.method]);
  // QR solo en formas electrónicas: en contra-entrega no hay QR que escanear.
  const payQr = zoneAccount && PAYMENT_REQUIRES_RECEIPT[zoneAccount.method]
    ? qrForAccount(zoneAccount)
    : null;
  // 5.86 · lightbox del QR: el cliente TOCA el QR y se abre AMPLIADO para
  // escanearlo cómodo desde su app bancaria (o mostrarlo a quien cobra).
  const [qrZoom, setQrZoom] = useState(false);
  // Cuántas cuentas activas hay de cada método: los chips se distinguen
  // («Transferencia · Banesco») solo cuando hace falta.
  const siblingsOf = useMemo(() => {
    const m = new Map<PaymentMethod, number>();
    for (const a of activeAccounts) m.set(a.method, (m.get(a.method) ?? 0) + 1);
    return (a: PaymentAccount) => m.get(a.method) ?? 1;
  }, [activeAccounts]);
  /** ¿La forma elegida exige comprobante? Contra entrega (efectivo/punto de
   *  venta) no: se cobra al recibir y no se pide foto ni formulario. */
  const needsReceipt = PAYMENT_REQUIRES_RECEIPT[payment.method];

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

  /* ── FLUJO ESTRICTO: comprobante de pago (5i-k) ──
   * Misma política que «Ver mi pedido»: solo imágenes JPG/PNG/WebP (los
   * bancos entregan capturas; si el cliente tiene PDF, captura de pantalla),
   * tope de 12 MB y compresión local a JPEG antes de viajar. La imagen se
   * guarda COMPRIMIDA en el estado y viaja con fn-createOrder: si imgbb
   * falla, el servidor rechaza y NO se crea pedido sin pago. */
  const pickReceipt = async (file: File | null): Promise<void> => {
    if (!file) return;
    if (!isAllowedUploadType(file.type, RECEIPT_IMAGE_TYPES)) {
      toast.error('Solo imágenes JPG, PNG o WebP. Si tu comprobante es PDF, toma una captura de pantalla.');
      return;
    }
    if (file.size > MAX_INPUT_MB * 1024 * 1024) {
      toast.error(`La imagen pasa de ${MAX_INPUT_MB} MB. Toma una captura más liviana.`);
      return;
    }
    setReceiptBusy(true);
    try {
      const base64 = await fileToBase64(file);
      // dataURL del visor: la compresión interna pasa a JPEG salvo las
      // imágenes ya livianas (≤350 KB), que viajan tal cual en su formato.
      const mime = file.size <= 350 * 1024 ? file.type : 'image/jpeg';
      setReceipt({
        name: file.name,
        sizeKb: Math.max(1, Math.round(file.size / 1024)),
        base64,
        previewUrl: `data:${mime};base64,${base64}`,
      });
      setErrors((e) => ({ ...e, receipt: null }));
    } catch (err) {
      if (err instanceof Error && err.message === 'too-big') {
        toast.error('La imagen quedó muy grande incluso comprimida. Toma una captura de menos resolución.');
      } else {
        toast.error('No pudimos leer la imagen. Prueba con otra.');
      }
    } finally {
      setReceiptBusy(false);
    }
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
    // 5.112-B: candado del paso Entrega — si el delivery cerró mientras el
    // cliente llenaba el formulario, vuela a retiro y el paso queda válido.
    if (fulfillment === 'delivery' && !deliveryOk) {
      setFulfillment('pickup');
      toast.warning('El envío a domicilio cerró hace un momento. Tomamos tu pedido para RETIRO EN TIENDA.');
      setErrors({});
      return true;
    }
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
    // Reglas por método (banco/cédula/teléfono en VE; titular/confirmación en
    // Zelle/Binance) viven en paymentMethods.validatePaymentForm (5.79).
    // Contra entrega (5.80): sin formulario ni comprobante — solo avanzar.
    const e = validatePaymentForm(payment);
    // FLUJO ESTRICTO (5i-k): sin comprobante no se avanza — SOLO en las formas
    // electrónicas. Efectivo y punto de venta se cobran al recibir (5.80).
    if (needsReceipt && !receipt) e['receipt'] = 'Adjunta la foto del comprobante de pago.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  /* ── Confirmación: crea la orden vía Cloud Function ── */
  const confirm = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!user) return;
    // Guard de doble llave: en formas electrónicas, sin comprobante no se
    // llama al servidor (5i-k). Contra entrega no necesita foto (5.80).
    if (needsReceipt && !receipt) {
      toast.error('Adjunta la foto del comprobante de pago.');
      setStep(2);
      return;
    }
    // 5.112-B: candado final en cliente — si el delivery cerró entre el paso
    // Entrega y aquí, vuela a retiro. El backend revalida la franja igual.
    if (fulfillment === 'delivery' && !deliveryOk) {
      setFulfillment('pickup');
      toast.warning('El envío a domicilio cerró. Tu pedido sigue como RETIRO EN TIENDA: revisa y confirma.');
      setStep(1);
      return;
    }
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

      // Claves por método (banco, titular, referencia, fecha…): el antifraude
      // del backend calcula refHash desde `referencia` en TODAS las formas (5.79).
      // 5.80: `cuenta` viaja cuando el dueño nombró la cuenta (ej. «Banesco»)
      // — la cajera sabe a cuál cuenta de recaudo llegó el pago.
      const paymentDetails: Record<string, string> = {
        ...buildPaymentDetails(payment),
        ...(zoneAccount?.label?.trim() ? { cuenta: zoneAccount.label.trim() } : {}),
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
          // FLUJO ESTRICTO (5i-k): el comprobante viaja CON la orden. El
          // servidor lo sube a imgbb ANTES de escribir el documento: si la
          // subida falla, NO hay pedido y el cliente reintenta sin perder
          // nada (la imagen sigue aquí, lista para reenviar).
          // Contra entrega (5.80): vacío — el servidor NO pide imagen.
          receiptImage: needsReceipt && receipt ? receipt.base64 : '',
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
      if (e instanceof AppError && e.message.startsWith('Delivery cerrado')) {
        // 5.112-B: el backend vio la franja cerrada (el reloj cruzó justo al
        // confirmar). Vuelta al paso Entrega como retiro: nada se pierde.
        setFulfillment('pickup');
        setStep(1);
        toast.warning('El envío a domicilio cerró justo ahora. Tu pedido sigue como RETIRO EN TIENDA: revisa y confirma.');
      } else {
        toast.error(userMessage(e));
      }
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
            <Row
              label="Envío"
              value={
                created.totals.shippingUsd === 0
                  ? 'Gratis'
                  : created.totals.shippingVes && created.totals.shippingVes > 0
                    ? formatBs(created.totals.shippingVes)
                    : formatBs(usdToBs(created.totals.shippingUsd, created.totals.rateUsed))
              }
            />
            {(created.totals.ivaPercent ?? 0) > 0 && (
              <Row
                label={`IVA (${String(created.totals.ivaPercent).replace('.', ',')}%)`}
                value={
                  created.totals.ivaVes && created.totals.ivaVes > 0
                    ? formatBs(created.totals.ivaVes)
                    : formatBs(usdToBs(created.totals.ivaUsd ?? 0, created.totals.rateUsed))
                }
              />
            )}
          </dl>
          {/* FLUJO ESTRICTO (5i-k): el comprobante ya viajó con el pedido.
              Ya no se pide «sube tu comprobante»: el siguiente paso es la
              verificación del pago por el personal, con aviso por push.
              Contra entrega (5.80): no hay comprobante — se dice cuándo y
              con qué se paga. */}
          <div className="mt-6 rounded-brand border-2 border-line bg-ink p-4 text-left">
            <p className="spot-label mb-1">Siguiente paso</p>
            <p className="text-body-base text-paper">
              {needsReceipt ? (
                <>Recibimos tu comprobante ({PAYMENT_METHOD_LABELS[payment.method]}): tu pedido ya está en la cola de
                verificación. Te avisamos con una notificación apenas confirmemos el pago.</>
              ) : (
                <>Tu pedido ya está en cola. {payment.method === 'efectivo'
                  ? 'Prepara el efectivo: pagas al recibir (monto exacto si puedes).'
                  : 'Ten tu tarjeta lista: pagas en el punto de venta al recibir.'}
                </>
              )}
            </p>
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
              <Input label="Teléfono" type="tel" inputMode="numeric" value={contact.phone} onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value }))} placeholder="04243036024" hint="Empieza con 0412, 0414, 0416, 0422, 0424 o 0426." error={errors['phone']} required />
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
                  // 5.112-B: fuera de la franja la opción NO se elige — solo
                  // retiro en tienda (el dueño manda el horario desde Ajustes).
                  disabled={!deliveryOk}
                  onClick={() => setFulfillment('delivery')}
                  className={`rounded-brand border-2 p-4 text-left transition ${
                    !deliveryOk
                      ? 'cursor-not-allowed border-line opacity-60'
                      : fulfillment === 'delivery'
                        ? 'border-signal bg-signal/10'
                        : 'border-line hover:border-muted'
                  }`}
                >
                  <p className={`font-display text-sm font-bold italic uppercase ${fulfillment === 'delivery' && deliveryOk ? 'text-signal' : 'text-paper'}`}>
                    Envío a domicilio
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {!deliveryOk
                      ? `Cerrado ahora${franjaTexto ? ` · Entregamos ${franjaTexto}` : ''}. Hoy toca retiro en tienda.`
                      : `Llevamos tu pedido a tu zona en Maracay, Aragua.${franjaTexto ? ` Entregamos ${franjaTexto}.` : ''}`}
                  </p>
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
                  {!deliveryOk && (
                    <p className="mt-2 text-sm font-semibold text-signal">
                      Envío a domicilio cerrado ahora{franjaTexto ? ` (entregamos ${franjaTexto})` : ''}: solo retiro en tienda.
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted">
                    Paga con Pago Móvil y adjunta el comprobante en el siguiente paso.
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
                        {z.name} · Envío {liveRate ? formatBs(usdToBs(z.feeUsd, liveRate.rate)) : 'por zona'} · {z.etaMinMinutes}-{z.etaMaxMinutes} min
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
                        <Row
                          label="Subtotal"
                          value={
                            quote.subtotalVes && quote.subtotalVes > 0
                              ? formatBs(quote.subtotalVes)
                              : formatBs(usdToBs(quote.subtotalUsd, quote.rateUsed))
                          }
                        />
                        <Row
                          label="Envío"
                          value={
                            quote.shippingUsd === 0
                              ? fulfillment === 'pickup'
                                ? 'Retiro en tienda · Gratis'
                                : 'Gratis'
                              : quote.shippingVes && quote.shippingVes > 0
                                ? formatBs(quote.shippingVes)
                                : formatBs(usdToBs(quote.shippingUsd, quote.rateUsed))
                          }
                        />
                        {(quote.ivaPercent ?? 0) > 0 && (
                          <Row
                            label={`IVA (${String(quote.ivaPercent).replace('.', ',')}%)`}
                            value={
                              quote.ivaVes && quote.ivaVes > 0
                                ? formatBs(quote.ivaVes)
                                : formatBs(usdToBs(quote.ivaUsd ?? 0, quote.rateUsed))
                            }
                          />
                        )}
                        <Row label="Total a pagar" value={formatBs(quote.totalVes)} strong />
                      </dl>
                    </>
                  ) : (
                    <div className="mt-3">
                      {/* El backend EXIGE tasa publicada para cotizar: si llegara
                          en cero (no debería), tratamos igual que un fallo. */}
                      <p className="text-muted">
                        No pudimos calcular el monto exacto en bolívares en este
                        momento. Reintenta en unos minutos.
                      </p>
                      <Button variant="secondary" className="mt-3" type="button" onClick={() => setQuoteAttempt((n) => n + 1)}>
                        Reintentar
                      </Button>
                    </div>
                  )
                ) : quoteState === 'error' ? (
                  <div className="mt-3">
                    <p className="text-muted">
                      No pudimos calcular tus montos en este momento. Verifica tu conexión y reintenta.
                    </p>
                    <Button variant="secondary" className="mt-3" type="button" onClick={() => setQuoteAttempt((n) => n + 1)}>
                      Reintentar
                    </Button>
                  </div>
                ) : (
                  <p className="mt-3 text-muted">Calculando montos exactos…</p>
                )}
              </section>

              {/* Formas de pago (5.79 + 5.80): chips por CUENTA — el dueño
                  puede tener varias del mismo método (ej. transferencias de
                  varios bancos) y el cliente elige la suya. Sin cuenta activa
                  no hay checkout: se ofrece WhatsApp como canal de rescate. */}
              <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
                <h2 className="font-display text-lg font-bold italic uppercase text-paper">Método de pago</h2>
                <p className="mt-2 text-sm text-muted">{PAYMENT_INSTRUCTIONS[payment.method]}</p>
                {activeAccounts.length === 0 ? (
                  <p className="mt-4 rounded-brand border-2 border-dashed border-line bg-ink p-4 text-sm text-muted">
                    No hay formas de pago activas ahora mismo. Escríbenos por WhatsApp para coordinar tu compra.
                  </p>
                ) : (
                  <>
                    <div role="radiogroup" aria-label="Formas de pago" className="mt-4 grid gap-2 sm:grid-cols-2">
                      {activeAccounts.map((a) => {
                        const on = zoneAccount !== null && accountKey(a) === accountKey(zoneAccount);
                        return (
                          <button
                            key={accountKey(a)}
                            type="button"
                            role="radio"
                            aria-checked={on}
                            onClick={() => {
                              setPayment((p) => ({ ...p, method: a.method }));
                              setAccId(accountKey(a));
                            }}
                            className={`rounded-brand border-2 px-4 py-3 text-left font-body font-semibold transition active:scale-[0.98] ${
                              on
                                ? 'border-signal bg-signal/10 text-signal'
                                : 'border-line bg-ink text-paper hover:border-muted'
                            }`}
                          >
                            {accountChipLabel(a, siblingsOf(a))}
                          </button>
                        );
                      })}
                    </div>

                    {/* Datos de recaudación — cada dato con su ícono de copiar
                        (5.79): el cliente pega cada campo directo en su app
                        bancaria. El RIF se copia SOLO con los números; el
                        total, como número limpio (sin «Bs.» ni miles).
                        Contra entrega (5.80): sin bloque de datos — no hay
                        cuenta a la que transferir, se paga al recibir. */}
                    {zoneAccount && needsReceipt && (
                      <div className="mt-4 rounded-brand border-2 border-dashed border-line bg-ink p-4">
                        <p className="spot-label mb-2">Datos de SPOT 24 para pagar</p>
                        <ul className="space-y-2 text-body-base text-paper">
                          {copyRowsForAccount(zoneAccount).map((r) => (
                            <CopyRow key={r.label} label={r.label} value={r.value} copy={r.copy} />
                          ))}
                          {quoteState === 'ok' && quote && (
                            <li className="flex items-center justify-between gap-3 border-t border-line pt-2">
                              <span>
                                Total a pagar:{' '}
                                <strong className="font-display text-lg italic text-signal">{formatBs(quote.totalVes)}</strong>
                              </span>
                              <CopyButton label="Total a pagar" value={cleanAmountBs(quote.totalVes)} />
                            </li>
                          )}
                        </ul>
                        {/* QR de la cuenta (5.79): pagar sin teclear datos.
                            Fondo blanco: los lectores necesitan contraste.
                            5.86: TOCABLE — lo abre AMPLIADO para escanearlo. */}
                        {payQr && (
                          <div className="mt-3 flex items-center gap-3 border-t border-line pt-3">
                            <button
                              type="button"
                              onClick={() => setQrZoom(true)}
                              aria-label="Ampliar el código QR para escanearlo"
                              aria-haspopup="dialog"
                              className="shrink-0 cursor-zoom-in rounded-brand border-2 border-line bg-white p-1 transition-transform hover:scale-105 active:scale-95"
                            >
                              <img
                                src={payQr}
                                alt="Código QR para pagar"
                                loading="lazy"
                                className="h-36 w-36"
                              />
                            </button>
                            <p className="text-xs text-muted">
                              Escanea el QR con tu app del banco: te llena los datos solo. <strong className="text-paper">Tócalo para ampliarlo.</strong> Después vuelve aquí y registra el pago.
                            </p>
                          </div>
                        )}
                        <p className="mt-2 text-xs text-muted">
                          Toca el ícono de copiar junto a cada dato y pégalo en tu app bancaria.
                        </p>
                      </div>
                    )}

                    {/* Formulario del pago: campos según la forma elegida (5.79).
                        Contra entrega (5.80): sin formulario — nada que llenar. */}
                    {usesVeForm(payment.method) ? (
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
                    ) : payment.method === 'zelle' ? (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Input label="Banco de origen (ej. Chase, BofA)" value={payment.banco} onChange={(e) => setPayment((p) => ({ ...p, banco: e.target.value }))} placeholder="Chase" error={errors['banco']} required />
                        <Input label="Titular de la cuenta que paga" value={payment.titular} onChange={(e) => setPayment((p) => ({ ...p, titular: e.target.value }))} placeholder="Nombre y apellido" error={errors['titular']} required />
                        <Input label="Número de confirmación" value={payment.referencia} onChange={(e) => setPayment((p) => ({ ...p, referencia: e.target.value.trim().slice(0, 40) }))} placeholder="U123456789" error={errors['referencia']} required />
                        <Input label="Fecha del pago" type="date" value={payment.fecha} onChange={(e) => setPayment((p) => ({ ...p, fecha: e.target.value }))} error={errors['fecha']} required />
                      </div>
                    ) : payment.method === 'binance' ? (
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <Input label="Usuario Binance (correo o teléfono)" value={payment.titular} onChange={(e) => setPayment((p) => ({ ...p, titular: e.target.value }))} placeholder="tucorreo@mail.com" error={errors['titular']} required />
                        <Input label="Order ID de la transacción" value={payment.referencia} onChange={(e) => setPayment((p) => ({ ...p, referencia: e.target.value.trim().slice(0, 40) }))} placeholder="123456789012" error={errors['referencia']} required />
                        <Input label="Fecha del pago" type="date" value={payment.fecha} onChange={(e) => setPayment((p) => ({ ...p, fecha: e.target.value }))} error={errors['fecha']} required />
                      </div>
                    ) : (
                      <p className="mt-4 rounded-brand border-2 border-dashed border-line bg-ink p-4 text-sm text-muted">
                        {payment.method === 'efectivo'
                          ? 'Paga en efectivo al recibir tu pedido (o en tienda al retirar). No necesitas nada más: confirmamos y preparamos.'
                          : 'Paga con tu tarjeta en el punto de venta al recibir tu pedido (o en tienda al retirar). No necesitas nada más: confirmamos y preparamos.'}
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* FLUJO ESTRICTO (5i-k): comprobante OBLIGATORIO aquí — SOLO en
                  formas electrónicas. Contra entrega (5.80) no hay foto: se
                  cobra al recibir (efectivo o terminal). El pedido nace con el
                  pago incluido y el cajero solo ve pedidos ya pagados: nadie
                  aprobará a ciegas ni llamará «para pedir el comprobante». */}
              {needsReceipt ? (
                <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6" aria-label="Comprobante de pago">
                  <h2 className="font-display text-lg font-bold italic uppercase text-paper">Comprobante de pago</h2>
                  <p className="mt-2 text-sm text-muted">
                    Adjunta la foto o captura del comprobante de tu {PAYMENT_METHOD_LABELS[payment.method]}.
                  </p>
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  aria-label="Adjuntar comprobante de pago"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    void pickReceipt(f);
                    // Reset del value: elegir la MISMA foto otra vez re-dispara onChange.
                    e.target.value = '';
                  }}
                />
                {receipt ? (
                  <div className="mt-4 flex flex-wrap items-center gap-4 rounded-brand border-2 border-signal bg-signal/10 p-4">
                    {/* El cliente VE su comprobante (5.15): imagen en línea, no solo el nombre. */}
                    <img
                      src={receipt.previewUrl}
                      alt="Comprobante de pago adjuntado"
                      className="h-32 w-32 shrink-0 rounded-brand border-2 border-line object-cover"
                    />
                    {/* basis-52: en teléfono estrecho la columna baja a su propia
                        línea (el flex-wrap del padre la empuja) y los botones
                        nunca se salen del borde rojo. En ≥sm queda lado a lado. */}
                    <div className="min-w-0 flex-1 basis-52">
                      <p className="spot-label text-signal">Comprobante listo</p>
                      <p className="mt-1 text-xs text-muted">{receipt.sizeKb} KB</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" type="button" onClick={() => receiptInputRef.current?.click()}>
                          Cambiar
                        </Button>
                        <Button
                          variant="danger-ghost"
                          size="sm"
                          type="button"
                          onClick={() => {
                            setReceipt(null);
                            setErrors((e) => ({ ...e, receipt: 'Adjunta la foto del comprobante de pago.' }));
                          }}
                        >
                          Quitar
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4">
                    <Button variant="secondary" type="button" loading={receiptBusy} onClick={() => receiptInputRef.current?.click()}>
                      Adjuntar comprobante (foto)
                    </Button>
                    <p className="mt-2 text-xs text-muted">JPG, PNG o WebP · hasta {MAX_INPUT_MB} MB.</p>
                  </div>
                )}
                {errors['receipt'] && (
                  <p className="mt-2 text-sm font-semibold text-signal">{errors['receipt']}</p>
                )}
                </section>
              ) : (
                <section className="rounded-brand-lg border-2 border-signal bg-signal/10 p-6" aria-label="Pago contra entrega">
                  <h2 className="font-display text-lg font-bold italic uppercase text-paper">Pago contra entrega</h2>
                  <p className="mt-2 text-sm text-paper">
                    {payment.method === 'efectivo'
                      ? 'Pagarás EN EFECTIVO al recibir tu pedido (o al retirar en tienda). Si puedes, ten el monto exacto: el mensajero lleva el total anotado.'
                      : 'Pagarás con tu TARJETA en el punto de venta al recibir tu pedido (o al retirar en tienda). El terminal va listo con el total exacto.'}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    Sin comprobante que subir: confirma y tu pedido entra en cola.
                  </p>
                </section>
              )}

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
              {/* POLÍTICA DEL DUEÑO (5.26): la cancelación vive AQUÍ y SOLO
                  mientras NO haya comprobante adjunto (aún no pagó). Con el
                  comprobante listo el botón desaparece sin aviso: después de
                  pagar no existe cancelación para el cliente. */}
              {!receipt && (
                <Button variant="danger-ghost" type="button" fullWidth onClick={() => setCancelOpen(true)}>
                  Cancelar pedido
                </Button>
              )}
              {quoteState !== 'ok' && (
                <p className="text-center text-sm text-muted">
                  Esperando los montos exactos para seguir.
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
                  <Row
                    label={needsReceipt ? 'Comprobante' : 'Pago'}
                    value={needsReceipt
                      ? (receipt ? 'Foto adjuntada ✓' : 'Sin adjuntar')
                      : 'Contra entrega · al recibir'}
                  />
                  {quote && (
                    <Row
                      label="Total a pagar"
                      value={formatBs(quote.totalVes)}
                      strong
                    />
                  )}
                </dl>
              </section>
              <div className="flex gap-3">
                <Button variant="secondary" type="button" onClick={() => setStep(2)} disabled={busy}>Volver</Button>
                <Button size="lg" className="flex-1" loading={busy} onClick={(e) => void confirm(e as unknown as FormEvent)}>
                  Confirmar pedido
                </Button>
              </div>
              {/* POLÍTICA DEL DUEÑO (5.26): sin botón de cancelar en Revisión:
                  aquí siempre se llega ya con el comprobante (pagó). */}
            </div>
          )}
        </form>
      )}

      {/* POLÍTICA DEL DUEÑO (5.26): cancelar SOLO en el paso Pago y sin
          comprobante. Aquí no hay pedido creado todavía: al salir, el carrito
          queda igual y la reserva de stock expira sola a las 2 h (sin acción
          del cliente). */}
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancelar pedido">
        <p className="text-body-base text-paper">
          Todavía no hay pedido ni cobro: tu carrito queda igual. ¿Seguro que quieres salir?
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" fullWidth onClick={() => setCancelOpen(false)}>
            Seguir pagando
          </Button>
          <Button variant="danger-ghost" fullWidth onClick={() => navigate('/carrito')}>
            Sí, cancelar
          </Button>
        </div>
      </Modal>

      {/* 5.86 · QR AMPLIADO (pide el dueño): al tocar el QR del checkout se
          abre a pantalla grande para escanearlo bien desde la app del banco.
          Cierra con la ✕, tocando el fondo o con ESC (el Modal lo trae). */}
      {payQr && zoneAccount && qrZoom && (
        <Modal
          open
          onClose={() => setQrZoom(false)}
          title={`QR · ${accountChipLabel(zoneAccount, siblingsOf(zoneAccount))}`}
        >
          <div className="flex flex-col items-center gap-4">
            <img
              src={payQr}
              alt="Código QR ampliado para pagar"
              className="w-full max-w-[380px] rounded-brand border-2 border-line bg-white p-2"
            />
            <p className="text-center text-sm text-muted">
              Aquí lo tienes más grande para que lo escanees bien. Cuando el banco
              te muestre los datos, confirma y vuelve aquí para registrar tu pago.
            </p>
          </div>
        </Modal>
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

/** Fila de dato de pago con su ícono de copiar (5.79; antes decía «Copiar»). */
function CopyRow({ label, value, copy }: { label: string; value: string; copy: string }) {
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        {label}: <strong className="break-all">{value}</strong>
      </span>
      <CopyButton label={label} value={copy} />
    </li>
  );
}

/** Ícono de copiar (dos hojas superpuestas, trazo 5.79). */
function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

/** Botón ícono de copiar: feedback por toast; solo reporta éxito si el texto
 *  REALMENTE llegó al portapapeles (Clipboard API con respaldo execCommand).
 *  Ronda 5.79: ya no dice «Copiar» — cuadrado con el ícono y aria-label. */
function CopyButton({ label, value }: { label: string; value: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        void copyText(value).then((ok) => {
          if (ok) toast.success(`${label} copiado.`);
          else toast.error('No se pudo copiar. Cópialo a mano.');
        });
      }}
      className="grid h-8 w-8 shrink-0 place-items-center rounded-brand border border-line text-signal transition hover:bg-signal/10 active:scale-95"
      aria-label={`Copiar ${label}`}
      title={`Copiar ${label}`}
    >
      <CopyIcon />
    </button>
  );
}