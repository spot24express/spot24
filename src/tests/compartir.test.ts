import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compartirEnlace,
  puedeCompartir,
  puedeCompartirArchivos,
  IMAGEN_COMPARTIR_APP,
} from '@/shared/lib/compartir';

/**
 * Ronda 5.108 — compartir app/producto (panel nativo o portapapeles).
 * Ronda 5.126 — compartir CON FOTO (Web Share Level 2): la app adjunta la
 * fachada de la tienda y los productos su propia foto. Sin soporte de
 * archivos, con la foto caída o rechazada, todo cae al comportamiento de
 * la 5.108 (solo texto). copyText se mockea: aquí se prueba la DECISIÓN,
 * no el portapapeles.
 */
vi.mock('@/shared/lib/clipboard', () => ({ copyText: vi.fn() }));

import { copyText } from '@/shared/lib/clipboard';
const copyTextMock = vi.mocked(copyText);

const DATOS = {
  title: 'Freno de balata',
  text: 'Mira este artículo en SPOT 24: Freno de balata',
  url: 'https://spot24express.netlify.app/catalogo/freno-de-balata',
  tipo: 'producto' as const,
  itemId: 'p1',
};

const APP = {
  title: 'SPOT 24',
  text: 'SPOT 24 — Tu parada segura. 24/7.',
  url: 'https://spot24express.netlify.app/',
  tipo: 'app' as const,
};

/** Sustituye navigator entero: con panel nativo (impl) o sin él (undefined). */
function stubShare(
  impl?: (d: ShareData) => Promise<void>,
  canShare?: (d: ShareData) => boolean,
): void {
  vi.stubGlobal(
    'navigator',
    impl ? { share: impl, ...(canShare ? { canShare } : {}) } : {},
  );
}

/** Respuesta HTTP con una imagen (el tipo MIME es lo que la librería mira). */
function respuestaImagen(tipo = 'image/jpeg'): Response {
  return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: tipo }), {
    status: 200,
  });
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

describe('puedeCompartirArchivos: ¿el panel acepta fotos? (ronda 5.126)', () => {
  it('true con canShare que acepta el archivo de prueba', () => {
    stubShare(async () => {}, () => true);
    expect(puedeCompartirArchivos()).toBe(true);
  });

  it('false sin canShare (navegador con panel pero sin Level 2)', () => {
    stubShare(async () => {});
    expect(puedeCompartirArchivos()).toBe(false);
  });

  it('false sin panel nativo', () => {
    stubShare();
    expect(puedeCompartirArchivos()).toBe(false);
  });

  it('false cuando canShare rechaza el archivo dado (ej. un SVG)', () => {
    stubShare(async () => {}, () => false);
    const svg = new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' });
    expect(puedeCompartirArchivos(svg)).toBe(false);
  });
});

