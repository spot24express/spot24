/**
 * 5.117 · Visibilidad de la cola de despacho por rol (features/admin/lib/colaDespacho).
 * Decisión del dueño: «el delivery solo tendría pedidos a domicilio» — los
 * retiros en tienda se ocultan de SU vista (cola activa, «Entregadas» y chips
 * de zona derivados). admin/gerente/cajero siguen viendo TODO, intacto.
 * El filtro es SOLO de vista: el backend ya negaba al delivery cualquier
 * acción sobre retiros. Libra pura, testeada sin emulador.
 */
import { describe, expect, it } from 'vitest';
import { esVisiblePorRol, filtrarColaPorRol } from '@/features/admin/lib/colaDespacho';
import type { Order } from '@/features/orders/types';
import type { UserRole } from '@/features/auth/types';

/** Orden mínima válida para las libras (solo importa delivery para el filtro). */
function orden(mode?: 'delivery' | 'pickup'): Pick<Order, 'delivery'> {
  return {
    delivery: {
      zoneId: 'z1',
      zoneName: 'Caña de Azúcar',
      window: { start: '12:00', end: '23:59' },
      addressPreview: 'Calle 8, casa 12',
      trackingCode: null,
      ...(mode ? { mode } : {}),
    },
  };
}

const ROLES_STAFF: UserRole[] = ['admin', 'gerente', 'cajero'];

describe('esVisiblePorRol (5.117)', () => {
  it('delivery NO ve retiros en tienda', () => {
    expect(esVisiblePorRol(orden('pickup'), 'delivery')).toBe(false);
  });

  it('delivery SÍ ve pedidos a domicilio', () => {
    expect(esVisiblePorRol(orden('delivery'), 'delivery')).toBe(true);
  });

  it('mode undefined (órdenes viejas) cuenta como domicilio: delivery la ve', () => {
    expect(esVisiblePorRol(orden(undefined), 'delivery')).toBe(true);
  });

  it('admin, gerente y cajero ven TODO (incluidos retiros)', () => {
    for (const role of ROLES_STAFF) {
      expect(esVisiblePorRol(orden('pickup'), role)).toBe(true);
      expect(esVisiblePorRol(orden('delivery'), role)).toBe(true);
      expect(esVisiblePorRol(orden(undefined), role)).toBe(true);
    }
  });
});

describe('filtrarColaPorRol (5.117)', () => {
  it('delivery: la cola resultante no contiene retiros (cola activa e historial)', () => {
    const cola = [orden('pickup'), orden('delivery'), orden(undefined), orden('pickup')];
    const visible = filtrarColaPorRol(cola, 'delivery');
    expect(visible).toHaveLength(2);
    visible.forEach((o) => expect(o.delivery.mode).not.toBe('pickup'));
  });

  it('admin/gerente/cajero: lista intacta, MISMO orden, copia defensiva', () => {
    const cola = [orden('pickup'), orden('delivery'), orden(undefined)];
    for (const role of ROLES_STAFF) {
      const out = filtrarColaPorRol(cola, role);
      expect(out).toHaveLength(3);
      expect(out).toEqual(cola);
      expect(out).not.toBe(cola); // copia: sin mutar la entrada
    }
  });

  it('no muta la lista de entrada cuando filtra', () => {
    const cola = [orden('pickup'), orden('delivery')];
    filtrarColaPorRol(cola, 'delivery');
    expect(cola).toHaveLength(2); // la entrada queda como estaba
  });

  it('cola vacía → vacía (y chips de zona derivan de la ya filtrada)', () => {
    expect(filtrarColaPorRol([], 'delivery')).toEqual([]);
    // El chip «Retiro en tienda» desaparece solo para delivery: sale de contar
    // la lista filtrada, sin código extra en la página.
    const entregadas = [orden('pickup'), orden('pickup'), orden('delivery')];
    const visibles = filtrarColaPorRol(entregadas, 'delivery');
    const pickups = visibles.filter((o) => o.delivery.mode === 'pickup');
    expect(pickups).toHaveLength(0);
  });
});
