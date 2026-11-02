/**
 * SPOT 24 · Ronda 5.113 — Lógica PURA de la validación automática del pago
 * móvil (BDV). Espejo cliente de las reglas del backend (functions/src/
 * lib/bdv.ts + pagoMovil.ts): una sola fuente de verdad compartida por el
 * checkout y los tests. Sin Firestore, sin React.
 */
import type { PaymentAccount } from '@/shared/constants/brand';
import { normalizePhoneVE } from './validation';

/** Evidencia de un pago validado por el banco (viaja a fn-createOrder). */
export interface PagoBdvEvidence {
  referencia: string;
  importe: number;
  fechaPago: string;
  bancoOrigen: string;
  telefonoDestino: string;
  validatedAt: number;
}

/** Respuesta de fn-checkPagoMovil. */
export interface CheckPagoMovilResponse {
  ok: boolean;
  verificado: boolean;
  /** true = la referencia ya estaba validada por esta sesión: misma evidencia. */
  repetida: boolean;
  evidencia: PagoBdvEvidence;
}

/** Máximo de pagos parciales por pedido — espejo del backend. */
export const MAX_PAGOS_PARCIALES = 3;

/** Redondeo a 2 decimales, idéntico al backend (round2). */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Fecha de HOY en Venezuela (AAAA-MM-DD): el pago móvil se hace «ahora» y
 * el conciliador de BDV exige la fecha exacta del movimiento. La app ya
 * razona en hora de Venezuela en todo el checkout (5.112-B).
 */
export function fechaHoyCaracas(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

/**
 * Referencia COMPLETA del pago: dígitos, 4-15. El conciliador de BDV busca
 * el movimiento por su referencia completa — no por los últimos 6 dígitos
 * que pide el formulario manual (ese queda para la revisión del cajero).
 */
export function isValidReferenciaBdv(value: string): boolean {
  const d = value.replace(/\D/g, '');
  return d.length >= 4 && d.length <= 15;
}

/** ¿El checkout ofrece la validación automática con esta cuenta? */
export function pagoMovilAutoDisponible(
  auto: boolean,
  telefonoDestinoSettings: string,
  account: PaymentAccount | null | undefined,
): boolean {
  if (!auto) return false;
  if (!account || account.method !== 'pago_movil') return false;
  const tel = normalizePhoneVE(account.phone ?? '');
  return tel.length === 11 && tel === normalizePhoneVE(telefonoDestinoSettings);
}

/**
 * Restante por pagar (Bs) con las evidencias ya validadas. Nunca negativo:
 * un excedente es VUELTO, no crédito negativo.
 */
export function restanteBs(totalVes: number, validadas: readonly PagoBdvEvidence[]): number {
  const suma = validadas.reduce((s, e) => s + e.importe, 0);
  return Math.max(0, round2(totalVes - suma));
}

/** Vuelto a entregar al cliente (solo si pagó de más). */
export function vueltoBs(totalVes: number, validadas: readonly PagoBdvEvidence[]): number {
  const suma = validadas.reduce((s, e) => s + e.importe, 0);
  return Math.max(0, round2(suma - totalVes));
}

/** ¿Las validaciones actuales ya cubren el total? */
export function coberturaCompleta(totalVes: number, validadas: readonly PagoBdvEvidence[]): boolean {
  return validadas.length > 0 && restanteBs(totalVes, validadas) <= 0.004;
}
