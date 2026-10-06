/**
 * Módulo delivery · Notificaciones push (FCM) por cambio de estado (5.5).
 * El token se registra en users/{uid}/fcmTokens/{hash}; las Cloud Functions
 * envían a esos tokens en cada transición. Solo en HTTPS + navegador con soporte.
 *
 * Arquitectura del SW (ronda 5i-h):
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
 *    explícito → mismo token → mismo hash → el doc de fcmTokens siempre coincide.
 */
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';
import { toast } from '@/shared/lib/toast';

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

/** Bandera del puente en primer plano (un solo listener por sesión SPA). */
let foregroundBound = false;

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

/** Enlaza los mensajes en PRIMER PLANO (pestaña enfocada): sin esto, FCM los
 *  descarta en silencio (la notificación del SO solo sale con la pestaña fuera
 *  de foco). Idempotente: un solo listener por sesión de la SPA. */
async function bindForegroundMessages(): Promise<void> {
  if (foregroundBound) return;
  const fb = await loadFirebase();
  if (!fb) return;
  try {
    const { getMessaging, onMessage } = await import('firebase/messaging');
    const messaging = getMessaging(fb.app);
    foregroundBound = true;
    onMessage(messaging, (payload) => {
      const title = payload.notification?.title ?? 'SPOT 24';
      const body = payload.notification?.body ?? '';
      toast.info(body ? `${title} · ${body}` : title);
    });
  } catch (e) {
    logger.warn('FCM: no se pudo enlazar mensajes en primer plano', e);
  }
}

/** Registro del SW de mensajería; de paso activa el puente en primer plano. */
async function getMessagingRegistration(): Promise<ServiceWorkerRegistration | null> {
  void bindForegroundMessages();
  return ensureMessagingSw();
}

/** Pide permiso, obtiene token FCM y lo persiste para el usuario actual. */
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
    const tokenHash = await hashToken(token);
    await setDoc(
      doc(fb.db, 'users', uid, 'fcmTokens', tokenHash),
      { token, createdAt: Date.now(), userAgent: navigator.userAgent.slice(0, 120) },
      { merge: true },
    );
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
    const tokenHash = await hashToken(token);
    await deleteDoc(doc(fb.db, 'users', uid, 'fcmTokens', tokenHash));
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

/** Comprueba si el token del dispositivo ya está registrado para el usuario.
 *  Usa el MISMO registro explícito que enable/disable (NUNCA .ready): garantiza
 *  que el token recalculado y su hash coincidan con el doc ya guardado. */
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
    const tokenHash = await hashToken(token);
    const snap = await getDoc(doc(fb.db, 'users', uid, 'fcmTokens', tokenHash));
    return snap.exists();
  } catch {
    return false;
  }
}