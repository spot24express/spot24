import { describe, expect, it } from 'vitest';
import {
  debeMostrarAvisoIOS,
  esDispositivoApple,
  esSafariIOS,
  KEY_OCULTO,
  type EntornoIOS,
} from '@/shared/lib/instalar';

/**
 * Ronda 5.110 — aviso de instalación en iPhone/iPad.
 * Android tiene el aviso nativo de Chrome; iOS no lo da (Safari nunca dispara
 * beforeinstallprompt). La decisión vive en instalar.ts, pura e inyectable:
 * aquí se prueba la DECISIÓN con UAs reales, sin navegador.
 */

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneWhatsapp:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 WhatsApp/24.4.82.16',
  ipadClasico:
    'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  // iPadOS 13+ se hace pasar por Mac — pero conserva táctil (>1 punto).
  ipadModerno:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macEscritorio:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; SM-S236L) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
  pcWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
};

const base: EntornoIOS = {
  ua: UA.iphoneSafari,
  maxTouchPoints: 5,
  displayModeStandalone: false,
  navigatorStandalone: false,
  avisoOcultoGuardado: null,
};

describe('esDispositivoApple: quién es capaz de instalar desde iOS', () => {
  it('iPhone con Safari: sí', () => {
    expect(esDispositivoApple(UA.iphoneSafari, 5)).toBe(true);
  });

  it('iPad clásico (UA propio): sí', () => {
    expect(esDispositivoApple(UA.ipadClasico, 5)).toBe(true);
  });

  it('iPad moderno (se hace pasar por Mac, pero es táctil): sí', () => {
    expect(esDispositivoApple(UA.ipadModerno, 5)).toBe(true);
  });

  it('Mac de escritorio sin táctil: no', () => {
    expect(esDispositivoApple(UA.macEscritorio, 0)).toBe(false);
  });

  it('Android: no (ya tiene su aviso nativo de Chrome)', () => {
    expect(esDispositivoApple(UA.androidChrome, 5)).toBe(false);
  });

  it('PC Windows: no', () => {
    expect(esDispositivoApple(UA.pcWindows, 0)).toBe(false);
  });
});

describe('esSafariIOS: el navegador que sí puede instalar', () => {
  it('Safari de iOS: sí', () => {
    expect(esSafariIOS(UA.iphoneSafari)).toBe(true);
  });

  it('Chrome de iOS (CriOS): no — el aviso pedirá abrir en Safari', () => {
    expect(esSafariIOS(UA.iphoneChrome)).toBe(false);
  });

  it('Webview de WhatsApp (sin token Safari): no', () => {
    expect(esSafariIOS(UA.iphoneWhatsapp)).toBe(false);
  });
});

describe('debeMostrarAvisoIOS: las 3 reglas a la vez', () => {
  it('iPhone, app no instalada, aviso nunca cerrado: mostrar', () => {
    expect(debeMostrarAvisoIOS(base)).toBe(true);
  });

  it('ya instalada (display-mode: standalone): no molestar', () => {
    expect(debeMostrarAvisoIOS({ ...base, displayModeStandalone: true })).toBe(false);
  });

  it('ya instalada (navigator.standalone, propietario de iOS): no molestar', () => {
    expect(debeMostrarAvisoIOS({ ...base, navigatorStandalone: true })).toBe(false);
  });

  it('el usuario cerró el aviso antes: respetar y no volver a mostrar', () => {
    expect(debeMostrarAvisoIOS({ ...base, avisoOcultoGuardado: '1' })).toBe(false);
  });

  it('otro valor guardado (no "1") no cuenta como cerrado', () => {
    expect(debeMostrarAvisoIOS({ ...base, avisoOcultoGuardado: '0' })).toBe(true);
  });

  it('Android: jamás (su aviso es el nativo de Chrome)', () => {
    expect(debeMostrarAvisoIOS({ ...base, ua: UA.androidChrome })).toBe(false);
  });

  it('PC de escritorio: jamás', () => {
    expect(debeMostrarAvisoIOS({ ...base, ua: UA.pcWindows, maxTouchPoints: 0 })).toBe(false);
  });

  it('iPad moderno: sí (puede instalar igual que el iPhone)', () => {
    expect(debeMostrarAvisoIOS({ ...base, ua: UA.ipadModerno })).toBe(true);
  });
});

describe('la clave de localStorage', () => {
  it('es estable (si cambiara, quien la cerró vería el aviso de nuevo)', () => {
    expect(KEY_OCULTO).toBe('spot24-instalar-ios-oculto');
  });
});