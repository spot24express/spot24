/**
 * Ajustes · Formas de pago (settings/payment_accounts) + Operación (settings/general).
 * Ronda 5.80: la sección de pago es una LISTA DE CUENTAS:
 * · El dueño puede tener VARIAS cuentas del mismo método (ej. transferencias
 *   de Banesco y del BNC, dos Pago Móvil) — cada una con su nombre, sus datos
 *   y SU QR.
 * · El QR se SUBE como archivo (igual que las fotos de productos:
 *   fn-uploadImage → imgbb) o se pega un enlace — a elegir.
 * · Agregar y quitar cuentas; interruptor Activo/Inactivo por cuenta.
 * El cliente solo ve en el checkout las cuentas ACTIVAS (chips por cuenta).
 * Guardar aplica al instante en producción — sin deploy, sin código.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input, Select } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { VE_BANKS, DEFAULT_PAYMENT_ACCOUNTS } from '@/shared/constants/brand';
import type { PaymentAccount } from '@/shared/constants/brand';
import { PAYMENT_METHOD_ORDER, PAYMENT_METHOD_LABELS } from '@/shared/constants/orders';
import type { PaymentMethod } from '@/shared/constants/orders';
import {
  getPaymentAccounts, savePaymentAccounts,
  getGeneralSettings, saveGeneralSettings, GENERAL_SEED,
} from '@/shared/services/settings.service';
import { adminUploadImage } from '../services/imageUpload.service';
import {
  accountChipLabel, copyRowsForAccount, isValidBinanceId, isValidHolderName,
  isValidQrUrl, newAccountId, qrForAccount, usesVeForm,
} from '@/shared/lib/paymentMethods';
import { isValidPhoneVE, isValidEmail, sanitizeDigits, sanitizeText } from '@/shared/lib/validation';
import { userMessage } from '@/shared/lib/errors';
import { waHref } from '@/shared/lib/whatsapp';

/** RIF venezolano: letra inicial + 8 dígitos + verificador (J-12345678-9). */
const RIF_RE = /^[JGVEP]-\d{8}-\d$/;

/** Formulario de UNA cuenta de recaudo (los campos sobran según el método). */
interface AccountForm {
  /** Clave de UI de la sesión (no se guarda en Firestore). */
  key: string;
  /** Id real de la cuenta. '' = cuenta nueva (se genera al guardar). */
  id: string;
  method: PaymentMethod;
  active: boolean;
  /** Nombre para distinguir cuentas del mismo método (opcional). */
  label: string;
  bank: string;
  rif: string;
  phone: string;
  accountNumber: string;
  email: string;
  holderName: string;
  binanceId: string;
  qrUrl: string;
}

/** Contador de claves de UI: únicas aunque agregues/quites en la misma sesión. */
let keySeq = 0;
const nextKey = (): string => `acc-${keySeq++}`;

/** Cuenta guardada (+ semilla de respaldo) → formulario.
 *  Si la cuenta de Firestore no definió QR y es Pago Móvil, se prellena con
 *  el QR empaquetado del repo (el del dueño): guardar una vez y queda fijo. */
function toAccountForm(saved: PaymentAccount): AccountForm {
  return {
    key: nextKey(),
    id: saved.id ?? saved.method,
    method: saved.method,
    active: saved.active !== false,
    label: saved.label ?? '',
    bank: saved.bank ?? '',
    rif: saved.rif ?? '',
    phone: saved.phone ?? '',
    accountNumber: saved.accountNumber ?? '',
    email: saved.email ?? '',
    holderName: saved.holderName ?? '',
    binanceId: saved.binanceId ?? '',
    // 5.84 · el formulario carga SOLO el QR propio de la cuenta: si no tiene,
    // queda vacío (antes se inyectaba el QR del repo y al guardar quedaba
    // grabado en la cuenta — un segundo Pago Móvil heredaba el QR del otro).
    qrUrl: saved.qrUrl ?? '',
  };
}

