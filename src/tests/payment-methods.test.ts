/**
 * SPOT 24 · Tests de formas de pago (rondas 5.79 + 5.80).
 * · isPaymentAccount: defensa de lectura por método (VE pide banco+RIF,
 *   Zelle correo, Binance ID, contra entrega sin datos) y `active` ausente
 *   = activa (docs viejos).
 * · activeAccountsOf: SOLO activas, orden estable por método — y desde 5.80
 *   SIN deduplicar: varias cuentas del mismo método salen todas (multicuenta).
 * · accountKey / accountChipLabel / newAccountId: identidad por cuenta.
 * · validatePaymentForm / buildPaymentDetails: reglas y claves por método
 *   (la referencia SIEMPRE viaja en las electrónicas: refHash; contra entrega
 *   no manda nada ni pide fecha).
 * · copyRowsForAccount / qrForAccount: qué ve y copia el cliente (+ QR).
 */
import { describe, expect, it } from 'vitest';
import {
  accountChipLabel, accountKey, activeAccountsOf, buildPaymentDetails,
  copyRowsForAccount, isPaymentAccount, isValidQrUrl, newAccountId,
  qrForAccount, validatePaymentForm, EMPTY_PAYMENT_FORM,
} from '../shared/lib/paymentMethods';
import type { PaymentAccount } from '../shared/constants/brand';

const PM = (over: Partial<PaymentAccount>): PaymentAccount => ({
  method: 'pago_movil',
  active: true,
  bank: 'Mercantil Banco',
  rif: 'J-12345678-9',
  ...over,
});

describe('isPaymentAccount', () => {
  it('acepta pago_movil bien formado (banco + RIF)', () => {
    expect(isPaymentAccount(PM({}))).toBe(true);
  });

  it('rechaza pago_movil sin banco o sin RIF (métodos VE)', () => {
    expect(isPaymentAccount(PM({ bank: '' }))).toBe(false);
    expect(isPaymentAccount(PM({ rif: '' }))).toBe(false);
  });

  it('transferencia exige banco + RIF igual que pago móvil', () => {
    expect(isPaymentAccount(PM({ method: 'transferencia' }))).toBe(true);
    expect(isPaymentAccount(PM({ method: 'transferencia', bank: '' }))).toBe(false);
  });

  it('efectivo y punto de venta NO exigen datos (contra entrega, 5.80)', () => {
    expect(isPaymentAccount(PM({ method: 'efectivo', bank: '', rif: '' }))).toBe(true);
    expect(isPaymentAccount(PM({ method: 'punto_venta', bank: '', rif: '' }))).toBe(true);
  });

  it('zelle exige correo de recaudo (el RIF no aplica)', () => {
    expect(isPaymentAccount(PM({ method: 'zelle', bank: '', rif: '', email: 'pagos@gmail.com' }))).toBe(true);
    expect(isPaymentAccount(PM({ method: 'zelle', bank: '', rif: '', email: '' }))).toBe(false);
  });

  it('binance exige Binance ID', () => {
    expect(isPaymentAccount(PM({ method: 'binance', bank: '', rif: '', binanceId: '123456789' }))).toBe(true);
    expect(isPaymentAccount(PM({ method: 'binance', bank: '', rif: '', binanceId: '' }))).toBe(false);
  });

  it('acepta id y label de la multicuenta (5.80)', () => {
    expect(isPaymentAccount(PM({ id: 'abc123', label: 'Banesco' }))).toBe(true);
  });

  it('`active` ausente (docs previos a 5.79) cuenta como activa', () => {
    const legacy = PM({}) as unknown as Record<string, unknown>;
    delete legacy['active'];
    expect(isPaymentAccount(legacy)).toBe(true);
    expect(isPaymentAccount(PM({ active: false }))).toBe(true); // forma válida, solo apagada
  });

  it('rechaza basura: no-objetos y métodos desconocidos', () => {
    expect(isPaymentAccount(null)).toBe(false);
    expect(isPaymentAccount('pago_movil')).toBe(false);
    expect(isPaymentAccount(PM({ method: 'paypal' as unknown as PaymentAccount['method'] }))).toBe(false);
  });
});

describe('activeAccountsOf (multicuenta 5.80)', () => {
  it('filtra las inactivas y ordena por presentación (no por el array)', () => {
    const list = [
      PM({ method: 'binance', bank: '', rif: '', binanceId: '123' }),
      PM({}), // pago_movil
      PM({ method: 'zelle', bank: '', rif: '', email: 'p@x.com', active: false }),
      PM({ method: 'transferencia' }),
    ];
    expect(activeAccountsOf(list).map((a) => a.method)).toEqual([
      'pago_movil', 'transferencia', 'binance',
    ]);
  });

  it('NO deduplica: dos transferencias de bancos distintos salen las dos', () => {
    const list = [
      PM({ id: 'tr-banesco', method: 'transferencia', bank: '(0134) Banesco' }),
      PM({ method: 'efectivo', bank: '', rif: '' }),
      PM({ id: 'tr-bnc', method: 'transferencia', bank: '(0191) BNC' }),
    ];
    const out = activeAccountsOf(list);
    expect(out).toHaveLength(3);
    expect(out.map((a) => a.bank)).toEqual(['(0134) Banesco', '(0191) BNC', '']);
    // Orden: transferencia primero (orden del método), luego efectivo; dentro
    // del mismo método se conserva el orden del array.
  });

  it('asigna id estable a cuentas legacy sin id (id = method)', () => {
    const out = activeAccountsOf([PM({})]);
    expect(out[0]?.id).toBe('pago_movil');
    expect(accountKey(out[0]!)).toBe('pago_movil');
  });

  it('respeta el id guardado de las cuentas nuevas', () => {
    const out = activeAccountsOf([PM({ id: 'tr-uuid-123' })]);
    expect(accountKey(out[0]!)).toBe('tr-uuid-123');
  });

  it('lista vacía si el dueño apagó todo', () => {
    expect(activeAccountsOf([PM({ active: false })])).toEqual([]);
  });
});

