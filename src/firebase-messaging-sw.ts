/**
 * SPOT 24 · Service worker de Firebase Cloud Messaging (module ESM).
 * Entrada separada de Vite: se emite como /firebase-messaging-sw.js sin hash.
 * La config de Firebase se inyecta en build time desde variables VITE_*
 * (config pública de web, nunca credenciales privadas).
 */
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

/** Tipado mínimo del scope del SW (evita depender de lib.webworker). */
interface SwScope {
  registration: {
    showNotification(title: string, options?: NotificationOptions): Promise<void>;
  };
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(type: 'notificationclick', cb: (e: NotificationEventLike) => void): void;
}
interface NotificationEventLike {
  notification: { close(): void };
  waitUntil(p: Promise<unknown>): void;
}
const sw = self as unknown as SwScope;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

try {
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);

  onBackgroundMessage(messaging, (payload) => {
    const title = payload.notification?.title ?? 'SPOT 24';
    const body = payload.notification?.body ?? 'Tu pedido cambió de estado. Abierto cuando importa.';
    void sw.registration.showNotification(title, {
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'spot24-order',
      data: payload.data ?? {},
    });
  });

  sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(sw.clients.openWindow('/pedidos'));
  });
} catch {
  // Sin configuración (modo demo): el SW queda inerte sin romper el registro principal.
}
