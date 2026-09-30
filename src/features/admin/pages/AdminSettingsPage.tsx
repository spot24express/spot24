/**
 * Ajustes · Datos de pago (settings/payment_accounts).
 * La cuenta de Pago Móvil que el cliente ve en el paso de pago del checkout.
 * Guardar aquí aplica al instante en producción — sin deploy, sin código.
 */
import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input, Select } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { VE_BANKS, DEFAULT_PAYMENT_ACCOUNTS } from '@/shared/constants/brand';
import type { PaymentAccount } from '@/shared/constants/brand';
import { getPaymentAccounts, savePaymentAccounts } from '@/shared/services/settings.service';
import { isValidPhoneVE, isValidEmail, sanitizeDigits, sanitizeText } from '@/shared/lib/validation';
import { userMessage } from '@/shared/lib/errors';

/** RIF venezolano: letra inicial + 8 dígitos + verificador (J-12345678-9). */
const RIF_RE = /^[JGVEP]-\d{8}-\d$/;

interface AccountForm {
  bank: string;
  rif: string;
  phone: string;
  accountNumber: string;
  email: string;
}

const EMPTY_FORM: AccountForm = { bank: '', rif: '', phone: '', accountNumber: '', email: '' };

function toForm(a: PaymentAccount): AccountForm {
  return {
    bank: a.bank,
    rif: a.rif,
    phone: a.phone ?? '',
    accountNumber: a.accountNumber ?? '',
    email: a.email ?? '',
  };
}

export default function AdminSettingsPage() {
  useDocumentTitle('Ajustes');
  const [form, setForm] = useState<AccountForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  /** De dónde salió lo que ves: 'seed' = placeholders del código, 'firestore' = ya guardado. */
  const [source, setSource] = useState<'seed' | 'firestore' | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const load = () => {
    setLoading(true);
    setError(false);
    void getPaymentAccounts()
      .then((accs) => {
        if (accs && accs.length > 0 && accs[0]) {
          setForm(toForm(accs[0]));
          setSource('firestore');
        } else {
          // Sin doc en Firestore: prellenamos con la semilla del repo para
          // que el admin vea exactamente lo que el cliente ve hoy.
          setForm(toForm(DEFAULT_PAYMENT_ACCOUNTS[0] ?? { method: 'pago_movil', bank: '', rif: '' }));
          setSource('seed');
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const save = async () => {
    const e: Record<string, string | null> = {};
    if (!form.bank) e['bank'] = 'Selecciona el banco de recaudación.';
    if (!RIF_RE.test(form.rif.trim().toUpperCase())) e['rif'] = 'RIF con formato J-12345678-9.';
    if (!isValidPhoneVE(form.phone)) e['phone'] = 'Teléfono del Pago Móvil (0412…0426).';
    const acc = sanitizeDigits(form.accountNumber, 20);
    if (acc.length > 0 && acc.length !== 20) e['accountNumber'] = 'El número de cuenta tiene 20 dígitos (o déjalo vacío).';
    if (form.email.trim() && !isValidEmail(form.email)) e['email'] = 'Correo inválido.';
    setErrors(e);
    if (Object.values(e).some((x) => x)) return;

    setSaving(true);
    try {
      const account: PaymentAccount = {
        method: 'pago_movil',
        bank: sanitizeText(form.bank, 60),
        rif: form.rif.trim().toUpperCase(),
        phone: form.phone.replace(/\D/g, ''),
        ...(acc.length === 20 ? { accountNumber: acc } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
      };
      await savePaymentAccounts([account]);
      setSavedAt(Date.now());
      setSource('firestore');
      toast.success('Datos de pago guardados. Los checkout nuevos ya los muestran.');
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl">
      <h2 className="font-display text-xl font-bold italic uppercase text-paper">Datos de pago</h2>
      <p className="spot-subtitle mt-1 mb-6">
        La cuenta de Pago Móvil que el cliente ve al pagar. Guardas aquí y aplica al instante — sin deploy.
      </p>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
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

          <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6" aria-label="Cuenta de recaudación">
            <h3 className="font-display text-lg font-bold italic uppercase text-paper">
              Cuenta de recaudación · Pago Móvil
            </h3>
            <div className="mt-4 grid gap-4">
              <Select
                label="Banco de recaudación"
                value={form.bank}
                onChange={(ev) => setForm((f) => ({ ...f, bank: ev.target.value }))}
                error={errors['bank']}
                required
              >
                <option value="">Selecciona…</option>
                {VE_BANKS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </Select>
              <Input
                label="RIF de SPOT 24"
                value={form.rif}
                onChange={(ev) => setForm((f) => ({ ...f, rif: ev.target.value.toUpperCase() }))}
                placeholder="J-12345678-9"
                error={errors['rif']}
                required
              />
              <Input
                label="Teléfono afiliado al Pago Móvil"
                type="tel"
                value={form.phone}
                onChange={(ev) => setForm((f) => ({ ...f, phone: ev.target.value }))}
                placeholder="04121234567"
                error={errors['phone']}
                required
              />
              <Input
                label="Número de cuenta (opcional)"
                value={form.accountNumber}
                onChange={(ev) => setForm((f) => ({ ...f, accountNumber: sanitizeDigits(ev.target.value, 20) }))}
                placeholder="0105… (20 dígitos)"
                inputMode="numeric"
                error={errors['accountNumber']}
              />
              <Input
                label="Correo de pago (opcional)"
                type="email"
                value={form.email}
                onChange={(ev) => setForm((f) => ({ ...f, email: ev.target.value }))}
                placeholder="pagos@spot24.com.ve"
                error={errors['email']}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-4">
              <Button size="lg" loading={saving} onClick={() => void save()}>
                Guardar datos de pago
              </Button>
              {savedAt && (
                <p className="text-sm text-muted">
                  Última actualización: {new Date(savedAt).toLocaleTimeString('es-VE')}
                </p>
              )}
            </div>
          </section>

          {/* Vista previa idéntica al recuadro del checkout */}
          <section className="mt-8" aria-label="Vista previa">
            <p className="spot-label mb-2">Vista previa — así lo ve el cliente en el checkout</p>
            <div className="rounded-brand border-2 border-dashed border-line bg-ink p-4">
              <p className="spot-label mb-2">Datos de SPOT 24 para pagar</p>
              <ul className="space-y-1 text-body-base text-paper">
                <li>Banco: <strong>{form.bank || '—'}</strong></li>
                <li>RIF: <strong>{form.rif || '—'}</strong></li>
                {form.phone && <li>Teléfono: <strong>{form.phone}</strong></li>}
                {form.accountNumber && <li>Cuenta: <strong>{form.accountNumber}</strong></li>}
                {form.email && <li>Correo: <strong>{form.email}</strong></li>}
              </ul>
            </div>
          </section>
        </>
      )}
    </div>
  );
}