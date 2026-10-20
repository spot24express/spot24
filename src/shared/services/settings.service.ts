/**
 * SPOT 24 · Ajustes generales (colección settings).
 * · settings/payment_accounts: las cuentas de recaudo por forma de pago
 *   (Pago Móvil, Transferencia, Efectivo, Punto de venta, Zelle, Binance).
 *   Desde 5.80 admite VARIAS cuentas del mismo método (ej. transferencias de
 *   varios bancos), cada una con su id, su nombre y su QR, con interruptor
 *   activo/inactivo — el dueño gestiona en /admin/ajustes cuáles ve el
 *   cliente en el paso de pago del checkout. Se edita desde /admin/ajustes y
 *   aplica al instante para todos los checkout nuevos — sin deploy.
 * · settings/general: operación de la tienda — IVA %, número de WhatsApp de
 *   soporte, datos del retiro en tienda y horario de los deliverys (Home).
 *   Editable desde /admin/ajustes.
 * · Reglas Firestore: lectura pública, escritura SOLO admin (claim role).
 */
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { AppError } from '@/shared/lib/errors';
import type { PaymentAccount } from '@/shared/constants/brand';
import { isPaymentAccount } from '@/shared/lib/paymentMethods';

/**
 * Cuentas de recaudación guardadas en Firestore (settings/payment_accounts).
 * Devuelve TODAS las formas bien formadas —activas e inactivas—: el checkout
 * filtra las activas (activeAccountsOf) y el panel las edita todas.
 * null = el documento aún no existe: la app usará la semilla de brand.ts.
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
  /** Horario en que trabajan los deliverys (texto libre, Home, ronda 5.75).
   *  Antes era una constante en brand.ts: el dueño lo cambia en Ajustes sin deploy. */
  deliveryHours: string;
}

/** Valores por defecto mientras el admin no guarda nada. */
export const GENERAL_SEED: GeneralSettings = {
  ivaPercent: 0,
  whatsappNumber: '',
  pickupAddress: '',
  pickupHours: '',
  deliveryHours: 'de 8:00 am a 8:00 pm',
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
    deliveryHours: String(raw['deliveryHours'] ?? '').trim().slice(0, 60),
  };
}

/**
 * Ajustes generales guardados en Firestore (settings/general).
 * null = el documento aún no existe: la app usa GENERAL_SEED.
 * Lectura SIEMPRE fresca: la usa el admin (tras guardar debe ver lo real).
 */
export async function getGeneralSettings(): Promise<GeneralSettings | null> {
  const fb = await loadFirebase();
  if (!fb) return null;
  const snap = await getDoc(doc(fb.db, 'settings', 'general'));
  if (!snap.exists()) return null;
  return sanitizeGeneral(snap.data() as Record<string, unknown>);
}

/* ── Caché de módulo (ronda 5.75) ─────────────────────────────────────────
 * settings/general ya se leía 1 vez por carga de app (RootLayout, WhatsApp).
 * El Home (horario de deliverys) se suma al mismo canal: con la promesa
 * compartida, TODA la app consume UNA sola lectura de settings/general por
 * carga — el catálogo grande no se come las lecturas del plan gratuito.
 * La caché dura solo la sesión de la página: al recargar, valor fresco. */
let generalCache: GeneralSettings | null = null;
let generalInFlight: Promise<GeneralSettings | null> | null = null;

/** Como getGeneralSettings() pero comparte promesa y caché entre pantallas. */
export function getGeneralSettingsCached(): Promise<GeneralSettings | null> {
  if (generalCache) return Promise.resolve(generalCache);
  if (!generalInFlight) {
    generalInFlight = getGeneralSettings()
      .then((g) => {
        generalCache = g;
        return g;
      })
      .finally(() => {
        generalInFlight = null;
      });
  }
  return generalInFlight;
}

/** Guarda los ajustes generales (las reglas exigen role=admin). */
export async function saveGeneralSettings(s: GeneralSettings): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic');
  const clean = sanitizeGeneral(s as unknown as Record<string, unknown>);
  await setDoc(doc(fb.db, 'settings', 'general'), {
    ...clean,
    updatedAt: Date.now(),
  });
  // Refresco de caché: si el admin guarda y navega al Home, ya se ve el nuevo
  // valor sin recargar (mismo proceso de página).
  generalCache = clean;
}