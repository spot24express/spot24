/**
 * SPOT 24 · QA 5.112-C — PARCHE IMGBB: subida con reintentos.
 * El 29/10/2026 imgbb (el hosting gratuito de TODAS las fotos del negocio)
 * estuvo caído en 503 global: la subida fallaba al primer intento y el
 * checkout rechazaba pedidos. imgbbConReintentos es la respuesta: 3 intentos,
 * reintento SOLO en caídas reales (red, 5xx, 429) y mensaje honesto al
 * agotarse (prefijo contrato con backend.ts → código 'images').
 *
 * Pruebas 100% node: se sustituye fetch global — no toca red ni emulador.
 * Los reintentos usan temporizadores reales de 500 ms/1,5 s: con
 * shouldAdvanceTime el reloj simulado avanza solo y la suite no pierde
 * determinismo (se cuenta CUÁNTAS veces se llamó a fetch, no cuánto tardó).
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
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
    const r = await imgbbConReintentos('clave', 'QUJD');
    expect(r.url).toBe('https://i.ibb.co/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('errores de red se reintentan y sale en el 3º intento', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    fetchMock.mockRejectedValueOnce(new Error('ECONNRESET'));
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const r = await imgbbConReintentos('clave', 'QUJD');
    expect(r.url).toBe('https://i.ibb.co/foto.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('un 429 (límite de tasa) se trata como caída y se reintenta', async () => {
    fetchMock.mockResolvedValueOnce(resJson({}, 429));
    fetchMock.mockResolvedValueOnce(resJson(OK_BODY));
    const r = await imgbbConReintentos('clave', 'QUJD');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.url.startsWith('https://')).toBe(true);
  });

  it('agotados los 3 intentos lanza el mensaje HONESTO de caída (contrato con backend.ts)', async () => {
    fetchMock.mockResolvedValue(resJson({}, 503));
    const err = await imgbbConReintentos('clave', 'QUJD').catch((e) => e);
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
