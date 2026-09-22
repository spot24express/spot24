/**
 * SPOT 24 · Rate limiting en Firestore (6.4).
 * Ventanas fijas por bucket+identidad. Las funciones públicas llaman a
 * `enforceRateLimit` al inicio; lanza HttpsError resource-exhausted al exceder.
 * Documentos en counters/ratelimit_{bucket}_{windowStart}: bajo costo por
 * escritura; se recomienda TTL policy en Console (expireAt).
 */
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

const db = () => admin.firestore();

export interface RateLimitOptions {
  bucket: string;
  identity: string;
  max: number;
  windowMs: number;
}

export async function enforceRateLimit(opts: RateLimitOptions): Promise<void> {
  const windowStart = Math.floor(Date.now() / opts.windowMs) * opts.windowMs;
  const id = `ratelimit_${opts.bucket}_${opts.identity.replace(/[^a-zA-Z0-9_-]/g, '_')}_${windowStart}`;
  const ref = db().collection('counters').doc(id);

  try {
    await db().runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const current = snap.exists ? Number(snap.data()?.['count'] ?? 0) : 0;
      if (current >= opts.max) {
        throw new HttpsError('resource-exhausted', 'rate-limit');
      }
      const data: Record<string, unknown> = {
        count: current + 1,
        bucket: opts.bucket,
        windowStart,
        expireAt: new Date(windowStart + opts.windowMs * 2),
      };
      if (snap.exists) {
        tx.update(ref, { count: current + 1 });
      } else {
        tx.set(ref, data);
      }
    });
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    // Si falla el contador (p. ej. carrera), preferimos fallar cerrado para
    // crearOrden; para consultas ligeras el caller puede ignorar.
    throw new HttpsError('internal', 'rate-limit-check-failed');
  }
}

/** Variante no bloqueante para operaciones de lectura. */
export async function tryRateLimit(opts: RateLimitOptions): Promise<void> {
  try {
    await enforceRateLimit(opts);
  } catch {
    // lectura: no bloquea
  }
}
