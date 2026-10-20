/**
 * SPOT 24 · Lógica PURA de formas de pago (rondas 5.79 + 5.80).
 * Una sola fuente de verdad para checkout, panel y settings.service:
 * · isPaymentAccount: defensa de lectura (documentos mal formados no llegan).
 * · activeAccountsOf: el checkout ofrece TODAS las cuentas activas — desde
 *   5.80 puede haber VARIAS del mismo método (transferencias de varios bancos).
 * · accountKey / accountChipLabel / newAccountId: identidad de cada cuenta
 *   (selección estable, chips distinguibles, ids nuevos al guardar).
 * · validatePaymentForm / buildPaymentDetails: reglas por método del paso Pago
 *   (contra-entrega: sin formulario — se cobra al recibir).
 * · copyRowsForAccount / qrForAccount: qué datos ve (y copia) el cliente.
 * Todo puro y testeable — sin Firestore, sin React.
 */
import type { PaymentAccount } from '@/shared/constants/brand';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_ORDER,
  type PaymentMethod,
} from '@/shared/constants/orders';
import {
  isValidCedulaVE,
  isValidPaymentReference,
  isValidPhoneVE,
  normalizeCedulaVE,
  normalizePhoneVE,
} from './validation';

/** Formulario del paso Pago. `titular` solo aplica a Zelle/Binance. */
export interface PaymentFormState {
  method: PaymentMethod;
  banco: string;
  cedula: string;
  telefono: string;
  referencia: string;
  fecha: string;
  titular: string;
}

export const EMPTY_PAYMENT_FORM: PaymentFormState = {
  method: 'pago_movil',
  banco: '',
  cedula: '',
  telefono: '',
  referencia: '',
  fecha: '',
  titular: '',
};

/* ─────────────────────── cuenta: forma y validación ─────────────────────── */

/**
 * Defensa en cliente: solo llegan al checkout cuentas bien formadas.
 * · pago_movil / transferencia: exigen banco + RIF (métodos VE).
 * · zelle: exige correo de recaudo. · binance: exige Binance ID.
 * · efectivo / punto_venta (5.80): contra entrega — no exigen datos.
 * `active` ausente (documentos previos a 5.79) se trata como activo.
 */
export function isPaymentAccount(a: unknown): a is PaymentAccount {
  if (typeof a !== 'object' || a === null) return false;
  const acc = a as Record<string, unknown>;
  const method = acc['method'];
  if (typeof method !== 'string' || !PAYMENT_METHOD_ORDER.includes(method as PaymentMethod)) return false;
  const m = method as PaymentMethod;
  if (typeof acc['bank'] !== 'string' || typeof acc['rif'] !== 'string') return false;
  if (m === 'pago_movil' || m === 'transferencia') {
    if (acc['bank'].length === 0 || acc['rif'].length === 0) return false;
  }
  if (m === 'zelle' && (!(typeof acc['email'] === 'string') || acc['email'].length === 0)) return false;
  if (m === 'binance' && (!(typeof acc['binanceId'] === 'string') || acc['binanceId'].length === 0)) return false;
  return true;
}

/** Normaliza lo que llega de Firestore a la forma completa del dominio.
 *  `id` ausente (docs 5.79, una cuenta por método) = el propio método. */
function normalizeAccount(a: PaymentAccount): PaymentAccount {
  return {
    ...a,
    id: typeof a.id === 'string' && a.id.trim() ? a.id : a.method,
    active: a.active !== false,
    bank: a.bank ?? '',
    rif: a.rif ?? '',
  };
}

/**
 * Cuentas ACTIVAS en orden estable de presentación: por método (el orden de
 * PAYMENT_METHOD_ORDER) y, dentro del mismo método, en el orden guardado.
 * Desde 5.80 NO se deduplica por método: dos transferencias de bancos
 * distintos salen las dos — cada una es un chip aparte en el checkout.
 */
export function activeAccountsOf(accounts: readonly PaymentAccount[]): PaymentAccount[] {
  return accounts
    .filter((a) => a.active !== false)
    .map(normalizeAccount)
    .sort(
      (x, y) =>
        PAYMENT_METHOD_ORDER.indexOf(x.method) - PAYMENT_METHOD_ORDER.indexOf(y.method),
    );
}

