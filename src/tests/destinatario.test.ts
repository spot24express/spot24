/**
 * SPOT 24 · Ronda 5.135 — ENVIAR A OTRA PERSONA (backend de órdenes).
 *
 * Fija, sin Firestore de mentira (todo aquí es PURO), el contrato nuevo del
 * backend: · pickup + tercero se RECHAZA (el retiro se entrega en mostrador),
 * · undefined → null (compras normales y órdenes viejas: nada cambia),
 * · nombre + teléfono saneados con la MISMA regla de contact.phone,
 * · el preview del despacho abre con «Para: {nombre} · {ciudad} · …»,
 * · el aviso interno del personal lleva «Para: {nombre}.» — y SOLO ese aviso
 *   cambia: al destinatario jamás se le notifica (decisión del dueño).
 *
 * La dirección y el GPS del destinatario viajan en `address` (estructura de
 * siempre): por eso NO hay test de computeTotals aquí — la tarifa de la zona
 * del destinatario sale del mismo camino que ya cubren orders-core y
 * pickup-flow; el candado extra (tercero sin GPS) sí está cubierto en el
 * validador documentado en orders.ts (validateCreateOrderReq).
 */
import { describe, expect, it } from 'vitest';
import {
  ENTREGA_TERCERO_VACIO,
  construirEntregaTercero,
  parsearUbicacionTexto,
  validarEntregaTercero,
} from '@/features/checkout/lib/destinatario';

/**
 * Fixture base del formulario COMPLETO y válido (5.135 original). Vive a
 * nivel de módulo porque lo usan DOS describes: el de validarEntregaTercero
 * y el de 5.135-B (sinUbicacion).
 */
const LLENO = {
  nombre: 'Rosa Pérez',
  telefono: '04241234567',
  zoneId: 'zona_villa',
  details: 'Casa amarilla, portón verde, cerca del kiosco',
  gps: { lat: 10.2546, lng: -67.5912 },
  sinUbicacion: false,
};

describe('5.135 · parsearUbicacionTexto (enlace/coordenadas del destinatario)', () => {
  it('lee el enlace ?q=lat,lng que comparte WhatsApp', () => {
    expect(parsearUbicacionTexto('https://maps.google.com/?q=10.2546,-67.5912')).toEqual({
      lat: 10.2546,
      lng: -67.5912,
    });
    // Variante con & adicional (por ejemplo en un reenvío con texto de app).
    expect(
      parsearUbicacionTexto('https://www.google.com/maps?z=17&q=10.2546,-67.5912&hl=es'),
    ).toEqual({ lat: 10.2546, lng: -67.5912 });
  });

  it('lee el enlace /@lat,lng,zoom de «copiar» en Google Maps', () => {
    expect(
      parsearUbicacionTexto('https://www.google.com/maps/@10.2546,-67.5912,17z'),
    ).toEqual({ lat: 10.2546, lng: -67.5912 });
  });

  it('lee el enlace de lugar !3dlat!4dlng (lat y lng en ese orden)', () => {
    expect(
      parsearUbicacionTexto(
        'https://www.google.com/maps/place/SPOT24/@10.26,-67.59,17z/data=!3d10.25461!4d-67.59123',
      ),
    ).toEqual({ lat: 10.25461, lng: -67.59123 });
  });

  it('lee el enlace geo: de Android y las coordenadas peladas', () => {
    expect(parsearUbicacionTexto('geo:10.2546,-67.5912')).toEqual({ lat: 10.2546, lng: -67.5912 });
    expect(parsearUbicacionTexto('10.2546, -67.5912')).toEqual({ lat: 10.2546, lng: -67.5912 });
    expect(parsearUbicacionTexto('-67.5912,10.2546')).toEqual({ lat: -67.5912, lng: 10.2546 });
  });

  it('redondea a 6 decimales, igual que el GPS capturado', () => {
    expect(parsearUbicacionTexto('10.2546123456,-67.5912123456')).toEqual({
      lat: 10.254612,
      lng: -67.591212,
    });
  });

  it('rechaza enlaces cortos, textos y vacíos (no traen coordenadas)', () => {
    expect(parsearUbicacionTexto('https://maps.app.goo.gl/9xAbC12345')).toBeNull();
    expect(parsearUbicacionTexto('casa amarilla frente al parque')).toBeNull();
    expect(parsearUbicacionTexto('https://wa.me/584241234567')).toBeNull();
    expect(parsearUbicacionTexto('')).toBeNull();
    expect(parsearUbicacionTexto('   ')).toBeNull();
  });

  it('rechaza coordenadas imposibles (0,0 · fuera de rango · sin separación)', () => {
    expect(parsearUbicacionTexto('0,0')).toBeNull();
    expect(parsearUbicacionTexto('999,5')).toBeNull();
    expect(parsearUbicacionTexto('10.2546, 999')).toBeNull();
    expect(parsearUbicacionTexto('lat 10 lng -67')).toBeNull();
  });
});

