/**
 * Módulo delivery · Notificaciones push (FCM) por cambio de estado (5.5).
 * El token se registra en users/{uid}/fcmTokens; las Cloud Functions
 * envían a esos tokens en cada transición. Solo en HTTPS + navegador con soporte.
 *
 * Arquitectura del SW (ronda 5i-h; display 5.45):
 *  · PROD → /firebase-messaging-sw.js registrado con scope /firebase-messaging/
 *    (requiere la cabecera Service-Worker-Allowed: / en netlify.toml). Scope
 *    PROPIO para NO pisar al SW de la PWA (/): dos registros con el mismo scope
 *    se reemplazan mutuamente (ping-pong sw.js ↔ messaging) y rompen el precache.
 *  · DEV → el dev server de Vite NO materializa las entradas de rollup, así que
 *    se registra el módulo fuente /src/firebase-messaging-sw.ts (Vite lo sirve
 *    transformado). Su scope por defecto es /src/ y Vite no emite
 *    Service-Worker-Allowed: el push NO necesita cubrir páginas (el evento push
 *    despierta al SW dueño de la suscripción sea cual sea su scope).
 *  · El estado de «Mi cuenta» NUNCA usa navigator.serviceWorker.ready (se cuelga
 *    si el scope no cubre la página): todos los caminos usan el MISMO registro
 *    explícito → mismo token → mismo doc.
 *  · 5.45 · DISPLAY EXCLUSIVO DEL SW (decisión del dueño: globo SIEMPRE, aun
 *    con la app abierta y enfocada): la página ya NO escucha onMessage ni
 *    muestra toast — el SW pinta el globo ante cada push. Aquí solo se gestiona
 *    el ciclo de vida del token (registrar / verificar / borrar).
 *
 * 5.72 · UN TOKEN POR DISPOSITIVO (mandato del dueño: a nadie le llegan
 *        globos de más — solo los que le corresponden):
 *  · El doc ya NO se identifica por hash(token) sino por un deviceId estable
 *    (UUID guardado en localStorage). Re-registrar el MISMO navegador
 *    SOBRESCRIBE su doc: cero acumulación de huérfanos hacia adelante.
 *  · MIGRACIÓN SILENCIOSA: si el token actual todavía vive bajo un doc legacy
 *    (esquema hash), al verificar/activar se escribe el doc por deviceId y se
 *    borran los legacy que contengan el MISMO token. El usuario no re-activa
 *    nada y no existe ventana muda: primero se escribe el doc nuevo y después
 *    se borran los viejos.
 *  · Si el navegador rotó el token (actualización de Chrome, limpieza de datos),
 *    la verificación detecta el doc del dispositivo con token viejo y lo
 *    REESCRIBE con el vigente (self-healing) — el dispositivo vuelve solo.
 *  · Si localStorage no está disponible (privacidad extrema), el doc cae al
 *    esquema legacy (hash del token): el registro NUNCA se rompe.
 *  · Los huérfanos de suscripciones VIEJAS (tokens distintos al actual) no son
 *    identificables ni por el cliente ni por FCM: siguen la vida que les queda
 *    hasta que FCM los rechace y la poda reactiva (5.67) los elimine.
 *  · Las reglas de fcmTokens exigen solo el campo `token` (hasAll) — deviceId,
 *    schema y updatedAt caben sin tocar firestore.rules.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';

export async function isPushSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(import.meta.env.VITE_FCM_VAPID_KEY)
  );
}

/** URL del SW de mensajería según entorno (ver cabecera del archivo). */
const MESSAGING_SW_URL = import.meta.env.DEV
  ? '/src/firebase-messaging-sw.ts'
  : '/firebase-messaging-sw.js';

const MESSAGING_SW_OPTIONS: RegistrationOptions = import.meta.env.DEV
  ? { type: 'module' }
  : { type: 'module', scope: '/firebase-messaging/' };

/** Registro cacheado: el mismo para registrar token, verificarlo y borrarlo. */
let swRegPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/** Registra (una vez) el SW de mensajería como módulo ESM. */
async function ensureMessagingSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  if (!swRegPromise) {
    swRegPromise = navigator.serviceWorker
      .register(MESSAGING_SW_URL, MESSAGING_SW_OPTIONS)
      .catch((e: unknown) => {
        logger.warn('No se pudo registrar el SW de mensajería', e);
        swRegPromise = null; // permitir reintento en la próxima llamada
        return null;
      });
  }
  return swRegPromise;
}

/** Registro del SW de mensajería. La página solo gestiona el token: el
 *  display de los avisos vive por completo dentro del SW (5.45). */
async function getMessagingRegistration(): Promise<ServiceWorkerRegistration | null> {
  return ensureMessagingSw();
}

/* ── 5.72 · Identidad estable del dispositivo ──────────────────────────── */

const DEVICE_ID_KEY = 'spot24-fcm-device-id';

/** UUID v4 con degradación elegante: crypto.randomUUID → getRandomValues →
 *  tiempo+azar. Nunca debe fallar la creación de una identidad. */
