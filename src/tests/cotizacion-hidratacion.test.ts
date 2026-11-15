/**
 * 5.144 · Tests del gate de cotización/reserva contra la RECARGA.
 *
 * LA PISTA DEL DUEÑO: «esto de que no calcula los montos sucede si recargo,
 * ya sea en teléfono o en la PC».
 *
 * Mecánica del fallo que motiva la ronda: al recargar, el carrito NO está en
 * memoria — el store arranca items: [] y el carrito real llega ASÍNCRONO
 * (observeAuth → hydrateForUser: localStorage o Firestore). El efecto de
 * cotización tenía `if (isEmpty) return;` con `isEmpty` FUERA de sus
 * dependencias: si el vuelo a RETIRO (5.112-B, fuera de la franja del
 * delivery) re-corriera el efecto mientras el carrito aún se hidrata, el
 * guard mataba esa corrida — la ÚNICA re-corrida posible sin acción del
 * cliente — y el checkout quedaba en «Calculando montos exactos…» para
 * siempre, con «Esperando los montos exactos para seguir» en el paso Pago y
 * el Pago Móvil automático apagado (exige cotización lista).
 *
 * Contrato nuevo (debeCotizar / debeReservar en shared/lib/cotizacion.ts):
 * mientras el carrito no esté hidratado los efectos NO corren, y el momento
 * de la hidratación RE-DISPARA la corrida con el carrito real. Ambos órdenes
 * de llegada de la carrera (settings primero o carrito primero) terminan en
 * cotización.
 */
import { describe, expect, it } from 'vitest';
import { debeCotizar, debeReservar } from '@/shared/lib/cotizacion';

describe('debeCotizar · la recarga del dueño (fuera de la franja del delivery)', () => {
  it('recarga + vuelo a RETIRO ganó la carrera + carrito aún hidratándose → NO cotiza (espera)', () => {
    // Estado EXACTO del bug: settings llegó primero, fulfillment ya es pickup,
    // pero observeAuth → hydrateForUser todavía no seteó el carrito.
    expect(
      debeCotizar({ cartHydrated: false, isEmpty: true, fulfillment: 'pickup', zoneEntregaId: '' }),
    ).toBe(false);
  });

  it('el carrito TERMINA de hidratarse → SÍ cotiza (la re-corrida del fix)', () => {
    // El mismo instante, un poco después: hydrated pasa false→true (está en
    // las deps del efecto) → la cotización de RETIRO sale con el carrito real.
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'pickup', zoneEntregaId: '' }),
    ).toBe(true);
  });

  it('carrera inversa (carrito hidratado antes del vuelo a retiro) → SÍ cotiza', () => {
    // Si hydrateForUser gana la carrera, el vuelo a RETIRO re-corre el efecto
    // con el carrito listo: pickup no exige zona y cotiza de una vez.
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'pickup', zoneEntregaId: '' }),
    ).toBe(true);
  });

  it('AMBOS órdenes de llegada de la carrera terminan en cotización', () => {
    // La carrera es intermitente (por eso el dueño decía que a veces funcionaba):
    // el gate garantiza el MISMO desenlace en los dos órdenes. Si el carrito
    // llega primero, el vuelo a retiro de settings re-corre y cotiza; si
    // settings llega primero, la hidratación re-corre y cotiza.
    const ordenSettingsPrimero = [
      { cartHydrated: false, isEmpty: true, fulfillment: 'pickup' as const, zoneEntregaId: '' },
      { cartHydrated: true, isEmpty: false, fulfillment: 'pickup' as const, zoneEntregaId: '' },
    ];
    expect(ordenSettingsPrimero.map(debeCotizar)).toEqual([false, true]);
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'pickup', zoneEntregaId: '' }),
    ).toBe(true);
  });

  it('regresión 5.112-B: delivery dentro de horario sin zona → NO cotiza y la UI guía «Elige la zona…»', () => {
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'delivery', zoneEntregaId: '' }),
    ).toBe(false);
  });

  it('delivery con zona del destinatario (tercero o comprador) hidratado y con items → SÍ cotiza', () => {
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'delivery', zoneEntregaId: 'z-maracay-norte' }),
    ).toBe(true);
  });

  it('delivery con zona pero sin hidratar → NO cotiza aún (espera el carrito real)', () => {
    expect(
      debeCotizar({ cartHydrated: false, isEmpty: false, fulfillment: 'delivery', zoneEntregaId: 'z-maracay-norte' }),
    ).toBe(false);
  });

  it('carrito hidratado pero VACÍO → NO cotiza (no hay qué cotizar)', () => {
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: true, fulfillment: 'pickup', zoneEntregaId: '' }),
    ).toBe(false);
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: true, fulfillment: 'delivery', zoneEntregaId: 'zona' }),
    ).toBe(false);
  });

  it('el modo tercero NO cambia el contrato: la zona de entrega real viaja en zoneEntregaId', () => {
    // El gate no sabe de tercero: CheckoutPage ya resuelve zoneEntregaId
    // (tercero.zoneId si hay tercero activo, address.zoneId si no).
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'delivery', zoneEntregaId: 'z-tercero' }),
    ).toBe(true);
    expect(
      debeCotizar({ cartHydrated: true, isEmpty: false, fulfillment: 'delivery', zoneEntregaId: '' }),
    ).toBe(false);
  });
});

describe('debeReservar · la reserva de stock 2 h y la recarga', () => {
  it('recarga sin hidratar → NO reserva (antes la reserva quedaba sin disparar toda la sesión)', () => {
    expect(debeReservar({ cartHydrated: false, isEmpty: true, yaReservada: false })).toBe(false);
    // Con items ya en memoria pero sin hidratar TAMBIÉN espera: el carrito
    // aún puede cambiar cuando llegue el remoto (mergeOnLogin).
    expect(debeReservar({ cartHydrated: false, isEmpty: false, yaReservada: false })).toBe(false);
  });

  it('hidratado con items y sin reserva previa → SÍ reserva', () => {
    expect(debeReservar({ cartHydrated: true, isEmpty: false, yaReservada: false })).toBe(true);
  });

  it('ya reservada en esta vida de la página → NO re-reserva (sin dobles en re-corridas)', () => {
    expect(debeReservar({ cartHydrated: true, isEmpty: false, yaReservada: true })).toBe(false);
  });

  it('hidratado pero vacío → NO reserva', () => {
    expect(debeReservar({ cartHydrated: true, isEmpty: true, yaReservada: false })).toBe(false);
  });
});
