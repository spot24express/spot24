/**
 * SPOT 24 · Ronda 5.112.1 — RETIRO EN TIENDA de punta a punta.
 * Reporte del dueño: un pedido pickup seguía TODO el flujo como si fuera
 * envío a domicilio — pasaba por «en_camino», generaba tracking y el cliente
 * recibía «Tu pedido va en ruta». Estas pruebas fijan el comportamiento
 * correcto por modalidad, SIN tocar la máquina global (espejo del cliente).
 */
import { describe, it, expect } from 'vitest';
import { canTransition, canTransitionFor } from '../domain/order-state';
import { textoEstado } from '../lib/notifications';

describe('5.112.1 · transiciones de RETIRO EN TIENDA (pickup)', () => {
  it('del mostrador pasa DIRECTO a entregado (preparado → entregado)', () => {
    expect(canTransitionFor('preparado', 'entregado', 'pickup')).toBe(true);
  });

  it('JAMÁS en_camino: nadie sale a entregar un retiro', () => {
    expect(canTransitionFor('preparado', 'en_camino', 'pickup')).toBe(false);
    expect(canTransitionFor('pagado', 'en_camino', 'pickup')).toBe(false);
    expect(canTransitionFor('en_verificacion', 'en_camino', 'pickup')).toBe(false);
  });

  it('el resto del flujo feliz se mantiene igual', () => {
    expect(canTransitionFor('pendiente', 'en_verificacion', 'pickup')).toBe(true);
    expect(canTransitionFor('en_verificacion', 'pagado', 'pickup')).toBe(true);
    expect(canTransitionFor('pagado', 'preparado', 'pickup')).toBe(true);
  });

  it('se puede cancelar antes del retiro, nunca después', () => {
    expect(canTransitionFor('preparado', 'cancelado', 'pickup')).toBe(true);
    expect(canTransitionFor('entregado', 'cancelado', 'pickup')).toBe(false);
    expect(canTransitionFor('entregado', 'pendiente', 'pickup')).toBe(false);
  });

  it('pickup legacy varado en en_camino se puede cerrar (no queda varado)', () => {
    expect(canTransitionFor('en_camino', 'entregado', 'pickup')).toBe(true);
    expect(canTransitionFor('en_camino', 'cancelado', 'pickup')).toBe(false);
  });
});

describe('5.112.1 · transiciones con ENVÍO (delivery) intactas', () => {
  it('la máquina base no cambia para delivery', () => {
    expect(canTransitionFor('preparado', 'en_camino', 'delivery')).toBe(true);
    expect(canTransitionFor('en_camino', 'entregado', 'delivery')).toBe(true);
    expect(canTransitionFor('pagado', 'preparado', 'delivery')).toBe(true);
    expect(canTransitionFor('preparado', 'cancelado', 'delivery')).toBe(true);
  });

  it('con envío, saltarse la ruta sigue prohibido', () => {
    expect(canTransitionFor('preparado', 'entregado', 'delivery')).toBe(false);
    expect(canTransitionFor('pagado', 'entregado', 'delivery')).toBe(false);
  });

  it('la máquina GLOBAL queda intacta (espejo del cliente sin cambios)', () => {
    expect(canTransition('preparado', 'entregado')).toBe(false);
    expect(canTransition('preparado', 'en_camino')).toBe(true);
  });
});

describe('5.112.1 · textos de aviso del cliente por modalidad', () => {
  it('pickup: «Listo para retirar» / «Retirado» — nunca texto de ruta', () => {
    const preparado = textoEstado('preparado', 'pickup');
    expect(preparado?.title).toBe('SPOT 24 · Listo para retirar');
    expect(preparado?.body).toContain('Te esperamos en la tienda');

    const retirado = textoEstado('entregado', 'pickup');
    expect(retirado?.title).toBe('SPOT 24 · Retirado');
    expect(retirado?.body).toContain('Retirado en tienda');
  });

  it('delivery: textos de siempre, sin cambios', () => {
    expect(textoEstado('preparado', 'delivery')?.title).toBe('SPOT 24 · Pedido preparado');
    expect(textoEstado('preparado', 'delivery')?.body).toBe('Empacado y listo. Sale de la bahía pronto.');
    expect(textoEstado('en_camino', 'delivery')?.title).toBe('SPOT 24 · En camino');
  });

  it('sin modo explícito cae a delivery (compatibilidad con llamadores previos)', () => {
    expect(textoEstado('preparado')?.title).toBe('SPOT 24 · Pedido preparado');
  });

  it('estados neutrales comparten texto entre modalidades', () => {
    expect(textoEstado('pagado', 'pickup')?.title).toBe('SPOT 24 · Pago confirmado');
    expect(textoEstado('cancelado', 'pickup')?.title).toBe('SPOT 24 · Pedido cancelado');
  });

  it('estado desconocido → undefined (el envío se omite, como siempre)', () => {
    expect(textoEstado('estado_fantasma', 'delivery')).toBeUndefined();
    expect(textoEstado('estado_fantasma', 'pickup')).toBeUndefined();
  });
});