const EMPTY_FORM_FIELDS = {
  label: '',
  bank: '',
  rif: '',
  phone: '',
  accountNumber: '',
  email: '',
  holderName: '',
  binanceId: '',
  qrUrl: '',
};

interface GeneralForm {
  ivaPercent: string;
  whatsappNumber: string;
  pickupAddress: string;
  pickupHours: string;
  deliveryHours: string;
}

const EMPTY_GENERAL: GeneralForm = {
  ivaPercent: '0',
  whatsappNumber: '',
  pickupAddress: '',
  pickupHours: '',
  deliveryHours: GENERAL_SEED.deliveryHours,
};

export default function AdminSettingsPage() {
  useDocumentTitle('Ajustes');
  const [accounts, setAccounts] = useState<AccountForm[] | null>(null);
  const [general, setGeneral] = useState<GeneralForm>(EMPTY_GENERAL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [savedGeneralAt, setSavedGeneralAt] = useState<number | null>(null);
  /** De dónde salió lo que ves: 'seed' = placeholders del código, 'firestore' = ya guardado. */
  const [source, setSource] = useState<'seed' | 'firestore' | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  /** Subida de QR en curso: la clave de la cuenta (para el loading del botón). */
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(false);
    void Promise.all([getPaymentAccounts(), getGeneralSettings()])
      .then(([accs, gen]) => {
        // Lista completa (activas e inactivas), orden estable: por método y,
        // dentro del mismo método, en el orden guardado.
        const list = [...(accs ?? DEFAULT_PAYMENT_ACCOUNTS)].sort(
          (a, b) => PAYMENT_METHOD_ORDER.indexOf(a.method) - PAYMENT_METHOD_ORDER.indexOf(b.method),
        );
        setAccounts(list.map(toAccountForm));
        // 'firestore' = el dueño ya guardó cuentas (aunque sea solo la vieja
        // fila de pago móvil de rondas anteriores: active ausente = activa).
        setSource(accs && accs.length > 0 ? 'firestore' : 'seed');
        const g = gen ?? GENERAL_SEED;
        setGeneral({
          ivaPercent: String(g.ivaPercent),
          whatsappNumber: g.whatsappNumber,
          pickupAddress: g.pickupAddress,
          pickupHours: g.pickupHours,
          // Docs guardados antes de 5.75 vienen sin deliveryHours: mostramos
          // el valor EFECTIVO (el que el cliente ve ahora) para que el admin
          // decida con la verdad en pantalla, no con un campo vacío.
          deliveryHours: g.deliveryHours || GENERAL_SEED.deliveryHours,
        });
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /** Guarda la sección Operación (IVA, WhatsApp, retiro). */
  const saveGeneral = async () => {
    const e: Record<string, string | null> = {};
    const ivaRaw = general.ivaPercent.trim().replace(',', '.');
    const ivaN = Number(ivaRaw === '' ? '0' : ivaRaw);
    if (!Number.isFinite(ivaN) || ivaN < 0 || ivaN > 100) e['ivaPercent'] = 'IVA entre 0 y 100 (0 = sin IVA).';
    const wa = general.whatsappNumber.trim();
    if (wa && !isValidPhoneVE(wa) && !/^\+?58\d{10}$/.test(wa.replace(/[\s-]/g, ''))) {
      e['whatsappNumber'] = 'WhatsApp: 04241234567 (o vacío para ocultar el botón).';
    }
    setErrors((prev) => ({ ...prev, ...e }));
    if (Object.values(e).some((x) => x)) return;

    setSavingGeneral(true);
    try {
      await saveGeneralSettings({
        ivaPercent: Math.round(ivaN * 100) / 100,
        whatsappNumber: wa.replace(/[\s-]/g, ''),
        pickupAddress: sanitizeText(general.pickupAddress, 200),
        pickupHours: sanitizeText(general.pickupHours, 60),
        deliveryHours: sanitizeText(general.deliveryHours, 60),
      });
      setSavedGeneralAt(Date.now());
      toast.success('Operación guardada: IVA, WhatsApp, retiro y horario de deliverys en vivo.');
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSavingGeneral(false);
    }
  };

  /* ── cuentas de pago: agregar / quitar / editar ── */

  const patch = (key: string, k: keyof AccountForm, v: string | boolean) => {
    setAccounts((prev) => (prev ? prev.map((f) => (f.key === key ? { ...f, [k]: v } : f)) : prev));
  };

  /** Nueva cuenta: método elegible (por defecto el primero que falta, o Pago
   *  Móvil si ya están todos — se permiten duplicados: varios bancos). */
  const addAccount = (m?: PaymentMethod) => {
    setAccounts((prev) => {
      const base = prev ?? [];
      const missing = PAYMENT_METHOD_ORDER.find((x) => !base.some((f) => f.method === x));
      const method = m ?? missing ?? 'pago_movil';
      return [...base, { key: nextKey(), id: '', method, active: true, ...EMPTY_FORM_FIELDS }];
    });
  };

  /** Quitar de la lista: los cambios se confirman al guardar (window.confirm,
   *  igual que el borrado de productos en el panel). */
  const removeAccount = (f: AccountForm) => {
    const name = f.label.trim() || PAYMENT_METHOD_LABELS[f.method];
    if (!window.confirm(`¿Quitar «${name}» de la lista? Desaparece al pulsar «Guardar formas de pago».`)) return;
    setAccounts((prev) => (prev ? prev.filter((x) => x.key !== f.key) : prev));
  };

  /** SUBIDA DEL QR (5.80): igual que las fotos de productos — archivo →
   *  fn-uploadImage → imgbb → URL en el campo (se confirma al guardar). */
  const uploadQr = async (key: string, file: File | null) => {
    if (!file) return;
    setUploadingKey(key);
    try {
      const res = await adminUploadImage(file);
      if (res.ok) {
        patch(key, 'qrUrl', res.url);
        toast.success('QR subido. Pulsa «Guardar formas de pago» para confirmarlo.');
      } else {
        toast.error(res.message);
      }
    } finally {
      setUploadingKey(null);
    }
  };

  /** Guarda TODAS las cuentas de la lista (activas e inactivas): el documento
   *  entero se reemplaza, así una cuenta desactivada conserva sus datos para
   *  cuando vuelva a activarse. Solo se VALIDAN las activas: las ocultas no
   *  pueden bloquear el guardado. Cada cuenta recibe id estable al guardar. */
  const save = async () => {
    if (!accounts) return;
    const e: Record<string, string | null> = {};
    for (const f of accounts) {
      if (!f.active) continue;
      const tag = f.label.trim() || PAYMENT_METHOD_LABELS[f.method];
      if (usesVeForm(f.method)) {
        if (!f.bank) e[`${f.key}.bank`] = `Selecciona el banco de recaudación (${tag}).`;
        if (!RIF_RE.test(f.rif.trim().toUpperCase())) e[`${f.key}.rif`] = 'RIF con formato J-12345678-9.';
        if (f.method === 'pago_movil' && !isValidPhoneVE(f.phone)) e[`${f.key}.phone`] = 'Teléfono del Pago Móvil (0412…0426).';
        if (f.method === 'transferencia' && sanitizeDigits(f.accountNumber, 20).length !== 20) {
          e[`${f.key}.accountNumber`] = 'El número de cuenta tiene 20 dígitos.';
        }
      }
      if (f.method === 'zelle') {
        if (!isValidEmail(f.email)) e[`${f.key}.email`] = 'Correo Zelle de recaudo (ej. pagos@gmail.com).';
        if (!isValidHolderName(f.holderName)) e[`${f.key}.holderName`] = 'Titular de la cuenta (mínimo 3 letras).';
      }
      if (f.method === 'binance') {
        if (!isValidBinanceId(f.binanceId)) e[`${f.key}.binanceId`] = 'Binance Pay ID o UID (mínimo 4 caracteres).';
        if (f.holderName.trim() && !isValidHolderName(f.holderName)) e[`${f.key}.holderName`] = 'Titular: mínimo 3 letras.';
      }
      if (!isValidQrUrl(f.qrUrl)) e[`${f.key}.qrUrl`] = 'Enlace del QR: debe empezar por https:// (o déjalo vacío).';
    }
    setErrors(e);
    if (Object.values(e).some((x) => x)) {
      toast.error('Revisa los campos resaltados de las cuentas activas.');
      return;
    }

    setSaving(true);
    try {
      const list: PaymentAccount[] = accounts.map((f) => {
        const acc = sanitizeDigits(f.accountNumber, 20);
        return {
          id: f.id || newAccountId(),
          method: f.method,
          active: f.active,
          bank: sanitizeText(f.bank, 60),
          rif: f.rif.trim().toUpperCase(),
          ...(f.label.trim() ? { label: sanitizeText(f.label, 40) } : {}),
          ...(f.phone.trim() ? { phone: f.phone.replace(/\D/g, '').slice(0, 11) } : {}),
          ...(acc.length === 20 ? { accountNumber: acc } : {}),
          ...(f.email.trim() && isValidEmail(f.email) ? { email: f.email.trim() } : {}),
          ...(f.holderName.trim() && isValidHolderName(f.holderName) ? { holderName: sanitizeText(f.holderName, 80) } : {}),
          ...(f.binanceId.trim() && isValidBinanceId(f.binanceId) ? { binanceId: sanitizeText(f.binanceId, 120) } : {}),
          ...(f.qrUrl.trim() && isValidQrUrl(f.qrUrl) ? { qrUrl: f.qrUrl.trim() } : {}),
        };
      });
      await savePaymentAccounts(list);
      // Re-sincroniza ids generados: si guardas dos veces, no se duplican ids.
      setAccounts((prev) =>
        prev
          ? prev.map((f, i) => {
              const saved = list[i];
              return saved?.id ? { ...f, id: saved.id } : f;
            })
          : prev,
      );
      setSavedAt(Date.now());
      setSource('firestore');
      toast.success('Cuentas guardadas. Los checkout nuevos ya las muestran.');
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const activeForms = accounts ? accounts.filter((f) => f.active) : [];

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Ajustes de la tienda</h2>
      <p className="spot-subtitle mt-1 mb-6">
        Formas de pago y operación. Guardas aquí y aplica al instante — sin deploy.
      </p>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading || !accounts ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          {source === 'seed' && (
            <div className="mb-6 rounded-brand border-2 border-dashed border-signal bg-signal/10 p-4">
              <p className="text-sm font-semibold text-signal">
                Hoy el cliente ve los valores de ejemplo del código (RIF J-00000000-0).
                Reemplázalos por los reales y guarda.
              </p>
            </div>
          )}

          {/* ── FORMAS DE PAGO: lista de cuentas (5.80) ── */}
          <section aria-label="Formas de pago">
            <h3 className="font-display text-lg font-bold italic uppercase text-paper">Formas de pago</h3>
            <p className="mt-1 text-sm text-muted">
              Agrega, activa y llena cada cuenta. ¿Otra cuenta de Pago Móvil o de otro banco?
              Toca «＋ Pago móvil» (o el método que quieras) aquí abajo y se agrega al final de la lista.
              Las inactivas conservan lo guardado por si las reactivas después.
            </p>

            {/* 5.82 · chips SIEMPRE visibles: un toque agrega otra cuenta del
                método elegido (ej. un segundo Pago Móvil) — antes solo se
                mostraban los métodos FALTANTES y, con las 6 formas ya creadas,
                no había ninguna forma rápida de duplicar (el único botón quedaba
                al fondo de la lista y abría la tarjeta con otro método).
                Los métodos que aún no tienes van resaltados en dashed. */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted">Agregar cuenta:</span>
              {PAYMENT_METHOD_ORDER.map((m) => {
                const present = accounts.some((f) => f.method === m);
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => addAccount(m)}
                    className={
                      present
                        ? 'rounded-brand border-2 border-line bg-ink px-3 py-1.5 text-sm font-semibold text-signal transition hover:border-signal active:scale-95'
                        : 'rounded-brand border-2 border-dashed border-signal bg-signal/10 px-3 py-1.5 text-sm font-semibold text-signal transition hover:border-signal active:scale-95'
                    }
                  >
                    ＋ {PAYMENT_METHOD_LABELS[m]}
                  </button>
                );
              })}
            </div>

            {accounts.length === 0 && (
              <p className="mt-4 rounded-brand border-2 border-dashed border-line bg-ink p-4 text-sm text-muted">
                No hay cuentas en la lista. Agrega al menos una para que el cliente pueda pagar.
              </p>
            )}

            {accounts.map((f) => (
              <AccountCard
                key={f.key}
                f={f}
                errors={errors}
                uploading={uploadingKey === f.key}
                onPatch={patch}
                onRemove={removeAccount}
                onUploadQr={uploadQr}
              />
            ))}

            {/* 5.82 · el botón genérico al fondo se RETIRA: los chips de arriba
                cubren TODOS los métodos (incluido repetir Pago Móvil) y eran
                fáciles de pasar por alto tras 6 tarjetas en el teléfono. */}

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button size="lg" loading={saving} onClick={() => void save()}>
                Guardar formas de pago
              </Button>
              {savedAt && (
                <p className="text-sm text-muted">
                  Última actualización: {new Date(savedAt).toLocaleTimeString('es-VE')}
                </p>
              )}
            </div>
            {activeForms.length === 0 && (
              <p className="mt-3 text-sm font-semibold text-signal">
                No hay ninguna cuenta activa: el cliente no podrá pagar en el checkout.
              </p>
            )}
          </section>

          {/* ── OPERACIÓN: IVA + WhatsApp + retiro en tienda ── */}
          <section className="mt-8 rounded-brand-lg border-2 border-line bg-surface-1 p-6" aria-label="Operación">
            <h3 className="font-display text-lg font-bold italic uppercase text-paper">
              Operación · IVA, WhatsApp, retiro y deliverys
            </h3>
            <p className="mt-1 text-sm text-muted">
              Estos valores los usa el checkout y toda la app al instante. IVA 0 = sin IVA
              (los precios se muestran tal cual). Si activas IVA, se suma sobre subtotal + envío.
            </p>
            <div className="mt-4 grid gap-4">
              <Input
                label="Horario de los deliverys (envío a domicilio)"
                value={general.deliveryHours}
                onChange={(ev) => setGeneral((g) => ({ ...g, deliveryHours: ev.target.value }))}
                placeholder="de 8:00 am a 8:00 pm"
                hint="Lo que ve el cliente en el Home. Si lo cambias aquí, se muestra al instante."
                error={errors['deliveryHours']}
              />
              <Input
                label="IVA (%) — 0 para desactivado"
                value={general.ivaPercent}
                onChange={(ev) => setGeneral((g) => ({ ...g, ivaPercent: ev.target.value.replace(/[^0-9.,]/g, '') }))}
                placeholder="16"
                inputMode="decimal"
                error={errors['ivaPercent']}
              />
              <Input
                label="WhatsApp de soporte (vacío = botón oculto)"
                type="tel"
                value={general.whatsappNumber}
                onChange={(ev) => setGeneral((g) => ({ ...g, whatsappNumber: ev.target.value }))}
                placeholder="04241234567"
                error={errors['whatsappNumber']}
              />
              <Input
                label="Dirección del local para retiro"
                value={general.pickupAddress}
                onChange={(ev) => setGeneral((g) => ({ ...g, pickupAddress: ev.target.value }))}
                placeholder="Av. Principal, Local SPOT 24, Maracay, Aragua"
                error={errors['pickupAddress']}
              />
              <Input
                label="Horario del local (opcional)"
                value={general.pickupHours}
                onChange={(ev) => setGeneral((g) => ({ ...g, pickupHours: ev.target.value }))}
                placeholder="Lun–Sáb 8:00–20:00 · Dom 8:00–14:00"
                error={errors['pickupHours']}
              />
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button size="lg" loading={savingGeneral} onClick={() => void saveGeneral()}>
                Guardar operación
              </Button>
              {savedGeneralAt && (
                <p className="text-sm text-muted">
                  Última actualización: {new Date(savedGeneralAt).toLocaleTimeString('es-VE')}
                </p>
              )}
            </div>
            {waHref(general.whatsappNumber) && (
              <p className="mt-4 text-sm text-muted">
                Enlace que verá el cliente:{' '}
                <a
                  href={waHref(general.whatsappNumber) ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-signal underline"
                >
                  probar WhatsApp
                </a>
              </p>
            )}
          </section>

          {/* ── VISTA PREVIA: las cuentas ACTIVAS, tal como las ve el cliente ── */}
          <section className="mt-8" aria-label="Vista previa">
            <p className="spot-label mb-2">Vista previa — así lo ve el cliente en el checkout</p>
            {activeForms.length === 0 ? (
              <p className="rounded-brand border-2 border-dashed border-line bg-ink p-4 text-sm text-muted">
                Sin cuentas activas no hay bloque de pago: activa al menos una y guarda.
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {activeForms.map((f) => {
                  const acc = formToPreviewAccount(f);
                  const siblings = activeForms.filter((x) => x.method === f.method).length;
                  const qr = qrForAccount(acc);
                  return (
                    <div key={f.key} className="rounded-brand border-2 border-dashed border-line bg-ink p-4">
                      <p className="spot-label mb-2">{accountChipLabel(acc, siblings)}</p>
                      <ul className="space-y-1 text-body-base text-paper">
                        {copyRowsForAccount(acc).map((r) => (
                          <li key={r.label}>{r.label}: <strong>{r.value}</strong></li>
                        ))}
                      </ul>
                      {copyRowsForAccount(acc).length === 0 && (
                        <p className="text-sm text-muted">
                          {f.method === 'efectivo' ? 'El cliente paga en efectivo al recibir.' : 'El cliente paga con tarjeta al recibir.'}
                        </p>
                      )}
                      {qr && (
                        <img
                          src={qr}
                          alt={`QR de ${accountChipLabel(acc, siblings)}`}
                          loading="lazy"
                          className="mt-2 h-24 w-24 rounded-brand border border-line bg-white object-contain p-0.5"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

/** Formulario → PaymentAccount de vista previa (solo lectura, sin guardar). */
function formToPreviewAccount(f: AccountForm): PaymentAccount {
  return {
    id: f.id || f.key,
    method: f.method,
    active: f.active,
    bank: f.bank,
    rif: f.rif,
    ...(f.label.trim() ? { label: f.label.trim() } : {}),
    ...(f.phone.trim() ? { phone: f.phone } : {}),
    ...(f.accountNumber.trim() ? { accountNumber: f.accountNumber } : {}),
    ...(f.email.trim() ? { email: f.email.trim() } : {}),
    ...(f.holderName.trim() ? { holderName: f.holderName.trim() } : {}),
    ...(f.binanceId.trim() ? { binanceId: f.binanceId.trim() } : {}),
    ...(f.qrUrl.trim() ? { qrUrl: f.qrUrl.trim() } : {}),
  };
}

/**
 * Tarjeta de UNA cuenta: interruptor, método (elegible solo si es nueva),
 * nombre para el cliente, campos por método y SU QR (subir archivo o enlace).
 */
function AccountCard({
  f,
  errors,
  uploading,
  onPatch,
  onRemove,
  onUploadQr,
}: {
  f: AccountForm;
  errors: Record<string, string | null>;
  uploading: boolean;
  onPatch: (key: string, k: keyof AccountForm, v: string | boolean) => void;
  onRemove: (f: AccountForm) => void;
  onUploadQr: (key: string, file: File | null) => Promise<void>;
}) {
  const qrInputRef = useRef<HTMLInputElement>(null);
  const label = PAYMENT_METHOD_LABELS[f.method];
  const title = f.label.trim() || label;
  const isNew = f.id === '';
  // Vista del QR de esta cuenta: SOLO el suyo (5.84). Una cuenta sin QR
  // propio no muestra ninguno hasta que el dueño suba el de esta cuenta.
  const qrPreview = f.qrUrl.trim();

  return (
    <div
      className={`mt-4 rounded-brand-lg border-2 p-5 ${f.active ? 'border-line bg-surface-1' : 'border-line bg-surface-1 opacity-80'}`}
      aria-label={`Cuenta de pago ${title}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display text-base font-bold italic uppercase text-paper">{title}</h4>
          <p className={`mt-0.5 text-xs font-semibold ${f.active ? 'text-signal' : 'text-muted'}`}>
            {label}
            {f.active ? ' · Visible en el checkout' : ' · Oculta para el cliente'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="danger-ghost" size="sm" type="button" onClick={() => onRemove(f)}>
            Quitar
          </Button>
          <button
            type="button"
            role="switch"
            aria-checked={f.active}
            onClick={() => onPatch(f.key, 'active', !f.active)}
            className={`relative h-8 w-14 shrink-0 rounded-full border-2 transition ${f.active ? 'border-signal bg-signal/20' : 'border-line bg-ink'}`}
            aria-label={`${f.active ? 'Desactivar' : 'Activar'} ${title}`}
          >
            <span
              className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full transition-all ${f.active ? 'left-[30px] bg-signal' : 'left-1 bg-muted'}`}
            />
          </button>
        </div>
      </div>

      {f.active && (
        <div className="mt-4 grid gap-4">
          {/* Método: solo en cuentas NUEVAS (una guardada conserva el suyo:
              cambiarlo dejaría campos de otro método guardados a medias). */}
          <Select
            label="Método de pago"
            value={f.method}
            onChange={(ev) => onPatch(f.key, 'method', ev.target.value)}
            disabled={!isNew}
            hint={isNew ? 'Elige la forma de pago de esta cuenta.' : undefined}
          >
            {PAYMENT_METHOD_ORDER.map((m) => (
              <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
            ))}
          </Select>

          {/* Nombre para el cliente: importa con VARIAS cuentas del mismo
              método («Banesco», «Cuenta Erick»…) — si queda vacío se usa el
              nombre del método, y con duplicados se distinguen por banco. */}
          <Input
            label="Nombre para el cliente (opcional)"
            value={f.label}
            onChange={(ev) => onPatch(f.key, 'label', ev.target.value)}
            placeholder={`Ej. ${label}${f.method === 'transferencia' ? ' · Banesco' : ''}`}
            hint="Solo hace falta si tienes varias cuentas del mismo método."
          />

          {usesVeForm(f.method) && (
            <>
              <Select
                label="Banco de recaudación"
                value={f.bank}
                onChange={(ev) => onPatch(f.key, 'bank', ev.target.value)}
                error={errors[`${f.key}.bank`]}
                required
              >
                <option value="">Selecciona…</option>
                {VE_BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
              <Input
                label="RIF de SPOT 24"
                value={f.rif}
                onChange={(ev) => onPatch(f.key, 'rif', ev.target.value.toUpperCase())}
                placeholder="J-12345678-9"
                error={errors[`${f.key}.rif`]}
                required
              />
            </>
          )}
          {f.method === 'pago_movil' && (
            <Input
              label="Teléfono afiliado al Pago Móvil"
              type="tel"
              value={f.phone}
              onChange={(ev) => onPatch(f.key, 'phone', ev.target.value)}
              placeholder="04121234567"
              error={errors[`${f.key}.phone`]}
              required
            />
          )}
          {usesVeForm(f.method) && (
            <Input
              label={f.method === 'transferencia' ? 'Número de cuenta (20 dígitos)' : 'Número de cuenta (opcional)'}
              value={f.accountNumber}
              onChange={(ev) => onPatch(f.key, 'accountNumber', sanitizeDigits(ev.target.value, 20))}
              placeholder="0105… (20 dígitos)"
              inputMode="numeric"
              error={errors[`${f.key}.accountNumber`]}
            />
          )}
          {f.method === 'zelle' && (
            <Input
              label="Correo Zelle de recaudo"
              type="email"
              value={f.email}
              onChange={(ev) => onPatch(f.key, 'email', ev.target.value)}
              placeholder="pagos@gmail.com"
              error={errors[`${f.key}.email`]}
              required
            />
          )}
          {f.method === 'binance' && (
            <Input
              label="Binance Pay ID / UID"
              value={f.binanceId}
              onChange={(ev) => onPatch(f.key, 'binanceId', ev.target.value)}
              placeholder="123456789"
              error={errors[`${f.key}.binanceId`]}
              required
            />
          )}
          {(f.method === 'zelle' || f.method === 'binance') && (
            <Input
              label={`Titular (${f.method === 'zelle' ? 'cuenta receptora' : 'opcional'})`}
              value={f.holderName}
              onChange={(ev) => onPatch(f.key, 'holderName', ev.target.value)}
              placeholder="Nombre que aparece en la cuenta"
              error={errors[`${f.key}.holderName`]}
            />
          )}
          {f.method === 'pago_movil' && (
            <Input
              label="Correo de pago (opcional)"
              type="email"
              value={f.email}
              onChange={(ev) => onPatch(f.key, 'email', ev.target.value)}
              placeholder="pagos@spot24.com.ve"
              error={errors[`${f.key}.email`]}
            />
          )}

          {/* QR de esta cuenta (5.80): se SUBE como archivo (igual que las
              fotos de productos) o se pega un enlace. 5.84: cada cuenta nace
              SIN QR — no hereda el de otra cuenta; el cliente solo ve el QR
              cuando subes la imagen de ESA cuenta. */}
          <div className="rounded-brand border-2 border-line bg-ink p-4">
            <p className="spot-label mb-2">QR de esta cuenta</p>
            <input
              ref={qrInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              aria-label={`Subir QR de ${title}`}
              onChange={(ev) => {
                const file = ev.target.files?.[0] ?? null;
                void onUploadQr(f.key, file);
                // Reset: elegir la MISMA imagen otra vez re-dispara onChange.
                ev.target.value = '';
              }}
            />
            <div className="flex flex-wrap items-center gap-4">
              {qrPreview && (
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={qrPreview}
                    alt={`QR de ${title}`}
                    loading="lazy"
                    className="h-20 w-20 rounded-brand border border-line bg-white object-contain p-0.5"
                  />
                  {f.qrUrl.trim() && (
                    <button
                      type="button"
                      onClick={() => onPatch(f.key, 'qrUrl', '')}
                      className="text-xs font-semibold text-signal underline"
                    >
                      Quitar QR
                    </button>
                  )}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  loading={uploading}
                  onClick={() => qrInputRef.current?.click()}
                >
                  Subir QR (foto)
                </Button>
                <p className="mt-2 text-xs text-muted">
                  JPG, PNG o WebP · se sube a imgbb igual que las fotos de productos.
                  {!f.qrUrl.trim() &&
                    ' Sin QR todavía: el cliente paga con los datos hasta que subas el QR de esta cuenta.'}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <Input
                label="…o pega el enlace de la imagen QR (opcional)"
                type="url"
                value={f.qrUrl}
                onChange={(ev) => onPatch(f.key, 'qrUrl', ev.target.value)}
                placeholder="https://i.ibb.co/… (súbela a imgbb y pega el enlace)"
                error={errors[`${f.key}.qrUrl`]}
                hint={f.qrUrl.startsWith('/') ? 'Empieza por «/»: es el QR empaquetado del repo.' : undefined}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
