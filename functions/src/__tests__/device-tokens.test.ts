/**
 * SPOT 24 · Pruebas unitarias del traspaso de dispositivo (5.122).
 * ────────────────────────────────────────────────────────────────────
 * Caso de negocio: tres cajeras comparten un equipo por turnos. El core
 * coreTransferDeviceTokens toca Firestore real (se ejercita en el flujo con
 * emulador); AQUÍ se prueban las decisiones PURAS que no pueden fallar:
 * saneo del deviceId/token que manda el cliente y elección del doc canario
 * que se traspasa. Sin red, sin emulador: corren siempre.
 */
import { describe, expect, it } from 'vitest';
import { elegirDocOrigen, esPersonal, sanearDeviceId, sanearTokenFcm } from '../deviceTokens';

describe('esPersonal (5.122: guardia — solo el personal traspasa el equipo)', () => {
  it('acepta los 4 roles del panel compartido', () => {
    expect(esPersonal('admin')).toBe(true);
    expect(esPersonal('gerente')).toBe(true);
    expect(esPersonal('cajero')).toBe(true);
    expect(esPersonal('delivery')).toBe(true);
  });

  it('rechaza clientes y roles desconocidos (no se llevan el equipo de la tienda)', () => {
    expect(esPersonal('cliente')).toBe(false);
    expect(esPersonal('')).toBe(false);
    expect(esPersonal('CAJERO')).toBe(false); // el role se guarda en minúscula
    expect(esPersonal(undefined)).toBe(false);
    expect(esPersonal(null)).toBe(false);
    expect(esPersonal(123)).toBe(false);
  });
});

describe('sanearDeviceId (5.122: identidad del navegador que manda el cliente)', () => {
  it('acepta un UUID v4 (formato normal de newDeviceId)', () => {
    expect(sanearDeviceId('9b2f4c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f')).toBe(
      '9b2f4c1e-8a7d-4c3b-9e2f-1a2b3c4d5e6f',
    );
  });

  it('acepta el fallback d-<tiempo36>-<azar36>', () => {
    expect(sanearDeviceId('d-lzm5k2x1-ab12cd34')).toBe('d-lzm5k2x1-ab12cd34');
  });

  it('recorta espacios accidentales', () => {
    expect(sanearDeviceId('  d-lzm5k2x1-ab12cd34  ')).toBe('d-lzm5k2x1-ab12cd34');
  });

  it('rechaza vacío, cortos, con caracteres raros o gigantes', () => {
    expect(sanearDeviceId('')).toBe('');
    expect(sanearDeviceId(undefined)).toBe('');
    expect(sanearDeviceId(null)).toBe('');
    expect(sanearDeviceId('corto')).toBe('');
    expect(sanearDeviceId('con espacios y <script>')).toBe('');
    expect(sanearDeviceId(`${'a'.repeat(81)}`)).toBe('');
  });
});

describe('sanearTokenFcm (5.122: solo para hallar docs legacy sin deviceId)', () => {
  it('acepta un token FCM de largo realista', () => {
    const token = `${'f'.repeat(60)}:${'APA91b' + 'k'.repeat(80)}`;
    expect(sanearTokenFcm(token)).toBe(token);
  });

  it('rechaza vacío y tokens de largo irreal', () => {
    expect(sanearTokenFcm('')).toBe('');
    expect(sanearTokenFcm('corto')).toBe('');
    expect(sanearTokenFcm(`${'x'.repeat(257)}`)).toBe('');
    expect(sanearTokenFcm(12345)).toBe('');
  });
});

describe('elegirDocOrigen (5.122: qué doc se traspasa al usuario que entra)', () => {
  it('devuelve el primer doc con token válido', () => {
    const origen = elegirDocOrigen([
      { uidDueno: 'u-cajera-1', data: { token: '', deviceId: 'd-1' } },
      { uidDueno: 'u-cajera-1', data: { token: 'token-real', userAgent: 'UA', createdAt: 111 } },
    ]);
    expect(origen).toEqual({ token: 'token-real', userAgent: 'UA', createdAt: 111 });
  });

  it('devuelve null si ningún doc tiene token (nada que traspasar)', () => {
    expect(elegirDocOrigen([{ uidDueno: 'u-1', data: { deviceId: 'd-1' } }])).toBeNull();
    expect(elegirDocOrigen([])).toBeNull();
  });

  it('traspasa el userAgent y createdAt tal cual (el destino conserva el suyo si ya existía)', () => {
    const origen = elegirDocOrigen([
      { uidDueno: 'u-2', data: { token: 't', userAgent: 'x'.repeat(300), createdAt: 42 } },
    ]);
    expect(origen?.userAgent).toBe('x'.repeat(120)); // tope 120 como en upsertTokenDoc
    expect(origen?.createdAt).toBe(42);
  });
});
