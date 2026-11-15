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

/**
 * ¿El checkout ofrece la validación automática con esta cuenta?
 *
 * 5.142 · RESPALDO DE CUENTA ÚNICA: antes, si settings/general perdía el
 * teléfono del Pago Móvil (p. ej. un guardado de Operación con el suiche
 * apagado o con la carga del doc fallida — el campo queda oculto y el doc
 * se sobrescribe completo), la validación automática moría SILENCIOSAMENTE
 * aunque el suiche siguiera activo y la cuenta BDV estuviera perfecta.
 * Ahora, si el teléfono de settings viene vacío pero hay EXACTAMENTE UNA
 * cuenta de pago móvil activa (settings/payment_accounts), no hay ninguna
 * ambigüedad: esa es la cuenta donde concilia el banco y el auto funciona.
 * Con 2+ cuentas de pago móvil el emparejamiento sigue siendo obligatorio
 * (la app debe saber a qué cuenta pregunta el banco).
 *
 * `cuentasPagoMovilActivas` = cuántas cuentas ACTIVAS de pago móvil hay
 * (CheckoutPage lo saca de activeAccountsOf). 0 si no se pasa (tests viejos
 * y llamadas simples): en ese caso el teléfono de settings es exigido.
 */
export function pagoMovilAutoDisponible(
  auto: boolean,
  telefonoDestinoSettings: string,
  account: PaymentAccount | null | undefined,
  cuentasPagoMovilActivas = 0,
): boolean {
  if (!auto) return false;
  if (!account || account.method !== 'pago_movil') return false;
  const tel = normalizePhoneVE(account.phone ?? '');
  if (tel.length !== 11) return false;
  const settings = normalizePhoneVE(telefonoDestinoSettings);
  // 5.142 · settings SIN teléfono usable + una sola cuenta de pago móvil
  // activa = la cuenta se deduce sola (cero ambigüedad, cero muerte muda).
  if (settings.length !== 11) return cuentasPagoMovilActivas === 1;
  return tel === settings;
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

/**
 * POLÍTICA DEL DUEÑO (5.26 + 5.147): en el paso Pago del checkout el cliente
 * solo puede cancelar mientras NO haya pagado nada. Con comprobante adjunto
 * (camino manual) o con CUALQUIER pago ya validado por el banco —parcial o
 * completo: el Pago Móvil automático no lleva comprobante— el dinero ya se
 * movió y el botón «Cancelar pedido» desaparece de debajo de «Revisar y
 * confirmar»; la cancelación la gestiona el personal desde el panel.
 */
export function puedeCancelarEnPago(
  receiptAdjunto: boolean,
  validadas: readonly PagoBdvEvidence[],
): boolean {
  return !receiptAdjunto && validadas.length === 0;
}
