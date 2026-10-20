/**
 * SPOT 24 · Tests del respaldo visual de fotos (5.87f).
 * El handler alFallarFoto solo toca el objeto del evento (currentTarget
 * con src y dataset): se prueba en node con un doble mínimo, igual que
 * correría sobre el <img> real que entrega React en onError.
 */
import { describe, expect, it } from 'vitest';
import { alFallarFoto, FOTO_RESPALDO } from '../shared/lib/imgFallback';

type ImgDoble = { dataset: Record<string, string>; src: string };

function imgCon(src: string): { currentTarget: ImgDoble } {
  return { currentTarget: { dataset: {}, src } };
}

describe('alFallarFoto (respaldo de fotos de producto)', () => {
  it('cambia el src al placeholder la PRIMERA vez que la foto falla', () => {
    const e = imgCon('/img/products/7feTaW8YRdjJrOpyjHk7.svg');
    alFallarFoto(e as unknown as { currentTarget: HTMLImageElement });
    expect(e.currentTarget.src).toBe(FOTO_RESPALDO);
    expect(e.currentTarget.dataset['fallo']).toBe('1');
  });

  it('NO vuelve a cambiar el src si el propio placeholder falla (sin bucle)', () => {
    const e = imgCon('/img/products/7feTaW8YRdjJrOpyjHk7.svg');
    alFallarFoto(e as unknown as { currentTarget: HTMLImageElement });
    const trasPrimera = e.currentTarget.src;
    alFallarFoto(e as unknown as { currentTarget: HTMLImageElement });
    alFallarFoto(e as unknown as { currentTarget: HTMLImageElement });
    expect(e.currentTarget.src).toBe(trasPrimera);
    expect(e.currentTarget.src).toBe(FOTO_RESPALDO);
  });

  it('trata cada <img> por separado: una marcada no contamina a otra', () => {
    const a = imgCon('/img/products/1.svg');
    const b = imgCon('/img/products/2.svg');
    alFallarFoto(a as unknown as { currentTarget: HTMLImageElement });
    expect(b.currentTarget.src).toBe('/img/products/2.svg');
    expect(b.currentTarget.dataset['fallo']).toBeUndefined();
    alFallarFoto(b as unknown as { currentTarget: HTMLImageElement });
    expect(b.currentTarget.src).toBe(FOTO_RESPALDO);
  });
});