describe('accountChipLabel (5.80)', () => {
  it('el nombre del dueño gana siempre', () => {
    const a = PM({ label: 'Cuenta Erick' });
    expect(accountChipLabel(a, 3)).toBe('Cuenta Erick');
  });

  it('una sola cuenta del método: nombre limpio del método', () => {
    expect(accountChipLabel(PM({}), 1)).toBe('Pago Móvil');
  });

  it('varias del mismo método sin nombre: se distinguen por banco', () => {
    const bnc = PM({ method: 'transferencia', bank: '(0191) BNC' });
    expect(accountChipLabel(bnc, 2)).toBe('Transferencia · (0191) BNC');
  });

  it('varias del mismo método sin banco: cae al nombre del método', () => {
    expect(accountChipLabel(PM({ method: 'efectivo', bank: '' }), 2)).toBe('Efectivo');
  });
});

describe('newAccountId (5.80)', () => {
  it('devuelve ids distintos y sin guiones', () => {
    const a = newAccountId();
    const b = newAccountId();
    expect(a).not.toBe(b);
    expect(a).not.toContain('-');
    expect(a.length).toBeGreaterThanOrEqual(8);
  });
});

describe('validatePaymentForm', () => {
  it('pago móvil: exige banco, cédula, teléfono, referencia y fecha', () => {
    const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM });
    expect(e['banco']).toBeTruthy();
    expect(e['cedula']).toBeTruthy();
    expect(e['telefono']).toBeTruthy();
    expect(e['referencia']).toBeTruthy();
    expect(e['fecha']).toBeTruthy();
    expect(e['titular']).toBeUndefined();
  });

  it('pago móvil bien lleno pasa limpio', () => {
    const e = validatePaymentForm({
      ...EMPTY_PAYMENT_FORM,
      banco: '(0134) Banesco', cedula: '12345678', telefono: '04241234567',
      referencia: '123456', fecha: '2026-10-17',
    });
    expect(Object.keys(e)).toHaveLength(0);
  });

  it('transferencia usa el mismo formulario VE (referencia de 6)', () => {
    const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM, method: 'transferencia', fecha: '2026-10-17' });
    expect(e['banco']).toBeTruthy();
    expect(e['referencia']).toBeTruthy();
  });

  it('efectivo y punto de venta: SIN formulario ni fecha (se paga al recibir)', () => {
    for (const m of ['efectivo', 'punto_venta'] as const) {
      const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM, method: m });
      expect(Object.keys(e)).toHaveLength(0);
    }
  });

  it('zelle: banco de origen + titular + confirmación libre (4-40)', () => {
    const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM, method: 'zelle', fecha: '2026-10-17' });
    expect(e['banco']).toBeTruthy();
    expect(e['titular']).toBeTruthy();
    expect(e['cedula']).toBeUndefined(); // el formulario VE no aplica
    const ok = validatePaymentForm({
      ...EMPTY_PAYMENT_FORM, method: 'zelle', banco: 'Chase',
      titular: 'Ana Pérez', referencia: 'U123456789', fecha: '2026-10-17',
    });
    expect(Object.keys(ok)).toHaveLength(0);
  });

  it('zelle rechaza confirmaciones demasiado cortas', () => {
    const e = validatePaymentForm({
      ...EMPTY_PAYMENT_FORM, method: 'zelle', banco: 'Chase',
      titular: 'Ana Pérez', referencia: 'ab', fecha: '2026-10-17',
    });
    expect(e['referencia']).toBeTruthy();
  });

  it('binance: exige usuario y Order ID; el banco no se pregunta', () => {
    const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM, method: 'binance', fecha: '2026-10-17' });
    expect(e['titular']).toBeTruthy();
    expect(e['referencia']).toBeTruthy();
    expect(e['banco']).toBeUndefined();
  });

  it('las formas electrónicas piden fecha (contra entrega no)', () => {
    for (const m of ['pago_movil', 'transferencia', 'zelle', 'binance'] as const) {
      const e = validatePaymentForm({ ...EMPTY_PAYMENT_FORM, method: m });
      expect(e['fecha']).toBeTruthy();
    }
  });
});

