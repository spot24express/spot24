/**
 * Tests de WhatsApp de dos líneas (5.132).
 *
 * Garantías clave:
 * · waHref normaliza cualquier formato local/internacional de Venezuela a
 *   wa.me/58XXXXXXXXXX — el MISMO enlace de producción (la apertura de
 *   siempre del botón único, sin pantallas blancas nuevas ni efectos raros).
 * · Números inutilizables → null (la línea simplemente no aparece).
 * · lineasWhatsapp arma las líneas en orden fijo (Atención primero), oculta
 *   las que estén vacías o mal formadas, y cada línea lleva SU mensaje
 *   prellenado. Con una sola línea el globo abre directo (igual que hoy);
 *   con dos, el panel muestra ambas.
 */
import { describe, expect, it } from 'vitest';
import { MENSAJES_WHATSAPP, lineasWhatsapp, waHref } from '@/shared/lib/whatsapp';

const MSG_DEFECTO = 'Hola SPOT 24, tengo una consulta sobre mi pedido.';

describe('waHref — normalización a wa.me (enlace de producción)', () => {
  it('0424… gana el 58 de Venezuela', () => {
    expect(waHref('04241234567')).toBe(
      `https://wa.me/584241234567?text=${encodeURIComponent(MSG_DEFECTO)}`,
    );
  });

  it('424… (sin 0 inicial) también es venezolano', () => {
    expect(waHref('4241234567')).toBe(
      `https://wa.me/584241234567?text=${encodeURIComponent(MSG_DEFECTO)}`,
    );
  });

  it('acepta +58 con espacios y guiones', () => {
    expect(waHref('+58 424-1234567')).toBe(
      `https://wa.me/584241234567?text=${encodeURIComponent(MSG_DEFECTO)}`,
    );
  });

  it('58424… y 0058424… ya internacionales, sin doble prefijo', () => {
    const esperado = `https://wa.me/584241234567?text=${encodeURIComponent(MSG_DEFECTO)}`;
    expect(waHref('584241234567')).toBe(esperado);
    expect(waHref('00584241234567')).toBe(esperado);
  });

  it('número corto o ausente → null (línea oculta)', () => {
    expect(waHref('042412345')).toBeNull();
    expect(waHref('123')).toBeNull();
    expect(waHref('')).toBeNull();
    expect(waHref(null)).toBeNull();
    expect(waHref(undefined)).toBeNull();
  });

  it('longitudes imposibles → null (12 sin 58, 13 con 58)', () => {
    expect(waHref('999424123456')).toBeNull();
    expect(waHref('5842412345671')).toBeNull();
  });

  it('el mensaje viaja codificado (sin espacios crudos en el href)', () => {
    const mensaje = 'Hola, quiero un repuesto ñandú 50/50';
    const href = waHref('04241234567', mensaje);
    expect(href).not.toContain(' ');
    expect(href).toBe(`https://wa.me/584241234567?text=${encodeURIComponent(mensaje)}`);
  });
});

describe('lineasWhatsapp — dos líneas configurables', () => {
  it('con los dos números: Atención primero, Ventas después', () => {
    const [atencion, ventas] = lineasWhatsapp({
      whatsappAtencion: '04241234567',
      whatsappVentas: '04147654321',
    });
    expect(atencion?.rol).toBe('atencion');
    expect(ventas?.rol).toBe('ventas');
  });

  it('nombres y etiquetas correctos por rol', () => {
    const lineas = lineasWhatsapp({
      whatsappAtencion: '04241234567',
      whatsappVentas: '04147654321',
    });
    expect(lineas.map((l) => `${l.rol}:${l.nombre}:${l.etiqueta}`)).toEqual([
      'atencion:Soporte Atención al Cliente:Atención',
      'ventas:Soporte de Ventas:Ventas',
    ]);
  });

  it('solo Atención llena → UNA línea (globo directo, como producción)', () => {
    const lineas = lineasWhatsapp({ whatsappAtencion: '04241234567' });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.rol).toBe('atencion');
    expect(lineas[0]?.nombre).toBe('Soporte Atención al Cliente');
  });

  it('solo Ventas llena → UNA línea de ventas', () => {
    const lineas = lineasWhatsapp({ whatsappVentas: '04147654321' });
    expect(lineas).toHaveLength(1);
    expect(lineas[0]?.rol).toBe('ventas');
    expect(lineas[0]?.nombre).toBe('Soporte de Ventas');
  });

  it('sin números (o ajustes ausentes) → cero líneas, sin globo', () => {
    expect(lineasWhatsapp({})).toEqual([]);
    expect(lineasWhatsapp({ whatsappAtencion: '', whatsappVentas: '' })).toEqual([]);
    expect(lineasWhatsapp(null)).toEqual([]);
    expect(lineasWhatsapp(undefined)).toEqual([]);
  });

  it('números inválidos no ensucian las líneas', () => {
    expect(
      lineasWhatsapp({ whatsappAtencion: '123', whatsappVentas: '04147654321' }),
    ).toHaveLength(1);
    expect(lineasWhatsapp({ whatsappAtencion: 'abc', whatsappVentas: 'x' })).toEqual([]);
  });

  it('cada línea abre wa.me con SU número y SU mensaje', () => {
    const [atencion, ventas] = lineasWhatsapp({
      whatsappAtencion: '04241234567',
      whatsappVentas: '04147654321',
    });
    expect(atencion?.href).toBe(
      `https://wa.me/584241234567?text=${encodeURIComponent(MENSAJES_WHATSAPP.atencion)}`,
    );
    expect(ventas?.href).toBe(
      `https://wa.me/584147654321?text=${encodeURIComponent(MENSAJES_WHATSAPP.ventas)}`,
    );
    expect(atencion?.href).not.toBe(ventas?.href);
  });

  it('los mensajes prellenados son los de la constante compartida', () => {
    expect(MENSAJES_WHATSAPP.atencion).toContain('ayuda con mi pedido');
    expect(MENSAJES_WHATSAPP.ventas).toContain('información de un producto');
  });
});
