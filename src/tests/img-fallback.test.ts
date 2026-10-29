/**
 * SPOT 24 · Tests del respaldo visual de fotos (5.87f productos · 5.112-C
 * promos y bahías).
 * Los handlers solo tocan el objeto del evento (currentTarget con src y
 * dataset): se prueban en node con un doble mínimo, igual que correrían
 * sobre el <img> real que entrega React en onError.
 */
import { describe, expect, it } from 'vitest';
import { alFallarFoto, alFallarFotoCon, FOTO_LOCAL, FOTO_RESPALDO } from '../shared/lib/imgFallback';

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

describe('alFallarFotoCon (5.112-C · respaldo de promos y bahías con FOTO_LOCAL)', () => {
  it('usa el respaldo ENTREGADO (foto del local con el escudo), no el de producto', () => {
    const e = imgCon('https://i.ibb.co/promo-caducada.jpg');
    alFallarFotoCon(FOTO_LOCAL)(e as unknown as { currentTarget: HTMLImageElement });
    expect(e.currentTarget.src).toBe(FOTO_LOCAL);
    expect(e.currentTarget.dataset['fallo']).toBe('1');
  });

  it('NO vuelve a cambiar el src si el propio respaldo falla (sin bucle)', () => {
    const e = imgCon('https://i.ibb.co/promo-caducada.jpg');
    const handler = alFallarFotoCon(FOTO_LOCAL);
    handler(e as unknown as { currentTarget: HTMLImageElement });
    const trasPrimera = e.currentTarget.src;
    handler(e as unknown as { currentTarget: HTMLImageElement });
    handler(e as unknown as { currentTarget: HTMLImageElement });
    expect(e.currentTarget.src).toBe(trasPrimera);
    expect(e.currentTarget.src).toBe(FOTO_LOCAL);
  });

  it('dos fábricas con respaldos distintos no se contaminan entre sí', () => {
    const promo = imgCon('https://i.ibb.co/promo.jpg');
    const bahia = imgCon('https://i.ibb.co/bahia.jpg');
    alFallarFotoCon(FOTO_LOCAL)(promo as unknown as { currentTarget: HTMLImageElement });
    alFallarFotoCon(FOTO_RESPALDO)(bahia as unknown as { currentTarget: HTMLImageElement });
    expect(promo.currentTarget.src).toBe(FOTO_LOCAL);
    expect(bahia.currentTarget.src).toBe(FOTO_RESPALDO);
  });
});
