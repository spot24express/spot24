/**
 * SPOT 24 · Ajustes generales (colección settings).
 * · settings/payment_accounts: la cuenta de recaudación que el cliente ve en
 *   el paso de pago del checkout. Se edita desde /admin/ajustes y aplica al
 *   instante para todos los checkout nuevos — sin deploy, sin tocar código.
 * · settings/general: operación de la tienda — IVA %, número de WhatsApp de
 *   soporte y datos del retiro en tienda. Editable desde /admin/ajustes.
 * · Reglas Firestore: lectura pública, escritura SOLO admin (claim role).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { AppError } from '@/shared/lib/errors';
import type { PaymentAccount } from '@/shared/constants/brand';

/** Defensa en cliente: solo llegan al checkout cuentas bien formadas. */
function isPaymentAccount(a: unknown): a is PaymentAccount {
  if (typeof a !== 'object' || a === null) return false;
  const acc = a as Record<string, unknown>;
  return (
    acc['method'] === 'pago_movil'
    && typeof acc['bank'] === 'string' && acc['bank'].length > 0
    && typeof acc['rif'] === 'string' && acc['rif'].length > 0
  );
}

/**
 * Cuentas de recaudación guardadas en Firestore (settings/payment_accounts).
 * null = el documento aún no existe: el checkout usará la semilla de brand.ts.
 */
export async function getPaymentAccounts(): Promise<PaymentAccount[] | null> {
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, 'settings', 'payment_accounts'));
  if (!snap.exists()) return null;
  const raw = snap.data()['accounts'];
  if (!Array.isArray(raw)) return null;
  const clean = raw.filter(isPaymentAccount);
  return clean.length > 0 ? clean : null;
}

/** Guarda las cuentas (las reglas exigen role=admin; el cliente no puede). */
export async function savePaymentAccounts(accounts: PaymentAccount[]): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await setDoc(doc(fb.db, 'settings', 'payment_accounts'), {
    accounts,
    updatedAt: Date.now(),
  });
}

/* ───────────────────── settings/general (operación) ───────────────────── */

/** Ajustes de operación editables por el admin desde /admin/ajustes. */
export interface GeneralSettings {
  /** IVA en % (0–100). 0 = sin IVA. El backend lo aplica sobre subtotal + envío. */
  ivaPercent: number;
  /** WhatsApp de soporte (formato local o internacional). '' = botón oculto. */
  whatsappNumber: string;
  /** Dirección del local para retiro (se muestra en checkout y queda en la orden). */
  pickupAddress: string;
  /** Horario del local para retiro (texto libre, p. ej. "Lun–Sáb 8:00–20:00"). */
  pickupHours: string;
}

/** Valores por defecto mientras el admin no guarda nada. */
export const GENERAL_SEED: GeneralSettings = {
  ivaPercent: 0,
  whatsappNumber: '',
  pickupAddress: '',
  pickupHours: '',
};

/** Defensa en cliente: solo aceptamos valores bien formados. */
function sanitizeGeneral(raw: Record<string, unknown>): GeneralSettings {
  const ivaRaw = Number(raw['ivaPercent'] ?? 0);
  const iva = Number.isFinite(ivaRaw) && ivaRaw > 0 ? Math.min(100, ivaRaw) : 0;
  return {
    ivaPercent: Math.round(iva * 100) / 100,
    whatsappNumber: String(raw['whatsappNumber'] ?? '').trim().slice(0, 20),
    pickupAddress: String(raw['pickupAddress'] ?? '').trim().slice(0, 200),
    pickupHours: String(raw['pickupHours'] ?? '').trim().slice(0, 60),
  };
}

/**
 * Ajustes generales guardados en Firestore (settings/general).
 * null = el documento aún no existe: la app usa GENERAL_SEED.
 */
export async function getGeneralSettings(): Promise<GeneralSettings | null> {
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, 'settings', 'general'));
  if (!snap.exists()) return null;
  return sanitizeGeneral(snap.data() as Record<string, unknown>);
}

/** Guarda los ajustes generales (las reglas exigen role=admin). */
export async function saveGeneralSettings(s: GeneralSettings): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  await setDoc(doc(fb.db, 'settings', 'general'), {
    ...sanitizeGeneral(s as unknown as Record<string, unknown>),
    updatedAt: Date.now(),
  });
}