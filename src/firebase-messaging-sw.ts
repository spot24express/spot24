/**
 * SPOT 24 · Service worker de mensajería push (module ESM, SIN dependencias).
 * Entrada separada de Vite: se emite como /firebase-messaging-sw.js sin hash.
 *
 * 5.45 · GLOBO SIEMPRE (decisión del dueño): el aviso del sistema sale aun con
 * la app abierta y enfocada — ya no existe el toast interno.
 *  · Antes (5.42): FCM SDK dentro del SW (onBackgroundMessage) + puente
 *    onMessage en la página. Con pestaña VISIBLE el SDK reenviaba el mensaje a
 *    la página (toast) y NO pintaba globo; en background pintaba globo. Además
 *    el SW arrastraba los chunks vendor del build (firebase-vendor + vendor).
 *  · Ahora: handler `push` PROPIO que pinta el globo SIEMPRE, sin importar el
 *    estado de las pestañas. Una sola vía de display con el mismo icono, badge,
 *    tag de apilado y destino al tocar, venga la app como venga.
 *  · Cero imports de firebase en el SW: despierta en milisegundos ante cada
 *    push y deja de depender de los nombres con hash de los chunks de la app
 *    (un deploy nuevo ya no puede romper los imports del SW).
 *
 * 5.50 · FILTRO DE EMPUJES VACÍOS (fix «Tu pedido cambió de estado» sin
 * nombre ni información): FCM manda empujes de mantenimiento SIN contenido
 * (latidos/probes) que el SDK descartaba en silencio — getMessagePayloadInternal
 * devuelve null y el SDK hace «skip handling the push». Nuestro handler propio
 * los pintaba como globo GENÉRICO de marca (título «SPOT 24» + cuerpo «Tu
 * pedido cambió de estado…») → parecían notificaciones de pedido «sin nombre y
 * sin información». Ahora: push sin payload, no-JSON o sin title/body →
 * SILENCIO, igual que hacía el SDK. Los avisos REALES (data.title/body desde
 * las functions, con nombre del cliente + código de pedido) no se tocan.
 *
 * El payload es SOLO-DATA (5.42): title/body viajan en `data`. Parseo
 * defensivo por capas: (1) sobre FCM estándar { data: {...} }, (2) datos
 * planos en la raíz (variante de transporte), (3) bloque `notification` de
 * payloads viejos que aún estén en cola.
 */

/** Tipado mínimo del scope del SW (evita depender de lib.webworker). */
interface SwScope {
  registration: {
    showNotification(title: string, options?: NotificationOptions): Promise<void>;
  };
  clients: { openWindow(url: string): Promise<unknown> };
  addEventListener(type: 'push', cb: (e: PushEventLike) => void): void;
  addEventListener(type: 'notificationclick', cb: (e: NotificationEventLike) => void): void;
}
interface PushEventLike {
  data: { json(): unknown } | null;
  waitUntil(p: Promise<unknown>): void;
}
interface NotificationEventLike {
  notification: { close(): void; data?: Record<string, unknown> };
  waitUntil(p: Promise<unknown>): void;
}
const sw = self as unknown as SwScope;

/** Sobre crudo de un push de FCM: `data` + (opcional) `notification` heredada. */
interface PushEnvelope {
  data?: Record<string, string>;
  notification?: { title?: string; body?: string };
  [k: string]: unknown;
}

/** 5.28: los avisos de despacho (aud=dispatch) APILAN por pedido (no se tapan
 *  entre sí: el personal ve cada pedido disponible); los del cliente se
 *  reemplazan entre sí como siempre (spot24-order). */
function buildTag(d: Record<string, string>): string {
  return d['aud'] === 'dispatch' ? `spot24-disp-${d['orderCode'] ?? ''}` : 'spot24-order';
}

/** 5.28: al tocar un aviso de despacho abre la cola de despacho. */
function buildClickUrl(d: Record<string, string>): string {
  return d['aud'] === 'dispatch' ? '/admin/despacho' : '/pedidos';
}

/** 5.50 · Extrae (title, body) del sobre del push con las 3 formas conocidas,
 *  o null si el push NO trae contenido (latido/probe de FCM → silencio). */
function extractContent(envelope: PushEnvelope): { title: string; body: string; d: Record<string, string> } | null {
  // (1) Contrato del SDK: los datos viven en envelope.data.
  // (2) Defensa: sin `data`, acepta la raíz plana (title/body directo).
  const d: Record<string, string> = (envelope?.data ?? envelope ?? {}) as Record<string, string>;
  const title = d['title'] ?? envelope?.notification?.title ?? '';
  const body = d['body'] ?? envelope?.notification?.body ?? '';
  // Push vacío (sin title y sin body): latido/probe de FCM — NO pintar globo.
  if (!title && !body) return null;
  return { title, body, d };
}

/** Pinta el globo SIEMPRE (sea cual sea el estado de las pestañas)… si el
 *  push trae contenido. Los vacíos se descartan como hacía el SDK (5.50). */
async function showPushNotification(event: PushEventLike): Promise<void> {
  // Sin data en el evento: push de mantenimiento de FCM → silencio.
  if (!event.data) return;
  let envelope: PushEnvelope;
  try {
    envelope = event.data.json() as PushEnvelope;
  } catch {
    return; // payload no-JSON: no es un aviso de SPOT 24 → silencio
  }
  const content = extractContent(envelope ?? {});
  if (!content) return;
  await sw.registration.showNotification(content.title || 'SPOT 24', {
    body: content.body || 'Abierto cuando importa.',
    // Escudo con fondo transparente: se ve el escudo, no un cuadrado.
    icon: '/icons/icon-192.png',
    // El badge de Android exige monocromo blanco+alpha: silueta del escudo.
    badge: '/icons/badge-96.png',
    tag: buildTag(content.d),
    data: { ...content.d, clickUrl: buildClickUrl(content.d) },
  });
}

sw.addEventListener('push', (event) => {
  // userVisibleOnly: Chrome exige una notificación visible por cada push —
  // se cumple para TODO push con contenido real (los vacíos de FCM no
  // cuentan: el SDK tampoco los mostraba).
  event.waitUntil(showPushNotification(event));
});

sw.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data?.['clickUrl'] as string) || '/pedidos';
  event.waitUntil(sw.clients.openWindow(url));
});