describe('buildPaymentDetails', () => {
  it('pago móvil manda las claves VE normalizadas', () => {
    const d = buildPaymentDetails({
      ...EMPTY_PAYMENT_FORM,
      banco: '(0134) Banesco', cedula: '12.345.678', telefono: '0424-1234567',
      referencia: '123456', fecha: '2026-10-17',
    });
    expect(d['banco']).toBe('(0134) Banesco');
    expect(d['cedula']).toBe('12345678');
    expect(d['telefono']).toBe('04241234567');
    expect(d['referencia']).toBe('123456');
    expect(d['fecha']).toBe('2026-10-17');
  });

  it('contra entrega no manda detalles (el pago ocurre al recibir)', () => {
    expect(buildPaymentDetails({ ...EMPTY_PAYMENT_FORM, method: 'efectivo' })).toEqual({});
    expect(buildPaymentDetails({ ...EMPTY_PAYMENT_FORM, method: 'punto_venta' })).toEqual({});
  });

  it('zelle manda banco de origen y titular (sin cédula ni teléfono)', () => {
    const d = buildPaymentDetails({
      ...EMPTY_PAYMENT_FORM, method: 'zelle', banco: 'Chase',
      titular: 'Ana Pérez', referencia: 'U123456789', fecha: '2026-10-17',
    });
    expect(d['banco']).toBe('Chase');
    expect(d['titular']).toBe('Ana Pérez');
    expect(d['referencia']).toBe('U123456789');
    expect(d['cedula']).toBeUndefined();
    expect(d['telefono']).toBeUndefined();
  });

  it('binance fija banco=Binance y lleva el Order ID como referencia (refHash)', () => {
    const d = buildPaymentDetails({
      ...EMPTY_PAYMENT_FORM, method: 'binance',
      titular: 'ana@mail.com', referencia: '123456789012', fecha: '2026-10-17',
    });
    expect(d['banco']).toBe('Binance');
    expect(d['referencia']).toBe('123456789012');
    expect(d['fecha']).toBe('2026-10-17');
  });
});

describe('copyRowsForAccount', () => {
  it('pago móvil: banco, RIF (copia solo números) y teléfono normalizado', () => {
    const rows = copyRowsForAccount(PM({ phone: '04241234567' }));
    const rif = rows.find((r) => r.label === 'RIF');
    expect(rif?.value).toBe('J-12345678-9');
    expect(rif?.copy).toBe('123456789');
    const tel = rows.find((r) => r.label === 'Teléfono');
    expect(tel?.copy).toBe('04241234567');
  });

  it('contra entrega: sin filas de datos (no hay cuenta a la que transferir)', () => {
    expect(copyRowsForAccount(PM({ method: 'efectivo', bank: '', rif: '' }))).toEqual([]);
    expect(copyRowsForAccount(PM({ method: 'punto_venta', bank: '', rif: '' }))).toEqual([]);
  });

  it('transferencia incluye la cuenta de 20; zelle muestra correo y titular', () => {
    const tr = copyRowsForAccount(PM({ method: 'transferencia', accountNumber: '0105' + '0'.repeat(16) }));
    expect(tr.find((r) => r.label === 'Cuenta')?.value).toBe('0105' + '0'.repeat(16));

    const zl = copyRowsForAccount(PM({ method: 'zelle', bank: '', rif: '', email: 'pagos@gmail.com', holderName: 'SPOT 24 C.A.' }));
    expect(zl.map((r) => r.label)).toEqual(['Correo Zelle', 'Titular']);
  });

  it('binance muestra el Binance ID primero', () => {
    const rows = copyRowsForAccount(PM({ method: 'binance', bank: '', rif: '', binanceId: '123456789', holderName: 'Erick' }));
    expect(rows[0]?.label).toBe('Binance ID');
    expect(rows[0]?.copy).toBe('123456789');
  });
});

describe('qrForAccount', () => {
  it('el QR guardado en la cuenta gana', () => {
    expect(qrForAccount(PM({ qrUrl: 'https://i.ibb.co/mio.jpg' }))).toBe('https://i.ibb.co/mio.jpg');
  });

  it('5.84 · una cuenta sin QR propio NO muestra NINGÚN QR (no hereda)', () => {
    const a = PM({}); delete (a as Partial<PaymentAccount>).qrUrl;
    expect(qrForAccount(a)).toBeNull();
  });

  it('zelle/binance sin QR no muestran nada', () => {
    expect(qrForAccount(PM({ method: 'zelle', bank: '', rif: '', email: 'p@x.com' }))).toBeNull();
    expect(qrForAccount(PM({ method: 'binance', bank: '', rif: '', binanceId: '123' }))).toBeNull();
  });
});

describe('isValidQrUrl', () => {
  it('acepta enlaces imgbb y assets locales; rechaza otras cosas', () => {
    expect(isValidQrUrl('https://i.ibb.co/x.jpg')).toBe(true);
    expect(isValidQrUrl('/img/qr-pago-movil.jpg')).toBe(true);
    expect(isValidQrUrl('')).toBe(true); // opcional
    expect(isValidQrUrl('javascript:alert(1)')).toBe(false);
  });
});
