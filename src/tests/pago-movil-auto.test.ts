/**
 * SPOT 24 · Ronda 5.113 — helpers PUROS de la validación automática del pago
 * móvil (BDV). Espejo del backend: los mismos números con los mismos
 * redondeos, para que lo que el cliente muestra sea lo que el banco valida.
 */
import { describe, expect, it } from 'vitest';
import type { PaymentAccount } from '../shared/constants/brand';
import {
  coberturaCompleta,
  fechaHoyCaracas,
  isValidReferenciaBdv,
  pagoMovilAutoDisponible,
  restanteBs,
  round2,
  vueltoBs,
  type PagoBdvEvidence,
} from '../shared/lib/pagoMovilAuto';

const ev = (referencia: string, importe: number): PagoBdvEvidence => ({
  referencia,
  importe,
  fechaPago: '2026-10-29',
  bancoOrigen: '0102',
  telefonoDestino: '04220337872',
  validatedAt: 1,
});

const cuentaBDV: PaymentAccount = {
  id: 'pago_movil',
  method: 'pago_movil',
  active: true,
  bank: 'Banco de Venezuela',
  rif: 'J508003284',
  phone: '0422-0337872',
};

describe('5.113 · redondeo y fechas (idénticos al backend)', () => {
  it('round2 = Math.round(x*100)/100 (el mismo que calcula totalVes)', () => {
    expect(round2(6012)).toBe(6012);
    expect(round2(1234.567)).toBe(1234.57);
    expect(round2(0.005)).toBe(0.01);
  });

  it('fechaHoyCaracas: AAAA-MM-DD de Venezuela, no del servidor que sea', () => {
    // 2026-11-01 00:30 UTC = 2026-10-31 20:30 en Caracas (UTC-4).
    expect(fechaHoyCaracas(new Date('2026-11-01T00:30:00Z'))).toBe('2026-10-31');
    // 2026-10-29 15:00 UTC = 11:00 am en Caracas: mismo día.
    expect(fechaHoyCaracas(new Date('2026-10-29T15:00:00Z'))).toBe('2026-10-29');
  });
});

describe('5.113 · referencia completa para el conciliador', () => {
  it('acepta la referencia completa (4-15 dígitos)', () => {
    expect(isValidReferenciaBdv('123112313')).toBe(true);
    expect(isValidReferenciaBdv('8877')).toBe(true);
    expect(isValidReferenciaBdv('12')).toBe(false);
    expect(isValidReferenciaBdv('')).toBe(false);
    expect(isValidReferenciaBdv('1234567890123456')).toBe(false);
  });
});

describe('5.113 · elegibilidad: solo la cuenta BDV del dueño se valida sola', () => {
  it('suiche ON + cuenta pago móvil con el MISMO teléfono → disponible', () => {
    expect(pagoMovilAutoDisponible(true, '04220337872', cuentaBDV)).toBe(true);
  });

  it('suiche OFF → jamás disponible (la app sigue exactamente igual)', () => {
    expect(pagoMovilAutoDisponible(false, '04220337872', cuentaBDV)).toBe(false);
  });

  it('teléfono de la cuenta distinto al guardado → no disponible (otro banco)', () => {
    expect(pagoMovilAutoDisponible(true, '04149998877', cuentaBDV)).toBe(false);
  });

  it('cuenta de otro método → no disponible', () => {
    expect(pagoMovilAutoDisponible(true, '04220337872', { ...cuentaBDV, method: 'efectivo' })).toBe(false);
    expect(pagoMovilAutoDisponible(true, '04220337872', null)).toBe(false);
  });

  it('normaliza formatos: cuenta con guiones vs settings sin guiones coinciden', () => {
    expect(pagoMovilAutoDisponible(true, '0422-0337872', { ...cuentaBDV, phone: '04220337872' })).toBe(true);
  });
});

describe('5.113 · faltante y vuelto (el patrón PedidosYa)', () => {
  it('sin validaciones: el restante es el total', () => {
    expect(restanteBs(6012, [])).toBe(6012);
    expect(coberturaCompleta(6012, [])).toBe(false);
  });

  it('pago exacto → cobertura completa, sin faltante ni vuelto', () => {
    const pagos = [ev('887766', 6012)];
    expect(restanteBs(6012, pagos)).toBe(0);
    expect(vueltoBs(6012, pagos)).toBe(0);
    expect(coberturaCompleta(6012, pagos)).toBe(true);
  });

  it('pagó menos (100 de 120) → faltante de 20 y SIN cobertura', () => {
    const pagos = [ev('111111', 100)];
    expect(restanteBs(120, pagos)).toBe(20);
    expect(coberturaCompleta(120, pagos)).toBe(false);
  });

  it('pagó menos y luego completa → dos referencias, cobertura completa', () => {
    const pagos = [ev('111111', 100), ev('222222', 20)];
    expect(restanteBs(120, pagos)).toBe(0);
    expect(coberturaCompleta(120, pagos)).toBe(true);
  });

  it('pagó de más → vuelto a entregar, con cobertura', () => {
    const pagos = [ev('333333', 150)];
    expect(restanteBs(120, pagos)).toBe(0);
    expect(vueltoBs(120, pagos)).toBe(30);
    expect(coberturaCompleta(120, pagos)).toBe(true);
  });

  it('diferencias de céntimos por redondeo cuentan como cubiertas (0.004 de tolerancia)', () => {
    const pagos = [ev('444444', 119.998)];
    expect(restanteBs(120, pagos)).toBe(0);
    expect(coberturaCompleta(120, pagos)).toBe(true);
  });
});