describe('compartirEnlace: elige panel nativo o portapapeles', () => {
  it('con panel nativo que resuelve: comparte y NO copia al portapapeles', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share);
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('compartido');
    expect(share).toHaveBeenCalledTimes(1);
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('el usuario cierra el panel (AbortError): cancelado y sin copiar nada', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {
      throw new DOMException('el usuario cerró el panel', 'AbortError');
    });
    stubShare(share);
    const r = await compartirEnlace(DATOS);
    expect(r).toBe('cancelado');
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('el panel falla a mitad: respaldo copiando el enlace', async () => {
    copyTextMock.mockResolvedValue(true);
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {
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

describe('compartirEnlace con foto (ronda 5.126)', () => {
  it('la APP lleva la fachada por defecto: comparte con files y NO copia', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share, () => true);
    const fetchMock = vi.fn(async () => respuestaImagen());
    vi.stubGlobal('fetch', fetchMock);

    const r = await compartirEnlace(APP);

    expect(fetchMock).toHaveBeenCalledWith(IMAGEN_COMPARTIR_APP);
    expect(share).toHaveBeenCalledTimes(1);
    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toHaveLength(1);
    expect(llamada?.files?.[0]?.name).toBe('spot24.jpg');
    expect(llamada?.files?.[0]?.type).toBe('image/jpeg');
    expect(llamada?.text).toBe(APP.text);
    expect(llamada?.url).toBe(APP.url);
    expect(r).toBe('compartido_con_foto');
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('producto con imagen explícita: adjunta ESA foto, no la fachada', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share, () => true);
    const fetchMock = vi.fn(async () => respuestaImagen());
    vi.stubGlobal('fetch', fetchMock);

    const r = await compartirEnlace({ ...DATOS, imagen: 'https://i.ibb.co/foto.jpg' });

    expect(fetchMock).toHaveBeenCalledWith('https://i.ibb.co/foto.jpg');
    expect(fetchMock).not.toHaveBeenCalledWith(IMAGEN_COMPARTIR_APP);
    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toHaveLength(1);
    expect(r).toBe('compartido_con_foto');
  });

  it('foto pasada como argumento suelto (compatibilidad): también se adjunta', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share, () => true);
    const fetchMock = vi.fn(async () => respuestaImagen());
    vi.stubGlobal('fetch', fetchMock);

    const r = await compartirEnlace(DATOS, 'https://i.ibb.co/foto2.jpg');

    expect(fetchMock).toHaveBeenCalledWith('https://i.ibb.co/foto2.jpg');
    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toHaveLength(1);
    expect(r).toBe('compartido_con_foto');
  });

  it('sin soporte de archivos: ni baja la foto, comparte solo texto', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share); // sin canShare
    const fetchMock = vi.fn(async () => respuestaImagen());
    vi.stubGlobal('fetch', fetchMock);

    const r = await compartirEnlace({ ...DATOS, imagen: 'https://i.ibb.co/foto.jpg' });

    expect(fetchMock).not.toHaveBeenCalled();
    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toBeUndefined();
    expect(r).toBe('compartido');
  });

  it('la foto no se pudo bajar (404): comparte solo texto', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share, () => true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no hay nada', { status: 404 })));

    const r = await compartirEnlace({ ...APP, imagen: '/img/que-no-existe.jpg' });

    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toBeUndefined();
    expect(r).toBe('compartido');
  });

  it('el navegador rechaza la foto bajada (tipo no compartible): solo texto', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    // canShare: true con el archivo de prueba (vacío) y false con el real.
    const canShare = vi.fn((d: ShareData) => (d.files?.[0]?.size ?? 0) === 0);
    stubShare(share, canShare);
    vi.stubGlobal('fetch', vi.fn(async () => respuestaImagen('image/svg+xml')));

    const r = await compartirEnlace(APP);

    expect(canShare).toHaveBeenCalledTimes(2);
    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toBeUndefined();
    expect(r).toBe('compartido');
  });

  it('el panel falla con la foto: reintenta sin foto y comparte', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('share failed'))
      .mockResolvedValueOnce(undefined);
    stubShare(share, () => true);
    vi.stubGlobal('fetch', vi.fn(async () => respuestaImagen()));

    const r = await compartirEnlace(APP);

    expect(share).toHaveBeenCalledTimes(2);
    expect(share.mock.calls[0]?.[0]?.files).toHaveLength(1);
    expect(share.mock.calls[1]?.[0]?.files).toBeUndefined();
    expect(r).toBe('compartido');
  });

  it('cierra el panel con la foto abierta: cancelado, sin copiar ni reintentar', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {
      throw new DOMException('cerró el panel', 'AbortError');
    });
    stubShare(share, () => true);
    vi.stubGlobal('fetch', vi.fn(async () => respuestaImagen()));

    const r = await compartirEnlace(APP);

    expect(share).toHaveBeenCalledTimes(1);
    expect(r).toBe('cancelado');
    expect(copyTextMock).not.toHaveBeenCalled();
  });

  it('la respuesta no es imagen (MIME text/html): solo texto', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {});
    stubShare(share, () => true);
    vi.stubGlobal('fetch', vi.fn(async () => respuestaImagen('text/html')));

    const r = await compartirEnlace(APP);

    const llamada = share.mock.calls[0]?.[0];
    expect(llamada?.files).toBeUndefined();
    expect(r).toBe('compartido');
  });
});
