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
  notification: { close(): void; data?: Record<string, unknown> };
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
    // 5.28: los avisos de despacho (aud=dispatch) APILAN por pedido
    // (no se tapan entre sí: el personal ve cada pedido disponible);
    // los del cliente se reemplazan entre sí como siempre (spot24-order).
    const isDispatch = payload.data?.['aud'] === 'dispatch';
    const tag = isDispatch
      ? `spot24-disp-${payload.data?.['orderCode'] ?? ''}`
      : 'spot24-order';
    // 5.28: al tocar un aviso de despacho abre la cola de despacho.
    const clickUrl = isDispatch ? '/admin/despacho' : '/pedidos';
    void sw.registration.showNotification(title, {
      body,
      // Escudo con fondo transparente: se ve el escudo, no un cuadrado.
      icon: '/icons/icon-192.png',
      // El badge de Android exige monocromo blanco+alpha: silueta del escudo.
      badge: '/icons/badge-96.png',
      tag,
      data: { ...payload.data, clickUrl },
    });
  });

  sw.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data?.['clickUrl'] as string) || '/pedidos';
    event.waitUntil(sw.clients.openWindow(url));
  });
} catch {
  // Sin configuración (modo demo): el SW queda inerte sin romper el registro principal.
}