/** Identidad de cuenta para selección y React keys (docs viejos = method). */
export function accountKey(a: PaymentAccount): string {
  return a.id && a.id.trim() ? a.id : a.method;
}

/**
 * Título del chip en el checkout: el `label` del dueño si existe; si hay
 * varias cuentas del mismo método sin nombre, se distinguen por banco
 * («Transferencia · Banesco»); una sola cuenta mantiene el nombre limpio.
 */
export function accountChipLabel(a: PaymentAccount, sameMethodSiblings: number): string {
  if (a.label && a.label.trim()) return a.label.trim();
  const ml = PAYMENT_METHOD_LABELS[a.method];
  if (sameMethodSiblings > 1 && a.bank && a.bank.trim()) return `${ml} · ${a.bank.trim()}`;
  return ml;
}

/** Id nuevo para una cuenta (5.80): UUID limpio; fallback si el navegador
 *  no soporta crypto.randomUUID (contextos sin secure context). */
export function newAccountId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return `a${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;
}

/* ───────────────────── formulario del paso Pago (checkout) ───────────────── */

/** ¿El método usa el formulario venezolano (banco + cédula + teléfono)? */
export function usesVeForm(method: PaymentMethod): boolean {
  return method === 'pago_movil' || method === 'transferencia';
}

/** Referencia libre (Zelle/Binance): confirmación u Order ID, 4-40 caracteres. */
function isValidLooseReference(v: string): boolean {
  const t = v.trim();
  return t.length >= 4 && t.length <= 40;
}

/**
 * Validaciones del paso Pago por método. Devuelve mapa campo→mensaje
 * (vacío = todo bien). El comprobante se valida aparte en el checkout.
 * Contra entrega (efectivo/punto_venta, 5.80): SIN formulario — el pago
 * ocurre al recibir; ni siquiera se pide fecha (aún no se paga).
 */
export function validatePaymentForm(form: PaymentFormState): Record<string, string | null> {
  const e: Record<string, string | null> = {};
  if (form.method === 'efectivo' || form.method === 'punto_venta') return e;
  if (!form.fecha) e['fecha'] = 'Fecha del pago.';
  if (usesVeForm(form.method)) {
    if (!form.banco) e['banco'] = 'Selecciona el banco del pago.';
    if (!isValidCedulaVE(form.cedula)) e['cedula'] = 'Cédula del pagador: solo los números.';
    if (!isValidPhoneVE(form.telefono)) e['telefono'] = 'Teléfono móvil del pago.';
    if (!isValidPaymentReference(form.referencia)) e['referencia'] = 'Los últimos 6 dígitos de la referencia (los muestra el banco).';
  } else {
    if (form.method === 'zelle') {
      if (form.banco.trim().length < 2) e['banco'] = 'Banco de origen del Zelle (ej. Chase, BofA).';
      if (form.titular.trim().length < 3) e['titular'] = 'Titular de la cuenta que paga.';
    }
    if (form.method === 'binance' && form.titular.trim().length < 3) {
      e['titular'] = 'Usuario Binance que envía el pago.';
    }
    if (!isValidLooseReference(form.referencia)) {
      e['referencia'] = form.method === 'binance'
        ? 'Order ID de la transacción (aparece en Binance Pay).'
        : 'Número de confirmación del Zelle (lo muestra tu banco).';
    }
  }
  return e;
}

/**
 * paymentDetails que viaja a fn-createOrder. Claves estables para TODO método:
 * · `referencia` — el antifraude del backend calcula refHash desde esta clave.
 * · `banco` — alimenta la máscara del panel (banco/bancoOrigen).
 * · `fecha` — la cajera la coteja con el extracto del banco.
 */
export function buildPaymentDetails(form: PaymentFormState): Record<string, string> {
  const fecha = form.fecha;
  const referencia = form.referencia.trim();
  // Contra entrega (5.80): el pago ocurre al recibir — no viajan detalles.
  if (form.method === 'efectivo' || form.method === 'punto_venta') return {};
  if (usesVeForm(form.method)) {
    return {
      banco: form.banco,
      cedula: normalizeCedulaVE(form.cedula),
      telefono: normalizePhoneVE(form.telefono),
      referencia,
      fecha,
    };
  }
  if (form.method === 'zelle') {
    return {
      banco: form.banco.trim(),
      titular: form.titular.trim(),
      referencia,
      fecha,
    };
  }
  // binance
  return {
    banco: 'Binance',
    titular: form.titular.trim(),
    referencia,
    fecha,
  };
}

/* ───────────────────── datos que ve (y copia) el cliente ─────────────────── */

/** Fila de dato de recaudación: etiqueta + valor visible + texto a copiar. */
export interface CopyRowData {
  label: string;
  value: string;
  copy: string;
}

/** RIF con solo números (sin J-, sin guiones): pega limpio en la app del banco. */
function rifDigits(rif: string): string {
  return rif.replace(/[^0-9]/g, '');
}

/** Filas de datos de la cuenta según el método (5.75 + 5.79 + 5.80).
 *  Contra entrega: sin datos de recaudo — el checkout muestra instrucciones
 *  de pago al recibir, no filas copiables. */
export function copyRowsForAccount(acc: PaymentAccount): CopyRowData[] {
  const rows: CopyRowData[] = [];
  if (acc.method === 'efectivo' || acc.method === 'punto_venta') return rows;
  if (usesVeForm(acc.method)) {
    rows.push({ label: 'Banco', value: acc.bank, copy: acc.bank });
    rows.push({ label: 'RIF', value: acc.rif, copy: rifDigits(acc.rif) });
    if (acc.method === 'pago_movil' && acc.phone) {
      rows.push({ label: 'Teléfono', value: normalizePhoneVE(acc.phone), copy: normalizePhoneVE(acc.phone) });
    }
    if (acc.accountNumber) {
      rows.push({ label: 'Cuenta', value: acc.accountNumber, copy: acc.accountNumber });
    }
    if (acc.email) {
      rows.push({ label: 'Correo', value: acc.email, copy: acc.email });
    }
    return rows;
  }
  if (acc.method === 'zelle') {
    if (acc.email) rows.push({ label: 'Correo Zelle', value: acc.email, copy: acc.email });
    if (acc.holderName) rows.push({ label: 'Titular', value: acc.holderName, copy: acc.holderName });
    return rows;
  }
  // binance
  if (acc.binanceId) rows.push({ label: 'Binance ID', value: acc.binanceId, copy: acc.binanceId });
  if (acc.holderName) rows.push({ label: 'Titular', value: acc.holderName, copy: acc.holderName });
  if (acc.email) rows.push({ label: 'Correo', value: acc.email, copy: acc.email });
  return rows;
}

/**
 * QR que se muestra al cliente para esta cuenta — SOLO el suyo (5.84).
 * Cada cuenta nace SIN QR: el cliente ve un QR únicamente cuando el dueño
 * sube la imagen de ESA cuenta en /admin/ajustes. Nada de respaldos ni
 * herencias: un segundo Pago Móvil NO muestra el QR del primero (reporte
 * del dueño). El QR empaquetado del repo queda SOLO en la cuenta semilla
 * de instalación nueva (brand.ts) — el Pago Móvil principal de 5.79.
 */
export function qrForAccount(acc: PaymentAccount): string | null {
  return acc.qrUrl && acc.qrUrl.trim().length > 0 ? acc.qrUrl.trim() : null;
}

/* ───────────────────────────── panel (admin) ────────────────────────────── */

/** Validación de la URL del QR: absoluta (imgbb) o asset local del repo. */
export function isValidQrUrl(v: string): boolean {
  const t = v.trim();
  if (!t) return true; // opcional
  return /^https?:\/\//i.test(t) || t.startsWith('/');
}

/** Emails/ids válidos para Zelle/Binance a nivel panel (mínimo razonable). */
export function isValidBinanceId(v: string): boolean {
  const t = v.trim();
  return t.length >= 4 && t.length <= 120;
}

/** Dirección de correo de recaudo reutiliza isValidEmail; titular ≥ 3 chars. */
export function isValidHolderName(v: string): boolean {
  return v.trim().length >= 3;
}
