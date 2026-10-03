/**
 * SPOT 24 · Tasa BCV en vivo (doc rates/bcv, escrito por la función programada
 * y por el disparo manual fn-runBcvRate).
 * Patrón vigía del proyecto: UN solo onSnapshot compartido por toda la app
 * (store externo + useSyncExternalStore). Cuando la tasa cambia, TODAS las
 * tarjetas y vistas que la consumen se actualizan al instante, sin recargar
 * ni volver a consultar. Reglas Firestore: lectura pública de rates,
 * escritura solo por Cloud Functions.
 * Solo notifica cuando cambia el VALOR de la tasa: el cron toca el documento
 * cada hora (lastAttemptAt/source) aunque la tasa siga igual, y eso no debe
 * provocar renders.
 */
import { useSyncExternalStore } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';

export interface BcvRate {
  /** VES por USD, ya redondeada a 2 decimales por el backend. */
  rate: number;
  /** 'bcv.org.ve' | 'fallback' (el motivo del fallback vive en el log admin). */
  source: string;
  /** Marca de tiempo del último cambio REAL de tasa (escrito por el backend). */
  updatedAt: number;
}

let cached: BcvRate | null = null;
const listeners = new Set<() => void>();
let started = false;

function notifyIfChanged(next: BcvRate): void {
  if (cached && cached.rate === next.rate && cached.source === next.source) return;
  cached = next;
  listeners.forEach((notify) => notify());
}

function ensureRateWatcher(): void {
  if (started) return;
  started = true;
  void loadFirebase().then((fb) => {
    if (!fb) return; // demo/sin Firebase: la tarjeta muestra su fallback
    const ref = doc(fb.db, 'rates', 'bcv');
    onSnapshot(
      ref,
      (snap) => {
        const d = snap.data();
        // El backend escribe la tasa en el campo 'usdToVes' (rates.ts promote()).
        const rate = Number(d?.['usdToVes'] ?? NaN);
        if (!Number.isFinite(rate) || rate <= 0) return; // doc aún sin tasa válida
        notifyIfChanged({
          rate,
          source: String(d?.['source'] ?? 'fallback'),
          updatedAt: Number(d?.['updatedAt'] ?? 0),
        });
      },
      (err) => logger.warn('vigía tasa BCV detenida', err),
    );
  });
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  ensureRateWatcher();
  return () => {
    listeners.delete(notify);
  };
}

function getSnapshot(): BcvRate | null {
  return cached;
}

function getServerSnapshot(): BcvRate | null {
  return null;
}

/**
 * Tasa BCV vigente en vivo; null mientras llega el primer snapshot o si no
 * hay Firebase configurado (modo demo). Comparte una única conexión para
 * toda la app: N tarjetas, 1 lector.
 */
export function useBcvRate(): BcvRate | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
