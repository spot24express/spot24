import { describe, it, expect } from 'vitest';
import {
  sanitizeText, sanitizeDigits, sanitizeMultiline, isValidEmail, isValidPhoneVE,
  normalizePhoneVE, isValidCedulaVE, normalizeCedulaVE, isValidPaymentReference,
  isValidAmount, isValidPersonName, sanitizeFileName, isAllowedUploadType,
  isAllowedUploadSize, RECEIPT_TYPES,
} from '@/shared/lib/validation';

describe('sanitización', () => {
  it('elimina caracteres de control y recorta longitud', () => {
    expect(sanitizeText('  hola\u0007mundo\u0010  ')).toBe('holamundo');
    expect(sanitizeText('x'.repeat(400), 300)).toHaveLength(300);
    expect(sanitizeText(null as unknown as string)).toBe('');
  });

  it('conserva saltos de línea en texto multilínea', () => {
    expect(sanitizeMultiline('Urb. A\u0007\nCalle B')).toBe('Urb. A\nCalle B');
  });

  it('solo dígitos con tope', () => {
    expect(sanitizeDigits('a1b2c3d9x0x0x0x0x0x0', 6)).toBe('123900');
  });

  it('nombre de archivo seguro', () => {
    expect(sanitizeFileName('comprobante ñá 2024.pdf')).toBe('comprobante_na_2024.pdf');
    expect(sanitizeFileName('../../etc/passwd')).toBe('.._.._etc_passwd');
  });
});

describe('validadores venezolanos', () => {
  it('teléfonos móviles válidos', () => {
    expect(isValidPhoneVE('04141234567')).toBe(true);
    expect(isValidPhoneVE('0412-123-4567')).toBe(true);
    expect(isValidPhoneVE('4141234567')).toBe(true);
    expect(isValidPhoneVE('0412123456')).toBe(false);
    expect(isValidPhoneVE('03141234567')).toBe(false);
    expect(isValidPhoneVE('05141234567')).toBe(false);
  });

  it('normaliza teléfonos a 11 dígitos con 0 inicial', () => {
    expect(normalizePhoneVE('414-123-4567')).toBe('04141234567');
    expect(normalizePhoneVE('0414 123 4567')).toBe('04141234567');
  });

  it('cédulas V-/E- con 1 a 8 dígitos', () => {
    expect(isValidCedulaVE('V-12345678')).toBe(true);
    expect(isValidCedulaVE('e87654321')).toBe(true);
    expect(isValidCedulaVE('V-123456789')).toBe(false);
    expect(isValidCedulaVE('X-123')).toBe(false);
    expect(normalizeCedulaVE('v12345678')).toBe('V-12345678');
  });

  it('referencias de pago: 6-20 dígitos VE, alfanumérica Zelle', () => {
    expect(isValidPaymentReference('123456', 've')).toBe(true);
    expect(isValidPaymentReference('12345', 've')).toBe(false);
    expect(isValidPaymentReference('12 456', 've')).toBe(false);
    expect(isValidPaymentReference('AB12-34', 'zelle')).toBe(true);
    expect(isValidPaymentReference('a$b', 'zelle')).toBe(false);
  });
});

describe('validadores generales', () => {
  it('correo', () => {
    expect(isValidEmail('cliente@correo.com.ve')).toBe(true);
    expect(isValidEmail('sin-arroba@')).toBe(false);
    expect(isValidEmail('a b@c.d')).toBe(false);
  });

  it('montos positivos acotados', () => {
    expect(isValidAmount(10.5)).toBe(true);
    expect(isValidAmount(0)).toBe(false);
    expect(isValidAmount(-5)).toBe(false);
    expect(isValidAmount(Number.NaN)).toBe(false);
  });

  it('nombre de persona con dos partes', () => {
    expect(isValidPersonName('Juan Pérez')).toBe(true);
    expect(isValidPersonName('Juan')).toBe(false);
    expect(isValidPersonName('María de los Ángeles Rodríguez')).toBe(true);
  });

  it('carga de archivos: tipo y tamaño', () => {
    expect(isAllowedUploadType('image/jpeg', RECEIPT_TYPES)).toBe(true);
    expect(isAllowedUploadType('application/pdf', RECEIPT_TYPES)).toBe(true);
    expect(isAllowedUploadType('application/zip', RECEIPT_TYPES)).toBe(false);
    expect(isAllowedUploadSize(0)).toBe(false);
    expect(isAllowedUploadSize(5 * 1024 * 1024)).toBe(true);
    expect(isAllowedUploadSize(5 * 1024 * 1024 + 1)).toBe(false);
  });
});
