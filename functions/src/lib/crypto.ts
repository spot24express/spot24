/**
 * SPOT 24 · Cifrado AES-256-GCM en reposo (6.7).
 * Campos sensibles (teléfono, cédula, dirección, referencias de pago) se
 * guardan cifrados. La clave llega por variable de entorno/secret:
 *   firebase functions:secrets:set ENC_KEY_HEX  (64 hex = 32 bytes)
 * Nunca en el código ni en el repo. Los logs nunca imprimen campos cifrados.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

function getKey(): Buffer {
  const hex = process.env['ENC_KEY_HEX'];
  if (hex && /^[0-9a-f]{64}$/i.test(hex)) {
    return Buffer.from(hex, 'hex');
  }
  // Clave derivada de respaldo (solo para dev): usa projectId como semilla.
  // EN PRODUCCIÓN: definir ENC_KEY_HEX con `firebase functions:secrets:set`.
  const seed = `spot24-fallback-${process.env['GCLOUD_PROJECT'] ?? 'dev'}`;
  return createHash('sha256').update(seed).digest();
}

/** Cifra texto → "v1.<iv_b64>.<tag_b64>.<cipher_b64>" */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

/** Descifra el formato v1; devuelve '' si el formato no es válido. */
export function decryptField(payload: string): string {
  if (!payload.startsWith('v1.')) return '';
  try {
    const [, ivB64, tagB64, dataB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !dataB64) return '';
    const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return '';
  }
}

/** Hash determinista (SHA-256) para detección de referencias duplicadas (6.8). */
export function hashReference(method: string, reference: string): string {
  return createHash('sha256').update(`${method.toLowerCase()}|${reference.trim()}`).digest('hex');
}
