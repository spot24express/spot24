/**
 * SPOT 24 · QA 5.112-C — PARCHE IMGBB: subida con reintentos.
 * El 29/10/2026 imgbb (el hosting gratuito de TODAS las fotos del negocio)
 * estuvo caído en 503 global: la subida fallaba al primer intento y el
 * checkout rechazaba pedidos. imgbbConReintentos es la respuesta: 3 intentos,
 * reintento SOLO en caídas reales (red, 5xx, 429) y mensaje honesto al
 * agotarse (prefijo contrato con backend.ts → código 'images').
 *
 * Pruebas 100% node: se sustituye fetch global — no toca red ni emulador.
 *
 * 5.125 · RELOJ 100% SIMULADO Y AVANZADO A MANO: las pausas de reintento
 * (500 ms y 1,5 s) NO se esperan en tiempo real. Antes se usaba
 * shouldAdvanceTime (el reloj simulado avanzaba solo al ritmo del reloj
 * real) y cada test de reintento ESPERABA de verdad su pausa dentro del
 * tope de 5 s de vitest: en una corrida cargada (suite completa, la PC
 * ocupada con los pdfjs) el test «agotados los 3 intentos» —que necesita
 * ~2 s reales de pausas— cruzó ese tope y vitest lo mató por timeout SIN
 * que la lógica hubiera fallado (falso positivo por carga del equipo).
 * Ahora el reloj arranca QUIETO y cada pausa se avanza a mano con
 * vi.advanceTimersByTimeAsync: el test no espera ni 1 ms real, sigue
 * contando CUÁNTAS veces se llamó a fetch (no cuánto tardó) y el
 * resultado deja de depender de lo ocupada que esté la máquina.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { imgbbConReintentos, MSG_IMGBB_CAIDO, MSG_IMGBB_RESPUESTA } from '../lib/imgbb';

/** Doble mínimo de Response: solo lo que lee el helper (ok/status/json). */
function resJson(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const OK_BODY = {
  success: true,
  data: { url: 'https://i.ibb.co/foto.jpg', delete_url: 'https://api.imgbb.com/borrar' },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Reloj 100% simulado y QUIETO (5.125): el tiempo solo avanza cuando un
  // test lo avanza a mano. Nada de este archivo espera tiempo real.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('imgbbConReintentos (5.112-C · subida con reintentos)', () => {
  it('al primer intento devuelve url y deleteUrl sin gastar reintentos', async () => {
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const r = await imgbbConReintentos('clave', 'QUJD');
    expect(r.url).toBe('https://i.ibb.co/foto.jpg');
    expect(r.deleteUrl).toBe('https://api.imgbb.com/borrar');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un 503 se reintenta y sale en el 2º intento', async () => {
    fetchMock.mockResolvedValueOnce(resJson({}, 503));
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const pendiente = imgbbConReintentos('clave', 'QUJD');
    // 5.125: pausa 1 (500 ms) avanzada a mano → arranca el 2º intento y sale.
    await vi.advanceTimersByTimeAsync(1_000);
    const r = await pendiente;
    expect(r.url).toBe('https://i.ibb.co/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('errores de red se reintentan y sale en el 3º intento', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const pendiente = imgbbConReintentos('clave', 'QUJD');
    // 5.125: pausa 1 (500 ms) → 2º intento; pausa 2 (1,5 s) → 3º intento: sale.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const r = await pendiente;
    expect(r.url).toBe('https://i.ibb.co/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un 429 (límite de tasa) se trata como caída y se reintenta', async () => {
    fetchMock.mockResolvedValueOnce(resJson({}, 429));
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const pendiente = imgbbConReintentos('clave', 'QUJD');
    // 5.125: pausa 1 (500 ms) avanzada a mano → 2º intento: sale.
    await vi.advanceTimersByTimeAsync(1_000);
    const r = await pendiente;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.url.startsWith('https://')).toBe(true);
  });

  it('agotados los 3 intentos lanza el mensaje HONESTO de caída (contrato con backend.ts)', async () => {
    fetchMock.mockResolvedValue(resJson({}, 503));
    const pendiente = imgbbConReintentos('clave', 'QUJD').catch((e) => e);
    // 5.125: las dos pausas (500 ms y 1,5 s) avanzadas a mano. Tras la 2ª,
    // el 3º intento agota y lanza — sin pausas extra: el mensaje sale YA.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const err = await pendiente;
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe('unavailable');
    expect((err as HttpsError).message).toBe(MSG_IMGBB_CAIDO);
    // CONTRATO: el prefijo es el que reconoce toAppError → código 'images'.
    expect(MSG_IMGBB_CAIDO.startsWith('El servicio de imágenes está caído')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un 400 (foto inválida) NO se reintenta: falla al momento', async () => {
    fetchMock.mockResolvedValueOnce(resJson({}, 400));
    const err = await imgbbConReintentos('clave', 'QUJD').catch((e) => e);
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe('unavailable');
    expect((err as HttpsError).message).toBe('imgbb rechazó la subida (HTTP 400).');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('respuesta sin URL utilizable lanza internal y NO se reintenta', async () => {
    fetchMock.mockResolvedValueOnce(resJson({ success: true, data: {} }));
    const err = await imgbbConReintentos('clave', 'QUJD').catch((e) => e);
    expect(err).toBeInstanceOf(HttpsError);
    expect((err as HttpsError).code).toBe('internal');
    expect((err as HttpsError).message).toBe(MSG_IMGBB_RESPUESTA);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('acepta la respuesta success:{code:200} con display_url (forma real de imgbb)', async () => {
    fetchMock.mockResolvedValueOnce(
      resJson({ success: { code: 200 }, data: { display_url: 'https://i.ibb.co/otra.jpg' } }),
    );
    const r = await imgbbConReintentos('clave', 'QUJD');
    expect(r.url).toBe('https://i.ibb.co/otra.jpg');
    expect(r.deleteUrl).toBe('');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rechaza una «url» que no es https (no confía en el cuerpo del servicio)', async () => {
    fetchMock.mockResolvedValueOnce(resJson({ success: true, data: { url: 'http://insegura.dev/a.jpg' } }));
    const err = await imgbbConReintentos('clave', 'QUJD').catch((e) => e);
    expect((err as HttpsError).code).toBe('internal');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
