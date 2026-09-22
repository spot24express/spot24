import { describe, it, expect } from 'vitest';
import { buildIdempotencyKey, fnv1aHex } from '../lib/idempotency';
import type { CheckoutItem } from '../types';

const base = {
  uid: 'user-1',
  contact: { name: 'Juan Pérez', phone: '04141234567', cedula: 'V-12345678' },
  address: {
    state: 'Distrito Capital', city: 'Caracas', zoneId: 'caracas-este',
    zoneName: 'Caracas Este', details: 'Urb. Los Palos Grandes, calle A, casa 5',
  },
  paymentMethod: 'pago_movil',
  now: 1_700_000_000_000,
  items: [
    { productId: 'p1', variantId: 'v1', qty: 2 },
    { productId: 'p2', variantId: 'v2', qty: 1 },
  ] satisfies CheckoutItem[],
};

describe('clave de idempotencia', () => {
  it('es estable para el mismo payload en la misma ventana', () => {
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({ ...base, now: base.now + 5 * 60 * 1000 });
    expect(a).toBe(b);
  });

  it('cambia entre ventanas de 30 minutos', () => {
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({ ...base, now: base.now + 31 * 60 * 1000 });
    expect(a).not.toBe(b);
  });

  it('cambia si cambia el carrito', () => {
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({
      ...base,
      items: [{ productId: 'p1', variantId: 'v1', qty: 3 }],
    });
    expect(a).not.toBe(b);
  });

  it('cambia si cambia el método de pago', () => {
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({ ...base, paymentMethod: 'zelle' });
    expect(a).not.toBe(b);
  });

  it('cambia si cambia la dirección', () => {
    const a = buildIdempotencyKey(base);
    const b = buildIdempotencyKey({
      ...base,
      address: { ...base.address, details: 'Otra dirección 99' },
    });
    expect(a).not.toBe(b);
  });

  it('produce hex estable de 16 caracteres', () => {
    const key = fnv1aHex('SPOT24');
    expect(key).toMatch(/^[0-9a-f]{16}$/);
  });
});