describe('5.135 · validarEntregaTercero (datos de quien recibe)', () => {
  it('formulario recién activado: los 5 errores, cada uno con su campo', () => {
    const e = validarEntregaTercero(ENTREGA_TERCERO_VACIO);
    expect(Object.keys(e).sort()).toEqual([
      'terceroDetails',
      'terceroGps',
      'terceroNombre',
      'terceroTelefono',
      'terceroZoneId',
    ]);
  });

  it('formulario completo: válido', () => {
    expect(validarEntregaTercero(LLENO)).toEqual({});
  });

  it('nombre EXIGE nombre y apellido (igual que el pagador)', () => {
    const e = validarEntregaTercero({ ...LLENO, nombre: 'Rosa' });
    expect(e['terceroNombre']).toBeTruthy();
    const ok = validarEntregaTercero({ ...LLENO, nombre: 'Rosa María Pérez' });
    expect(ok['terceroNombre']).toBeUndefined();
  });

  it('teléfono: mismos prefijos móviles que el comprador', () => {
    expect(validarEntregaTercero({ ...LLENO, telefono: '02125551234' })['terceroTelefono']).toBeTruthy();
    expect(validarEntregaTercero({ ...LLENO, telefono: '04121234567' })['terceroTelefono']).toBeUndefined();
  });

  it('dirección muy corta y GPS faltante no pasan (el mensajero llega EXACTO)', () => {
    expect(validarEntregaTercero({ ...LLENO, details: 'casa 5' })['terceroDetails']).toBeTruthy();
    expect(
      validarEntregaTercero({ ...LLENO, gps: null })['terceroGps'],
    ).toBe('Falta el punto exacto: GPS o enlace de Google Maps de quien recibe.');
  });
});

describe('5.135 · construirEntregaTercero (payload del backend)', () => {
  it('viaja SOLO nombre y teléfono (saneados); la dirección va en address', () => {
    const p = construirEntregaTercero({
      nombre: '  Rosa Pérez  ',
      telefono: '+58 424-123 4567',
      zoneId: 'zona_villa',
      details: 'Casa amarilla, portón verde',
      gps: { lat: 10.2546, lng: -67.5912 },
      sinUbicacion: false,
    });
    expect(p).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
    expect(Object.keys(p).sort()).toEqual(['nombre', 'telefono']);
  });

  it('acepta formatos internacionales: todo normaliza a 11 dígitos locales', () => {
    expect(construirEntregaTercero({ ...ENTREGA_TERCERO_VACIO, nombre: 'Ana Díaz', telefono: '584161234567' }).telefono).toBe('04161234567');
  });
});

describe('5.135-B · sinUbicacion (GPS opcional del destinatario)', () => {
  const SIN_GPS = { ...LLENO, gps: null, sinUbicacion: true };

  it('checkbox marcado + dirección completa: válido SIN punto exacto', () => {
    expect(validarEntregaTercero(SIN_GPS)).toEqual({});
  });

  it('checkbox marcado exige dirección de 8+ caracteres (única referencia del mensajero)', () => {
    const e = validarEntregaTercero({ ...SIN_GPS, details: 'casa 5' });
    expect(e['terceroDetails']).toBe(
      'Sin GPS, la dirección escrita es obligatoria: urbanización, calle, casa/apto y punto de referencia.',
    );
    // Con la marca el GPS NO se exige: ese error jamás aparece aquí.
    expect(e['terceroGps']).toBeUndefined();
  });

  it('checkbox SIN marcar sigue exigiendo el punto exacto (5.135 intacto)', () => {
    expect(validarEntregaTercero({ ...LLENO, gps: null })['terceroGps']).toBe(
      'Falta el punto exacto: GPS o enlace de Google Maps de quien recibe.',
    );
  });

  it('construir: sinUbicacion viaja SOLO con el checkbox marcado (contrato limpio)', () => {
    const conMarca = construirEntregaTercero({
      nombre: 'Rosa Pérez',
      telefono: '04241234567',
      zoneId: 'zona_villa',
      details: 'Casa amarilla, portón verde, cerca del kiosco',
      gps: null,
      sinUbicacion: true,
    });
    expect(conMarca).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: true });
    expect(Object.keys(conMarca).sort()).toEqual(['nombre', 'sinUbicacion', 'telefono']);

    const sinMarca = construirEntregaTercero({ ...LLENO, nombre: 'Rosa Pérez', telefono: '04241234567' });
    expect(sinMarca).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
    expect(Object.keys(sinMarca).sort()).toEqual(['nombre', 'telefono']);
  });
});