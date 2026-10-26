import { afterEach, describe, expect, it, vi } from 'vitest';
import { compartirEnlace, puedeCompartir } from '@/shared/lib/compartir';

/**
 * Ronda 5.108 — compartir app/producto.
 * El panel nativo (Web Share API) solo existe en móviles modernos; en PC y
 * navegadores viejos el respaldo es copiar el enlace (copyText, ronda 5.75).
 * copyText se mockea: aquí se prueba la DECISIÓN, no el portapapeles.
 */
vi.mock('@/shared/lib/clipboard', () => ({ copyText: vi.fn() }));

import { copyText } from '@/shared/lib/clipboard';
const copyTextMock = vi.mocked(copyText);

const DATOS = {
  title: 'Freno de balata',
  text: 'Mira esta pieza en SPOT 24: Freno de balata',
  url: 'https://spot24express.netlify.app/catalogo/freno-de-balata',
  tipo: 'producto' as const,
  itemId: 'p1',
};

/** Sustituye navigator entero: con panel nativo (impl) o sin él (undefined). */
function stubShare(impl?: (d: unknown) => Promise<void>): void {
  vi.stubGlobal('navigator', impl ? { share: impl } : {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('puedeCompartir: ¿hay panel nativo?', () => {
  it('true con Web Share API (móvil moderno)', () => {
    stubShare(async () => {});
    expect(puedeCompartir()).toBe(true);
  });

  it('false sin Web Share API (PC y navegadores viejos)', () => {
    stubShare();
    expect(puedeCompartir()).toBe(false);
  });
});

describe('compartirEnlace: elige panel nativo o portapapeles', () => {
  it('con panel nativo que resuelve: comparte y NO copia al portapapeles', async () => {
    const share = vi.fn(async () => {});
    stubShare(share);
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('compartido');
    expect(share).toHaveBeenCalledTimes(1);
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('el usuario cierra el panel (AbortError): cancelado y sin copiar nada', async () => {
    const share = vi.fn(async () => {
      throw new DOMException('el usuario cerró el panel', 'AbortError');
    });
    stubShare(share);
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('cancelado');
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('el panel falla a mitad: respaldo copiando el enlace', async () => {
    copyTextMock.mockResolvedValue(true);
    const share = vi.fn(async () => {
      throw new TypeError('share failed');
    });
    stubShare(share);
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('copiado');
    expect(copyTextMock).toHaveBeenCalledWith(`${DATOS.text} ${DATOS.url}`);
  });

  it('sin panel nativo (PC): copia el enlace una sola vez', async () => {
    copyTextMock.mockResolvedValue(true);
    stubShare();
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('copiado');
    expect(copyTextMock).toHaveBeenCalledTimes(1);
  });

  it('ni panel ni portapapeles: fallo (la UI avisa con toast de error)', async () => {
    copyTextMock.mockResolvedValue(false);
    stubShare();
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('fallo');
  });
});