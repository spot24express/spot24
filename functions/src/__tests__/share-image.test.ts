import { describe, expect, it } from 'vitest';
import { DOMINIOS_PUENTE, esUrlDePuente, MAX_BYTES_PUENTE } from '../shareImage';

describe('esUrlDePuente · ronda 5.133 (puente fn-shareImage)', () => {
  it('acepta una URL normal de i.ibb.co', () => {
    expect(esUrlDePuente('https://i.ibb.co/foto.jpg')).toBe(true);
  });

  it('acepta firebasestorage con token en la query', () => {
    expect(
      esUrlDePuente(
        'https://firebasestorage.googleapis.com/v0/b/spot24.appspot.com/o/productos%2Fa.jpg?alt=media&token=xyz',
      ),
    ).toBe(true);
  });

  it('acepta URLs con caracteres que el cliente luego encodea', () => {
    expect(esUrlDePuente('https://i.ibb.co/ABC123/foto-con-espacios y ñ.jpg')).toBe(true);
  });

  it('rechaza http (solo https)', () => {
    expect(esUrlDePuente('http://i.ibb.co/foto.jpg')).toBe(false);
  });

  it('rechaza puertos no estándar', () => {
    expect(esUrlDePuente('https://i.ibb.co:8443/foto.jpg')).toBe(false);
  });

  it('rechaza un dominio que solo CONTIENE al permitido', () => {
    expect(esUrlDePuente('https://i.ibb.co.evil.com/foto.jpg')).toBe(false);
  });

  it('rechaza el truco de userinfo https://i.ibb.co@evil.com/', () => {
    expect(esUrlDePuente('https://i.ibb.co@evil.com/foto.jpg')).toBe(false);
  });

  it('rechaza dominios de la lista usados como subruta de otro host', () => {
    expect(esUrlDePuente('https://evil.com/i.ibb.co/foto.jpg')).toBe(false);
  });

  it('rechaza URLs relativas (/img/ va directo, sin puente)', () => {
    expect(esUrlDePuente('/img/fachada-spot24.jpg')).toBe(false);
  });

  it('rechaza data: y blob:', () => {
    expect(esUrlDePuente('data:image/jpeg;base64,AAAA')).toBe(false);
    expect(esUrlDePuente('blob:https://spot24.app/uuid')).toBe(false);
  });

  it('rechaza vacío, no-string y excesivamente larga', () => {
    expect(esUrlDePuente('')).toBe(false);
    expect(esUrlDePuente(null)).toBe(false);
    expect(esUrlDePuente(undefined)).toBe(false);
    expect(esUrlDePuente(42)).toBe(false);
    expect(esUrlDePuente('https://i.ibb.co/' + 'a'.repeat(3000))).toBe(false);
  });
});

describe('constantes del puente · ronda 5.133', () => {
  it('MAX_BYTES_PUENTE espeja el máximo del cliente (4 MiB)', () => {
    expect(MAX_BYTES_PUENTE).toBe(4 * 1024 * 1024);
  });

  it('la lista blanca es exactamente los dos dominios de la app', () => {
    expect([...DOMINIOS_PUENTE]).toEqual(['i.ibb.co', 'firebasestorage.googleapis.com']);
  });
});