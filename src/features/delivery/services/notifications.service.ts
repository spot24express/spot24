/**
 * Módulo delivery · Notificaciones push (FCM) por cambio de estado (5.5).
 * El token se registra en users/{uid}/fcmTokens/{hash}; las Cloud Functions
 * envían a esos tokens en cada transición. Solo en HTTPS + navegador con soporte.
 */
import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { logger } from '@/shared/lib/logger';

export async function isPushSupported(): Promise<boolean> {
  return (
    !DEMO_MODE &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(import.meta.env.VITE_FCM_VAPID_KEY)
  );
}

/** Registra (una vez) el SW de mensajería como módulo ESM. */
async function ensureMessagingSw(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/firebase-messaging-sw.js', { type: 'module' });
  } catch (e) {
    logger.warn('No se pudo registrar el SW de mensajería', e);
    return null;
  }
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
    const registration = await ensureMessagingSw();
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
  if (DEMO_MODE) return;
  const fb = await loadFirebase();
  if (!fb) return;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return;
    const messaging = getMessaging(fb.app);
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FCM_VAPID_KEY, serviceWorkerRegistration: registration });
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

/** Comprueba si el token del dispositivo ya está registrado para el usuario. */
export async function hasRegisteredToken(uid: string): Promise<boolean> {
  if (DEMO_MODE) return false;
  const fb = await loadFirebase();
  if (!fb) return false;
  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const messaging = getMessaging(fb.app);
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: import.meta.env.VITE_FCM_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return false;
    const tokenHash = await hashToken(token);
    const snap = await getDoc(doc(fb.db, 'users', uid, 'fcmTokens', tokenHash));
    return snap.exists();
  } catch {
    return false;
  }
}
