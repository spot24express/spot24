/**
 * Tests del horario del delivery (5.112-B): la franja que el dueño guarda en
 * Ajustes gobierna si el checkout ofrece ENVÍO o solo RETIRO EN TIENDA.
 *
 * El caso del dueño, tal cual: con franja 12:00 pm–11:59 pm, entre las
 * 12:00 am y las 11:59 am solo puede pedirse retiro en tienda — los
 * deliverys no están. Y al cambiar la franja en Ajustes, la app obedece al
 * instante (la lógica es pura: mismos datos, misma respuesta).
 *
 * La hora se calcula con offset fijo UTC-4 (Venezuela no tiene horario de
 * verano): los tests usan fechas UTC concretas y comprueban el minuto
 * caraqueño resultante — mismo resultado en navegador y servidor.
 */
import { describe, expect, it } from 'vitest';
import {
  deliveryAbierto,
  esHHMM,
  hhmmAMinutos,
  hhmmBonito,
  minutosAhoraCaracas,
} from '@/shared/lib/horarioDelivery';

describe('esHHMM', () => {
  it('acepta HH:MM de 24h bien formado', () => {
    expect(esHHMM('12:00')).toBe(true);
    expect(esHHMM('00:00')).toBe(true);
    expect(esHHMM('23:59')).toBe(true);
  });

  it('rechaza formatos raros o horas imposibles', () => {
    expect(esHHMM('')).toBe(false);
    expect(esHHMM('7:00')).toBe(false);
    expect(esHHMM('24:00')).toBe(false);
    expect(esHHMM('12:60')).toBe(false);
    expect(esHHMM('de 8 a 8')).toBe(false);
  });
});

describe('hhmmAMinutos', () => {
  it('convierte la hora a minutos del día', () => {
    expect(hhmmAMinutos('12:00')).toBe(720);
    expect(hhmmAMinutos('23:59')).toBe(1439);
    expect(hhmmAMinutos('00:00')).toBe(0);
  });
});

describe('minutosAhoraCaracas', () => {
  it('convierte UTC a hora de Venezuela (UTC-4 fijo, sin verano)', () => {
    // 16:00 UTC = 12:00 pm en Caracas → minuto 720.
    expect(minutosAhoraCaracas(new Date('2026-01-15T16:00:00Z'))).toBe(720);
    // 03:30 UTC = 11:30 pm en Caracas (del día anterior) → minuto 1410.
    expect(minutosAhoraCaracas(new Date('2026-01-15T03:30:00Z'))).toBe(1410);
    // 04:00 UTC = 12:00 am en Caracas → minuto 0.
    expect(minutosAhoraCaracas(new Date('2026-01-15T04:00:00Z'))).toBe(0);
  });
});

describe('deliveryAbierto — ejemplo exacto del dueño (12:00 a 23:59)', () => {
  const franja = { start: '12:00', end: '23:59' };

  it('a las 11:59 am está CERRADO (solo retiro en tienda)', () => {
    expect(deliveryAbierto(franja, 719)).toBe(false);
  });

  it('a las 12:00 pm ABRE', () => {
    expect(deliveryAbierto(franja, 720)).toBe(true);
  });

  it('a las 11:59 pm todavía está abierto', () => {
    expect(deliveryAbierto(franja, 1439)).toBe(true);
  });

  it('a las 12:00 am ya cerró', () => {
    expect(deliveryAbierto(franja, 0)).toBe(false);
  });
});

describe('deliveryAbierto — defensas', () => {
  it('sin franja guardada (vacía) = delivery siempre disponible', () => {
    expect(deliveryAbierto({ start: '', end: '' }, 0)).toBe(true);
  });

  it('franja incompleta o mal formada = sin restricción (jamás bloquear ventas)', () => {
    expect(deliveryAbierto({ start: '12:00', end: '' }, 0)).toBe(true);
    expect(deliveryAbierto({ start: '7:00', end: '20:00' }, 0)).toBe(true);
  });

  it('start === end = sin restricción (la validación del panel lo prohíbe igual)', () => {
    expect(deliveryAbierto({ start: '12:00', end: '12:00' }, 500)).toBe(true);
  });
});

describe('deliveryAbierto — franja que cruza la medianoche', () => {
  const franja = { start: '22:00', end: '02:00' };

  it('abre de noche y en la madrugada', () => {
    expect(deliveryAbierto(franja, 23 * 60)).toBe(true);
    expect(deliveryAbierto(franja, 60)).toBe(true);
  });

  it('cierra en el día', () => {
    expect(deliveryAbierto(franja, 720)).toBe(false);
  });
});

describe('hhmmBonito', () => {
  it('muestra la hora en formato am/pm como habla el dueño', () => {
    expect(hhmmBonito('12:00')).toBe('12:00 pm');
    expect(hhmmBonito('23:59')).toBe('11:59 pm');
    expect(hhmmBonito('07:05')).toBe('7:05 am');
    expect(hhmmBonito('00:00')).toBe('12:00 am');
  });
});
