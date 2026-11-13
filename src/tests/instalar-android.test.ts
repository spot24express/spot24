/**
 * 5.139 · Guardián del banner de instalación de la PWA (Android).
 *
 * El dueño reportó: «en Android antes salía para que la instalara, ahora no
 * sale». La causa de fondo: la PWA dependía de la mini-infobar AUTOMÁTICA de
 * Chrome (caprichosa: engagement, descartes previos, app ya instalada).
 * Estos tests fijan la LÓGICA PURA del banner propio:
 *   · detectarPlataforma  → Android/iOS/PC con UAs reales (incluida la
 *     trampa del iPadOS 13+ que se hace pasar por Mac).
 *   · debeMostrarBanner   → matriz completa: solo Android con evento vivo,
 *     no instalada, no descartada; iPhone y PC excluidos por diseño.
 *   · captura temprana    → no-op seguro sin window (node/tests).
 */
import { describe, expect, it } from 'vitest';
import {
  detectarPlataforma,
  debeMostrarBanner,
  capturarEventoInstalacion,
  obtenerEventoInstalacion,
  gastarEventoInstalacion,
  KEY_SESION_DESCARTADO,
} from '@/shared/lib/instalarPwa';

/* User agents reales (o equivalentes) para los tests de plataforma. */
const UA_ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 13; SM-A235M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const UA_ANDROID_SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S901E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/118.0.0.0 Mobile Safari/537.36';
const UA_IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPADOS_MACUA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15';
const UA_WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

describe('5.139 · detectarPlataforma (UA reales)', () => {
  it('Android con Chrome → esAndroid, no iOS, no escritorio', () => {
    const p = detectarPlataforma(UA_ANDROID_CHROME, 5);
    expect(p).toEqual({ esIos: false, esAndroid: true, esEscritorio: false });
  });

  it('Android con Samsung Internet → esAndroid (el banner también opera ahí)', () => {
    const p = detectarPlataforma(UA_ANDROID_SAMSUNG, 5);
    expect(p.esAndroid).toBe(true);
    expect(p.esIos).toBe(false);
  });

  it('iPhone con Safari → esIos (excluido del banner: tiene SU instrucción propia)', () => {
    const p = detectarPlataforma(UA_IPHONE_SAFARI, 5);
    expect(p).toEqual({ esIos: true, esAndroid: false, esEscritorio: false });
  });

  it('iPadOS 13+ se hace pasar por Mac: con maxTouchPoints > 1 se detecta como iOS', () => {
    const p = detectarPlataforma(UA_IPADOS_MACUA, 5);
    expect(p.esIos).toBe(true);
    expect(p.esAndroid).toBe(false);
  });

  it('macOS de escritorio SIN touch → no es iOS ni Android', () => {
    const p = detectarPlataforma(UA_IPADOS_MACUA, 0);
    expect(p).toEqual({ esIos: false, esAndroid: false, esEscritorio: true });
  });

  it('Windows con Chrome → escritorio (excluido del banner)', () => {
    const p = detectarPlataforma(UA_WINDOWS_CHROME, 0);
    expect(p).toEqual({ esIos: false, esAndroid: false, esEscritorio: true });
  });

  it('UA vacío o ausente → no explota y cae en escritorio', () => {
    expect(detectarPlataforma('', 0)).toEqual({
      esIos: false,
      esAndroid: false,
      esEscritorio: true,
    });
    expect(detectarPlataforma(undefined as unknown as string, 0).esEscritorio).toBe(true);
  });
});

describe('5.139 · debeMostrarBanner (matriz de decisión)', () => {
  const OK = { hayPrompt: true, esAndroid: true, standalone: false, descartado: false };

  it('Android con evento vivo, no instalada, no descartada → SE muestra', () => {
    expect(debeMostrarBanner(OK)).toBe(true);
  });

  it('sin evento beforeinstallprompt (navegador no lo considera instalable) → NO se muestra', () => {
    expect(debeMostrarBanner({ ...OK, hayPrompt: false })).toBe(false);
  });

  it('iPhone (no Android) → NO se muestra: su instrucción propia ya cubre iOS', () => {
    expect(debeMostrarBanner({ ...OK, esAndroid: false })).toBe(false);
  });

  it('ya corre como app instalada (standalone) → NO se muestra nunca más', () => {
    expect(debeMostrarBanner({ ...OK, standalone: true })).toBe(false);
  });

  it('«Ahora no» en esta visita → NO se muestra el resto de la visita', () => {
    expect(debeMostrarBanner({ ...OK, descartado: true })).toBe(false);
  });

  it('standalone + descartado a la vez → NO se muestra (todas las condiciones cuentan)', () => {
    expect(debeMostrarBanner({ ...OK, standalone: true, descartado: true })).toBe(false);
  });
});

describe('5.139 · captura temprana del evento (segura sin window)', () => {
  it('KEY_SESION_DESCARTADO es estable (no rompe el flag guardado en las visitas)', () => {
    expect(KEY_SESION_DESCARTADO).toBe('spot24-instalar-descartado');
  });

  it('en node (sin window) capturar es no-op y no lanza', () => {
    expect(() => capturarEventoInstalacion()).not.toThrow();
    expect(obtenerEventoInstalacion()).toBeNull();
    expect(() => gastarEventoInstalacion()).not.toThrow();
  });

  it('idempotente: llamarla dos veces no duplica oyentes ni rompe', () => {
    capturarEventoInstalacion();
    capturarEventoInstalacion();
    expect(obtenerEventoInstalacion()).toBeNull();
  });
});