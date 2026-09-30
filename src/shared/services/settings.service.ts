/**
 * SPOT 24 · Ajustes generales (colección settings).
 * · settings/payment_accounts: la cuenta de recaudación que el cliente ve en
 *   el paso de pago del checkout. Se edita desde /admin/ajustes y aplica al
 *   instante para todos los checkout nuevos — sin deploy, sin tocar código.
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