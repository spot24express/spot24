/**
 * 5.143 · Tests del watchdog de cotización.
 *
 * Síntoma que motiva la ronda: fuera de la franja del delivery el checkout
 * vuela a RETIRO y quedaba clavado en «Calculando montos exactos…» para
 * siempre (promesa que nunca se definía). El contrato nuevo: la carrera
 * cotización-vs-watchdog JAMÁS queda pendiente — resuelve ok, o error por
 * fallo, o error por vencimiento del plazo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { correrConWatchdog, msWatchdogCotizacion, type ResultadoCotizacion } from '@/shared/lib/cotizacion';

describe('msWatchdogCotizacion', () => {
  it('producción: 20 s (bajo el tope de red de 25 s)', () => {
    expect(msWatchdogCotizacion(false)).toBe(20_000);
  });

  it('desarrollo (netlify.dev en serie): 45 s', () => {
    expect(msWatchdogCotizacion(true)).toBe(45_000);
  });
});

describe('correrConWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('promesa que resuelve a tiempo → ok con el valor', async () => {
    const carrera: Promise<ResultadoCotizacion<number>> = correrConWatchdog(
      Promise.resolve(42),
      20_000,
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(carrera).resolves.toEqual({ tipo: 'ok', valor: 42 });
  });

  it('promesa que falla a tiempo → error (sin explotar)', async () => {
    const carrera: Promise<ResultadoCotizacion<number>> = correrConWatchdog(
      Promise.reject(new Error('fn caída')),
      20_000,
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(carrera).resolves.toEqual({ tipo: 'error' });
  });

  it('promesa que NUNCA se define y el reloj vence → error (el caso del dueño)', async () => {
    const captura: { resolver?: (v: number) => void } = {};
    const eterna = new Promise<number>((resolve) => {
      captura.resolver = resolve; // jamás se llama: la promesa queda pendiente
    });
    const carrera: Promise<ResultadoCotizacion<number>> = correrConWatchdog(eterna, 20_000);
    // Antes del vencimiento: sigue pendiente (la UI sigue en «Calculando…»).
    await vi.advanceTimersByTimeAsync(19_999);
    let visto: ResultadoCotizacion<number> | null = null;
    void carrera.then((r) => {
      visto = r;
    });
    await vi.advanceTimersByTimeAsync(1); // 20 000 ms: vence el watchdog
    expect(visto).toEqual({ tipo: 'error' });
    // La promesa eterna sigue colgada pero ya no afecta: el estado quedó
    // definido y la UI muestra el error con Reintentar.
    expect(captura.resolver).toBeTypeOf('function');
  });

  it('respuesta tardía tras el vencimiento: NO re-resuelve la carrera (el estado ya es error y la UI no parpadea)', async () => {
    const captura: { resolver?: (v: number) => void } = {};
    const tardía = new Promise<number>((resolve) => {
      captura.resolver = resolve;
    });
    const carrera: Promise<ResultadoCotizacion<number>> = correrConWatchdog(tardía, 20_000);
    await vi.advanceTimersByTimeAsync(20_001); // vence el watchdog
    await expect(carrera).resolves.toEqual({ tipo: 'error' });
    captura.resolver?.(7); // la respuesta llega tarde
    await vi.advanceTimersByTimeAsync(0);
    // La carrera YA se definió como error: la respuesta tardía no la cambia.
    // (El llamador con `alive` decide si una corrida NUEVA la toma.)
    await expect(carrera).resolves.toEqual({ tipo: 'error' });
  });

  it('promesa que resuelve justo en el límite → ok gana al reloj', async () => {
    const captura: { resolver?: (v: number) => void } = {};
    const justa = new Promise<number>((resolve) => {
      captura.resolver = resolve;
    });
    const carrera: Promise<ResultadoCotizacion<number>> = correrConWatchdog(justa, 20_000);
    await vi.advanceTimersByTimeAsync(19_999);
    captura.resolver?.(1);
    await vi.advanceTimersByTimeAsync(0);
    await expect(carrera).resolves.toEqual({ tipo: 'ok', valor: 1 });
    // Avanzar mucho más NO cambia el resultado (reloj limpiado).
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(carrera).resolves.toEqual({ tipo: 'ok', valor: 1 });
  });
});
