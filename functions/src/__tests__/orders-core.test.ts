import { describe, it, expect } from 'vitest';
import { canTransition, isOrderStatus } from '../domain/order-state';
import { encryptField, decryptField, hashReference } from '../lib/crypto';

describe('máquina de estados del pedido', () => {
  it('permite el flujo feliz completo', () => {
    expect(canTransition('pendiente', 'en_verificacion')).toBe(true);
    expect(canTransition('en_verificacion', 'pagado')).toBe(true);
    expect(canTransition('pagado', 'preparado')).toBe(true);
    expect(canTransition('preparado', 'en_camino')).toBe(true);
    expect(canTransition('en_camino', 'entregado')).toBe(true);
  });

  it('permite cancelar antes de en_camino', () => {
    expect(canTransition('pendiente', 'cancelado')).toBe(true);
    expect(canTransition('en_verificacion', 'cancelado')).toBe(true);
    expect(canTransition('pagado', 'cancelado')).toBe(true);
    expect(canTransition('preparado', 'cancelado')).toBe(true);
    expect(canTransition('en_camino', 'cancelado')).toBe(false);
    expect(canTransition('entregado', 'cancelado')).toBe(false);
  });

  it('bloquea saltos ilegales', () => {
    expect(canTransition('pendiente', 'pagado')).toBe(false);
    expect(canTransition('pendiente', 'entregado')).toBe(false);
    expect(canTransition('en_verificacion', 'en_camino')).toBe(false);
    expect(canTransition('entregado', 'pendiente')).toBe(false);
  });

  it('valida estados', () => {
    expect(isOrderStatus('pagado')).toBe(true);
    expect(isOrderStatus('PAGADO')).toBe(false);
    expect(isOrderStatus('otro')).toBe(false);
  });
});

describe('cifrado AES-256-GCM', () => {
  it('cifra y descifra redondeando el valor original', () => {
    const secret = '04141234567';
    const enc = encryptField(secret);
    expect(enc.startsWith('v1.')).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptField(enc)).toBe(secret);
  });

  it('cada cifrado usa IV distinto', () => {
    const a = encryptField('V-12345678');
    const b = encryptField('V-12345678');
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe('V-12345678');
    expect(decryptField(b)).toBe('V-12345678');
  });

  it('tolera payloads corruptos sin lanzar', () => {
    expect(decryptField('v1.abc.def.ghi')).toBe('');
    expect(decryptField('garbage')).toBe('');
  });
});

describe('hash de referencias (antifraude)', () => {
  it('es determinista y sensible al método', () => {
    const a = hashReference('pago_movil', '123456789');
    const b = hashReference('pago_movil', '123456789');
    const c = hashReference('zelle', '123456789');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toHaveLength(64);
  });
});
