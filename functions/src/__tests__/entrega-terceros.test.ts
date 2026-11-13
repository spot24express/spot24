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
 *
 * Ronda 5.135-B · GPS OPCIONAL del destinatario: los tests nuevos de
 * parseEntregaTercero fijan el contrato del flag sinUbicacion (solo el
 * booleano true estricto viaja; pickup sigue cerrado aunque traiga la marca)
 * y cuerpoAvisoStaff gana el sufijo «Sin GPS: coordinar por teléfono…».
 * ⚠️ Los 4 tests de parseEntregaTercero 5.135-B quedan ROJOS hasta aplicar
 * el bloque 5.135-B en functions/src/orders.ts (el archivo donde vive
 * parseEntregaTercero y el candado «Sin GPS del destinatario» de
 * validateCreateOrderReq: allí el flag cambia el candado a exigir
 * address.details ≥ 8 y permite address.location null).
 */
import { describe, expect, it } from 'vitest';
import { HttpsError } from 'firebase-functions/v2/https';
import { parseEntregaTercero, previewTercero } from '../orders';
import { cuerpoAvisoStaff } from '../lib/notifications';

describe('5.135 · parseEntregaTercero (bloque «enviar a otra persona»)', () => {
  it('sin bloque (compras normales) → null: NADA cambia para órdenes viejas', () => {
    expect(parseEntregaTercero(undefined, 'delivery')).toBeNull();
    expect(parseEntregaTercero(null, 'delivery')).toBeNull();
    expect(parseEntregaTercero(undefined, 'pickup')).toBeNull();
  });

  it('pickup + tercero se RECHAZA: el retiro en tienda no reparte', () => {
    const raw = { nombre: 'Rosa Pérez', telefono: '04241234567' };
    try {
      parseEntregaTercero(raw, 'pickup');
      expect.unreachable('debió lanzar HttpsError');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
      expect((e as HttpsError).code).toBe('invalid-argument');
      expect((e as HttpsError).message).toContain('solo aplica a domicilio');
    }
  });

  it('delivery + datos completos → nombre y teléfono saneados', () => {
    expect(
      parseEntregaTercero({ nombre: '  Rosa Pérez  ', telefono: '0424-123 4567' }, 'delivery'),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
    // Formato internacional del destinatario también se acepta (11 dígitos).
    expect(
      parseEntregaTercero({ nombre: 'Ana Díaz', telefono: '584161234567' }, 'delivery'),
    ).toEqual({ nombre: 'Ana Díaz', telefono: '58416123456' });
    // El backend exige ≥2 caracteres (misma regla de contact.name): la regla
    // de DOS palabras («Nombre Apellido») la aplica el checkout, más estricto.
    expect(parseEntregaTercero({ nombre: 'Rosa', telefono: '04241234567' }, 'delivery')).toEqual({
      nombre: 'Rosa',
      telefono: '04241234567',
    });
  });

  it('nombre o teléfono insuficientes → 400 accionable', () => {
    for (const raw of [
      { nombre: 'R', telefono: '04241234567' },
      { nombre: '', telefono: '04241234567' },
      { nombre: 'Rosa Pérez', telefono: '0424123456' },
      { nombre: 'Rosa Pérez' },
      {},
    ]) {
      try {
        parseEntregaTercero(raw, 'delivery');
        expect.unreachable(`debió lanzar con ${JSON.stringify(raw)}`);
      } catch (e) {
        expect(e).toBeInstanceOf(HttpsError);
        expect((e as HttpsError).code).toBe('invalid-argument');
        expect((e as HttpsError).message).toContain('quien recibe');
      }
    }
  });

  it('bloque con otro tipo de dato raro → 400 (nunca 500)', () => {
    try {
      parseEntregaTercero('hola', 'delivery');
      expect.unreachable('debió lanzar HttpsError');
    } catch (e) {
      expect((e as HttpsError).code).toBe('invalid-argument');
    }
  });
});

describe('5.135 · previewTercero (addressPreview «Para: …» en el panel)', () => {
  it('formato: Para: {nombre} · {ciudad} · {detalles}', () => {
    expect(previewTercero('Rosa Pérez', 'Maracay', 'Casa amarilla, portón verde')).toBe(
      'Para: Rosa Pérez · Maracay · Casa amarilla, portón verde…',
    );
  });

  it('direcciones largas se acotan a 40 caracteres (preview, no biografía)', () => {
    const largo = 'Urbanización Los Cerros, calle 5, casa 12, segundo piso, puertas azules';
    const p = previewTercero('Rosa Pérez', 'Maracay', largo);
    expect(p.startsWith('Para: Rosa Pérez · Maracay · ')).toBe(true);
    const detalles = p.split(' · ')[2];
    expect(detalles!.replace(/…$/, '').length).toBeLessThanOrEqual(41);
    expect(p.endsWith('…')).toBe(true);
  });
});

describe('5.135 · cuerpoAvisoStaff (aviso interno del cajero, el ÚNICO que cambia)', () => {
  it('sin destinatario el aviso queda EXACTO al de siempre', () => {
    expect(cuerpoAvisoStaff('SP-261109-0001. Revísalo en el panel de pagos.')).toBe(
      'SP-261109-0001. Revísalo en el panel de pagos.',
    );
    expect(cuerpoAvisoStaff('SP-261109-0001. Pago confirmado por el banco: prepáralo.', undefined)).toBe(
      'SP-261109-0001. Pago confirmado por el banco: prepáralo.',
    );
    expect(cuerpoAvisoStaff('texto.', '   ')).toBe('texto.');
  });

  it('con destinatario añade « Para: {nombre}.» al final', () => {
    expect(cuerpoAvisoStaff('SP-261109-0001. Revísalo en el panel de pagos.', 'Rosa Pérez')).toBe(
      'SP-261109-0001. Revísalo en el panel de pagos. Para: Rosa Pérez.',
    );
  });

  it('nombre larguísimo se acota a 40 caracteres (cortina limpia)', () => {
    const cuerpo = cuerpoAvisoStaff('texto.', 'N'.repeat(60));
    expect(cuerpo).toBe(`texto. Para: ${'N'.repeat(40)}.`);
  });
});

describe('5.135-B · parseEntregaTercero: sinUbicacion (GPS opcional del destinatario)', () => {
  it('checkbox marcado → sinUbicacion: true viaja en el bloque saneado', () => {
    expect(
      parseEntregaTercero({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: true }, 'delivery'),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: true });
  });

  it('sin checkbox: el bloque queda EXACTO al de 5.135 (sin la llave nueva)', () => {
    expect(
      parseEntregaTercero({ nombre: 'Rosa Pérez', telefono: '04241234567' }, 'delivery'),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
  });

  it('solo el booleano true estricto pasa: cualquier otra basura se descarta', () => {
    expect(
      parseEntregaTercero({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: 'sí' }, 'delivery'),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
    expect(
      parseEntregaTercero({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: 1 }, 'delivery'),
    ).toEqual({ nombre: 'Rosa Pérez', telefono: '04241234567' });
  });

  it('pickup + tercero sigue RECHAZÁNDOSE aunque traiga sinUbicacion', () => {
    try {
      parseEntregaTercero({ nombre: 'Rosa Pérez', telefono: '04241234567', sinUbicacion: true }, 'pickup');
      expect.unreachable('debió lanzar HttpsError');
    } catch (e) {
      expect(e).toBeInstanceOf(HttpsError);
      expect((e as HttpsError).code).toBe('invalid-argument');
      expect((e as HttpsError).message).toContain('solo aplica a domicilio');
    }
  });
});

describe('5.135-B · cuerpoAvisoStaff: sufijo «Sin GPS» (aviso interno del cajero)', () => {
  it('con la marca añade « Sin GPS: coordinar por teléfono con el destinatario.»', () => {
    expect(
      cuerpoAvisoStaff('SP-261109-0001. Pago confirmado por el banco: prepáralo.', 'Rosa Pérez', true),
    ).toBe(
      'SP-261109-0001. Pago confirmado por el banco: prepáralo. Para: Rosa Pérez. Sin GPS: coordinar por teléfono con el destinatario.',
    );
  });

  it('sin la marca queda EXACTO al de 5.135, con o sin destinatario (regresión)', () => {
    expect(
      cuerpoAvisoStaff('SP-261109-0001. Revísalo en el panel de pagos.', 'Rosa Pérez', false),
    ).toBe('SP-261109-0001. Revísalo en el panel de pagos. Para: Rosa Pérez.');
    expect(cuerpoAvisoStaff('texto.', undefined, true)).toBe(
      'texto. Sin GPS: coordinar por teléfono con el destinatario.',
    );
  });
});