function newDeviceId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const b = crypto.getRandomValues(new Uint8Array(16));
      b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
      b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
      const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  } catch {
    /* caer al último recurso */
  }
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Lee (o crea) la identidad del navegador. null = localStorage bloqueado. */
function readOrCreateDeviceId(): string | null {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing) return existing;
    const id = newDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return null; // localStorage bloqueado → fallback al esquema legacy (hash)
  }
}

/** Doc de ESTE dispositivo: deviceId estable; si localStorage falla, hash del
 *  token (esquema legacy) — el registro nunca queda sin destino. */
async function tokenDocId(token: string): Promise<string> {
  const dbKey = readOrCreateDeviceId();
  if (dbKey) return dbKey;
  return hashToken(token);
}

/** Escribe el doc de este dispositivo y limpia los docs legacy que contengan
 *  el MISMO token (5.72). Orden garantizado: primero se escribe el doc nuevo,
 *  después se borran los viejos — en ningún paso el dispositivo queda mudo. */
async function upsertTokenDoc(uid: string, token: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new Error('Firebase no disponible');
  const deviceId = readOrCreateDeviceId();
  const docId = deviceId ?? (await hashToken(token));
  const ref = doc(fb.db, 'users', uid, 'fcmTokens', docId);
  const existing = await getDoc(ref);
  const now = Date.now();
  await setDoc(
    ref,
    {
      token,
      userAgent: navigator.userAgent.slice(0, 120),
      deviceId: deviceId ?? '',
      schema: 'v2-device',
      ...(existing.exists() ? {} : { createdAt: now }),
      updatedAt: now,
    },
    { merge: true },
  );
  // Migración: docs legacy (esquema hash) que contengan este MISMO token.
  const legacySnap = await getDocs(
    query(collection(fb.db, 'users', uid, 'fcmTokens'), where('token', '==', token)),
  );
  const stale = legacySnap.docs.filter((d) => d.id !== docId);
  if (stale.length === 0) return;
  const batch = writeBatch(fb.db);
  for (const d of stale) batch.delete(d.ref);
  await batch.commit();
}

/** Borra el doc de este dispositivo y cualquier legacy con el mismo token
 *  (toggle apagado = el dispositivo queda limpio por completo). */
async function removeTokenDoc(uid: string, token: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) return;
  const docId = await tokenDocId(token);
  await deleteDoc(doc(fb.db, 'users', uid, 'fcmTokens', docId));
  const legacySnap = await getDocs(
    query(collection(fb.db, 'users', uid, 'fcmTokens'), where('token', '==', token)),
  );
  const stale = legacySnap.docs.filter((d) => d.id !== docId);
  if (stale.length === 0) return;
  const batch = writeBatch(fb.db);
  for (const d of stale) batch.delete(d.ref);
  await batch.commit();
}

/** Pide permiso, obtiene token FCM y lo persiste para el usuario actual
 *  (5.72: doc por dispositivo + migración silenciosa de legacy). */
export async function enableOrderNotifications(uid: string): Promise<boolean> {
  if (!(await isPushSupported())) return false;
  const fb = await loadFirebase();
  if (!fb) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const messaging = getMessaging(fb.app);
    const registration = await getMessagingRegistration();
    if (!registration) return false;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;
    await upsertTokenDoc(uid, token);
    return true;
  } catch (e) {
    logger.warn('FCM: no se pudo registrar token', e);
    return false;
  }
}

export async function disableOrderNotifications(uid: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) return;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;
    const messaging = getMessaging(fb.app);
    const registration = await getMessagingRegistration();
    if (!registration) return;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;
    await removeTokenDoc(uid, token);
  } catch (e) {
    logger.warn('FCM: no se pudo eliminar token', e);
  }
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 40);
}

/** Comprueba si este dispositivo ya está registrado para el usuario (5.72).
 *  Usa el MISMO registro explícito que enable/disable (NUNCA .ready).
 *  Además REFRESCA en silencio: si el doc del dispositivo existe con un token
 *  ya rotado por el navegador, se reescribe con el vigente (self-healing); si
 *  solo existe un doc legacy (hash) con este token, se migra al esquema nuevo.
 *  En ambos casos el toggle del usuario no cambia y el dispositivo no queda
 *  mudo en ningún paso. */
export async function hasRegisteredToken(uid: string): Promise<boolean> {
  const fb = await loadFirebase();
  if (!fb) return false;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const messaging = getMessaging(fb.app);
    const registration = await getMessagingRegistration();
    if (!registration) return false;
    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return false;
    const docId = await tokenDocId(token);
    const snap = await getDoc(doc(fb.db, 'users', uid, 'fcmTokens', docId));
    if (snap.exists() && String(snap.data()['token'] ?? '') === token) return true;
    // El doc del dispositivo no existe (o quedó con un token rotado): re-registrar
    // con el token vigente. El permiso ya fue concedido por el usuario en ESTE
    // navegador — restaurar el registro es exactamente su intención declarada.
    await upsertTokenDoc(uid, token);
    return true;
  } catch (e) {
    logger.warn('FCM: no se pudo verificar el token', e);
    return false;
  }
}