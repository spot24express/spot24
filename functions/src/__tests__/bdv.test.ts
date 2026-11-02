/**
 * SPOT 24 · Ronda 5.113 — Adaptador del API Conciliación BDV (lib/bdv.ts).
 * Normalizadores puros + la llamada al conciliador con fetch simulado.
 * El contrato viene del manual MDU-006: fecha "AAAA-MM-DD", importe "120.00"
 * con punto, rechazos con HTTP 200 y error en body.code.
 */
import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  bancoOrigenBdv,
  bdvQueryValida,
  bdvValidarPago,
  cedulaBdv,
  fechaBdv,
  importeBdv,
  referenciaBdv,
  telefonoBdv,
  type BdvQuery,
} from '../lib/bdv';

const CFG = { url: 'http://200.11.243.176:444/getMovement', key: 'CLAVE-DE-CALIDAD' };

function querySobre(): BdvQuery {
  return {
    cedulaPagador: 'V27037606',
    telefonoPagador: '04127141363',
    telefonoDestino: '04220337872',
    referencia: '123112313',
    fechaPago: '2026-10-29',
    importe: '120.00',
    bancoOrigen: '0102',
  };
}

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('5.113 · normalizadores con el formato exacto del manual BDV', () => {
  it('cédula: letra + dígitos, sin puntos ni guiones ("V27037606")', () => {
    expect(cedulaBdv('v-27.037.606')).toBe('V27037606');
    expect(cedulaBdv('27.037.606')).toBe('27037606');
    expect(cedulaBdv('  V12345678 ')).toBe('V12345678');
    expect(cedulaBdv(123)).toBe('');
  });

  it('teléfono: 11 dígitos locales con 0 inicial (igual que toda la app)', () => {
    expect(telefonoBdv('0424-1234567')).toBe('04241234567');
    expect(telefonoBdv('+584241234567')).toBe('04241234567');
    expect(telefonoBdv('4241234567')).toBe('04241234567');
    expect(telefonoBdv('abc')).toBe('');
  });

  it('referencia: solo dígitos, acotada', () => {
    expect(referenciaBdv(' 1231 12313 ')).toBe('123112313');
    expect(referenciaBdv('REF-88')).toBe('88');
  });

  it('banco origen: el código de 4 dígitos del select "(0102) Banco…"', () => {
    expect(bancoOrigenBdv('(0102) Banco de Venezuela')).toBe('0102');
    expect(bancoOrigenBdv('0134')).toBe('0134');
    expect(bancoOrigenBdv('Banesco')).toBe('');
  });

  it('importe: punto decimal, 2 decimales — jamás coma ("120.00")', () => {
    expect(importeBdv(120)).toBe('120.00');
    expect(importeBdv(85.5)).toBe('85.50');
    expect(importeBdv(1234.567)).toBe('1234.57');
    expect(importeBdv(0)).toBe('');
    expect(importeBdv(-5)).toBe('');
    expect(importeBdv(Number.NaN)).toBe('');
  });

  it('fecha: solo "AAAA-MM-DD" bien formado (el manual rechaza "/")', () => {
    expect(fechaBdv('2026-10-29')).toBe('2026-10-29');
    expect(fechaBdv('29/10/2026')).toBe('');
    expect(fechaBdv('')).toBe('');
  });

  it('consulta completa: todos los campos en su formato', () => {
    expect(bdvQueryValida(querySobre())).toBe(true);
    const mala = { ...querySobre(), importe: '' };
    expect(bdvQueryValida(mala)).toBe(false);
  });
});

describe('5.113 · bdvValidarPago contra el contrato del manual', () => {
  it('code 1000 → ok con el monto que reporta el banco', async () => {
    const fetchMock = vi.fn(async (..._args: unknown[]) =>
      new Response(
        JSON.stringify({
          code: 1000,
          message: 'Monto: 120.00 - estatus : Transaccion realizada',
          data: { status: '1000', amount: '120.00', reason: 'Transaccion realizada' },
          status: 200,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(true);
    expect(r.amount).toBe(120);
    expect(r.motivo).toBeNull();

    // El payload viaja EXACTO como lo pide el manual + la clave en el header.
    const call = fetchMock.mock.calls[0]! as unknown[];
    const opts = call[1] as RequestInit;
    expect(String(call[0])).toBe(CFG.url);
    expect((opts.headers as Record<string, string>)['X-API-Key']).toBe(CFG.key);
    const body = JSON.parse(String(opts.body));
    expect(body).toEqual({
      cedulaPagador: 'V27037606',
      telefonoPagador: '04127141363',
      telefonoDestino: '04220337872',
      referencia: '123112313',
      fechaPago: '2026-10-29',
      importe: '120.00',
      bancoOrigen: '0102',
    });
  });

  it('code 1010 «Registro solicitado no existe» → rechazo honesto (¡con HTTP 200!)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ code: 1010, message: 'No se pudo validar el movimiento: Registro solicitado no existe', data: null, status: 200 }),
          { status: 200 },
        ),
      ),
    );
    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('no_encontrado');
    expect(r.message).toContain('no encontró ese pago');
  });

  it('code 1010 por mandatorios → motivo "datos"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ code: 1010, message: 'No se pudo validar el movimiento: Datos Mandatorios no pueden estar en null', data: null, status: 200 }),
          { status: 200 },
        ),
      ),
    );
    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('datos');
  });

  it('HTTP 400 (contrato roto) → motivo "contrato"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 400 })));
    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('contrato');
  });

  it('red caída / timeout → motivo "inaccesible" (nunca lanza)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('inaccesible');
    expect(r.message).toContain('Reintenta');
  });

  it('respuesta ilegible → inaccesible', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not-json', { status: 200 })));
    const r = await bdvValidarPago(querySobre(), CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('inaccesible');
  });

  it('sin URL o sin clave → motivo "configuracion" SIN llamar al banco', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r1 = await bdvValidarPago(querySobre(), { url: '', key: 'x' });
    const r2 = await bdvValidarPago(querySobre(), { url: 'http://x', key: '' });
    expect(r1.motivo).toBe('configuracion');
    expect(r2.motivo).toBe('configuracion');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('consulta mal formada → motivo "datos" SIN llamar al banco', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await bdvValidarPago({ ...querySobre(), referencia: '12' }, CFG);
    expect(r.ok).toBe(false);
    expect(r.motivo).toBe('datos');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
