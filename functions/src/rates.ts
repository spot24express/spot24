/**
 * SPOT 24 · Tasa BCV (5.4).
 * · updateBcvRate: programada cada hora, consulta bcv.org.ve, parsea el USD
 *   y publica rates/bcv. Ante error conserva la última tasa (fallback).
 * · fn-getBcvRate: lectura conveniente para el cliente (también vía Firestore).
 */
import * as admin from 'firebase-admin';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';

const db = () => admin.firestore();

const BCV_URL = 'https://www.bcv.org.ve/';

async function fetchBcvUsdRate(): Promise<number | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(BCV_URL, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SPOT24-Bot/1.0; +https://spot24.com.ve)',
        Accept: 'text/html',
      },
      redirect: 'follow',
    });
    clearTimeout(timeout);
    if (!res.ok) {
      logger.warn('BCV respondió', res.status);
      return null;
    }
    const html = await res.text();
    // La sección USD contiene <div class="col-sm-6 col-xs-6 centro">…<strong>36,58</strong>
    const usdSection = html.split('dolar')[1] ?? html;
    const m = /<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i.exec(usdSection);
    if (!m || !m[1]) {
      logger.warn('BCV: patrón no encontrado');
      return null;
    }
    // Formato venezolano: 36,58
    const normalized = m[1].replace(/\./g, '').replace(',', '.');
    const rate = Number(normalized);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000_000) {
      logger.warn('BCV: valor fuera de rango', rate);
      return null;
    }
    return Math.round(rate * 100) / 100;
  } catch (e) {
    logger.warn('BCV fetch falló', e);
    return null;
  }
}

export const updateBcvRate = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    retryCount: 1,
  },
  async () => {
    const rate = await fetchBcvUsdRate();
    const ref = db().collection('rates').doc('bcv');
    if (rate === null) {
      // Fallback: marca la fuente y conserva el último valor (fail-open con flag).
      await ref.set(
        { source: 'fallback', lastAttemptAt: Date.now() },
        { merge: true },
      );
      logger.warn('BCV no disponible: se conserva la última tasa.');
      return;
    }
    await ref.set(
      {
        usdToVes: rate,
        updatedAt: Date.now(),
        source: 'bcv.org.ve',
        lastAttemptAt: Date.now(),
      },
      { merge: true },
    );
    logger.info('BCV actualizada:', rate);
  },
);

export const fnGetBcvRate = onCall(
  { region: 'us-central1', cors: true, maxInstances: 20 },
  async () => {
    const snap = await db().collection('rates').doc('bcv').get();
    if (!snap.exists) throw new HttpsError('not-found', 'Tasa no publicada aún.');
    const data = snap.data()!;
    return {
      usdToVes: Number(data['usdToVes'] ?? 0),
      updatedAt: Number(data['updatedAt'] ?? 0),
      source: String(data['source'] ?? 'fallback'),
    };
  },
);
