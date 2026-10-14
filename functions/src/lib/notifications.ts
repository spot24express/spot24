/**
 * SPOT 24 · Notificaciones FCM por cambio de estado (5.5) + aviso de
 * despacho al personal (5.28).
 * Voz de marca: afirmativa y corta. Sin datos personales en el payload `data`
 * de los pushes al CLIENTE.
 *
 * Ronda 5.27: el cuerpo del push del cliente abre con el PRIMER NOMBRE del
 * perfil (users/{uid}.name → «Erick, tu pedido va en ruta…»). Lectura
 * best-effort: sin nombre en el perfil sale el texto genérico de siempre.
 *
 * Ronda 5.28 · sendDispatchAlert: cuando un pedido con envío queda PREPARADO,
 * se avisa al personal por push: a los DELIVERY como llamado a la acción
 * («Tómalo desde el panel») y a gerencia/admin a manera informativa
 * («Disponible en el panel») — SOLO el delivery puede tomarlo; la reasignación
 * es de gerencia/admin. El aviso lleva código + zona (nada de dirección,
 * teléfono ni PII del cliente: el detalle completo vive en el panel).
 *
 * Ronda 5.42 · historial: el título/cuerpo viajan en `data` y el display vive
 * en el SW (aquella vez se QUITÓ el bloque notification por dobles — la causa
 * real era el SDK de FCM DENTRO del SW, que la ronda 5.45 eliminó por completo).
 *
 * Ronda 5.66 · URGENCIA ALTA: headers { TTL: '86400', Urgency: 'high' } — FCM
 * marca los mensajes SOLO-DATA con urgencia «normal» por defecto y Chrome
 * posterga la entrega en teléfonos en reposo (Doze / optimización de batería).
 * «high» despierta el dispositivo YA (misma semántica RFC 8030 que chat/ride).
 *
 * Ronda 5.67 · DOBLE VÍA DE ENTREGA (garantía del dueño: «que llegue y suene
 * SIEMPRE, a quien le corresponda, con datos o wifi»): el payload vuelve a
 * llevar `webpush.notification` — el globo NATIVO que Chrome pinta aunque el
 * service worker NO despierte. Reparto de responsabilidades:
 *   · Vía 1 (SW): el handler `push` de /firebase-messaging-sw.js pinta el
 *     globo nuestro con icono/badge/tag/destino completos (control total).
 *   · Vía 2 (nativa): si el SW está estrangulado (batería, app dormida), el
 *     propio Chrome muestra el globo desde `webpush.notification` SIN el SW.
 *     Al tocarlo dispara `notificationclick` en el SW con
 *     `notification.data.clickUrl` → la ruta de destino es idéntica en ambas
 *     vías.
 *   · ANTI-DOBLES: ambas vías usan LA MISMA `tag` (spot24-order /
 *     spot24-disp-{código}). Con mismo origen + misma tag, un globo REEMPLAZA
 *     al otro: es imposible apilar dos. (Los dobles de 5.42 venían del SDK de
 *     FCM dentro del SW — eliminado en 5.45; no de este bloque.)
 *   · SIEMPRE SUENA: renotify:true en la vía nativa → cada push vuelve a
 *     alertar aunque reemplace al globo anterior del mismo tag; silent:false +
 *     vibrate [200,80,200] → sonido + vibración en el perfil estándar Android.
 *   · ICONOS ABSOLUTOS: la vía nativa puede pintar sin SW despierto, así que
 *     el icono/badge van con URL absoluta (cero ambigüedad de resolución).
 *
 * Ronda 5.71 · EL CAJERO ENTRA AL MAPA («no dejes a nadie por fuera»):
 *   · sendPaymentReviewAlert: cada pedido que entra a la cola de verificación
 *     avisa al personal de PAGOS (cajero + gerente/admin — todos pueden
 *     verificar según payments.ts) con el globo «Pago por verificar» →
 *     /admin/pagos. Si el cajero no está, gerencia lo ve igual.
 *   · sendDispatchAlert: el CAJERO se suma al informativo de despacho (el
 *     código YA le permite tomar pedidos: dispatch.ts lo admite). Delivery
 *     conserva el llamado a la acción exclusivo.
 *   · Tag propia por aviso (spot24-pagos-{código}) y clickUrl propio
 *     (/admin/pagos), espejados en el SW y en test-notificaciones.mjs.
 */
import admin from 'firebase-admin';

const db = () => admin.firestore();

/** Origen público del sitio (iconos/badge absolutos para la vía nativa 5.67). */
const SITE_ORIGIN = 'https://spot24express.netlify.app';
const NOTIF_ICON = `${SITE_ORIGIN}/icons/icon-192.png`;
const NOTIF_BADGE = `${SITE_ORIGIN}/icons/badge-96.png`;

const MESSAGES: Record<string, { title: string; body: string }> = {
  pendiente: { title: 'SPOT 24 · Pedido registrado', body: 'Sube tu comprobante para seguir. Para. Resuelve. Sigue.' },
  en_verificacion: { title: 'SPOT 24 · Verificando pago', body: 'Tu pago está en revisión. Te avisamos al confirmar.' },
  pagado: { title: 'SPOT 24 · Pago confirmado', body: 'Tu pedido entra al pit stop. Preparado en breve.' },
  preparado: { title: 'SPOT 24 · Pedido preparado', body: 'Empacado y listo. Sale de la bahía pronto.' },
  en_camino: { title: 'SPOT 24 · En camino', body: 'Tu pedido va en ruta. Síguelo en vivo desde la app.' },
  entregado: { title: 'SPOT 24 · Entregado', body: 'Entregado. Abierto cuando importa.' },
  cancelado: { title: 'SPOT 24 · Pedido cancelado', body: 'Tu pedido fue cancelado. Cuando quieras, aquí estamos.' },
};

/** 5.28 · Aviso de despacho (pedido con envío marcado PREPARADO). */
const DISPATCH_TITLE = 'SPOT 24 · Pedido listo para salir';

/** 5.71 · Aviso de pagos (pedido nuevo en la cola de verificación). */
const PAYMENT_TITLE = 'SPOT 24 · Pago por verificar';

/** 5.67 · Tag de apilado — IDÉNTICA a la del SW (misma tag ⇒ nunca se apilan
 *  la vía nativa y la vía SW; se reemplazan entre sí). 5.71: los avisos de
 *  despacho apilan POR PEDIDO (spot24-disp-{código}) y los de pagos también
 *  (spot24-pagos-{código}); los del cliente se reemplazan entre sí
 *  (spot24-order). */
function buildTag(d: Record<string, string>): string {
  if (d['aud'] === 'dispatch') return `spot24-disp-${d['orderCode'] ?? ''}`;
  if (d['aud'] === 'pagos') return `spot24-pagos-${d['orderCode'] ?? ''}`;
  return 'spot24-order';
}

/** 5.67 · Destino al tocar — IDÉNTICO al del SW, dentro de notification.data
 *  para que también funcione en el globo pintado sin SW. 5.71: los avisos de
 *  pagos abren la cola de aprobación del cajero. */
function buildClickUrl(d: Record<string, string>): string {
  if (d['aud'] === 'dispatch') return '/admin/despacho';
  if (d['aud'] === 'pagos') return '/admin/pagos';
  return '/pedidos';
}

/** Token FCM + referencia de su doc (para borrar los muertos al fallar). */
interface TokenRef {
  token: string;
  ref: admin.firestore.DocumentReference;
}

/** Primer nombre del perfil (una palabra, máx 24 chars). '' si no existe. */
async function firstDisplayName(uid: string): Promise<string> {
  try {
    const snap = await db().collection('users').doc(uid).get();
    const raw = String(snap.data()?.['name'] ?? '').trim();
    if (!raw) return '';
    const first = raw.split(/\s+/)[0];
    return first ? first.slice(0, 24) : '';
  } catch {
    return ''; // lectura fallida: el push sale igual, con texto genérico
  }
}

/** Tokens del personal con cualquiera de los roles dados (5.28).
 *  Consulta `role in [...]` (un solo campo: sin índice compuesto) y luego
 *  lee la subcolección fcmTokens de cada uno (acotada a 20 por usuario). */
async function tokenRefsForRoles(roles: readonly string[]): Promise<TokenRef[]> {
  const refs: TokenRef[] = [];
  try {
    const users = await db().collection('users').where('role', 'in', [...roles]).get();
    await Promise.all(
      users.docs.map(async (u) => {
        const toks = await u.ref.collection('fcmTokens').limit(20).get();
        toks.docs.forEach((t) => {
          const token = String(t.data()['token'] ?? '');
          if (token) refs.push({ token, ref: t.ref });
        });
      }),
    );
  } catch {
    return []; // fallo de consulta: el aviso se omite, la operación sigue
  }
  return refs;
}

/** Multicast común (5.67: doble vía + urgencia alta + TTL 24 h) y limpieza de
 *  tokens muertos. Best-effort: cualquier fallo queda atrapado y jamás
 *  interrumpe la operación principal que lo disparó. */
async function sendAndCleanup(
  refs: TokenRef[],
  title: string,
  body: string,
  data: Record<string, string>,
): Promise<void> {
  if (refs.length === 0) return;
  try {
    const { getMessaging } = await import('firebase-admin/messaging');
    const messaging = getMessaging();
    const tag = buildTag(data);
    const batch = await messaging.sendEachForMulticast({
      tokens: refs.map((r) => r.token),
      // title/body viajan en `data`: el SW los usa para pintar (vía 1) y el
      // ruteo de negocio (aud/status/orderCode/zone) va para la app.
      data: { ...data, title, body },
      webpush: {
        // 5.66 · Urgencia high: Chrome despierta el teléfono YA (Doze-proof).
        headers: { TTL: '86400', Urgency: 'high' },
        // 5.67 · Vía 2 (respaldo): globo NATIVO que Chrome pinta aunque el SW
        // no despierte. Misma tag que la vía 1 ⇒ nunca se apilan dos globos.
        notification: {
          title,
          body,
          icon: NOTIF_ICON,
          badge: NOTIF_BADGE,
          tag,
          vibrate: [200, 80, 200],
          renotify: true, // cada push vuelve a sonar aunque reemplace al anterior
          silent: false, // sonido explícito (perfil estándar Android)
          requireInteraction: data['aud'] === 'dispatch', // despacho queda fijo hasta tocarlo
          data: { ...data, clickUrl: buildClickUrl(data) }, // destino al tocar (vía nativa)
        },
      },
    });

    // Limpieza: elimina tokens inválidos/unregistrados.
    const removals: Promise<unknown>[] = [];
    batch.responses.forEach((r, i) => {
      const failed = r.success === false && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token');
      if (failed && refs[i]) {
        removals.push(refs[i].ref.delete());
      }
    });
    await Promise.all(removals);
  } catch {
    // Notificación best-effort.
  }
}

export const ORDER_NOTIFICATIONS = {
  /** Envía a todos los tokens registrados del usuario (fan-out acotado a 20). */
  async send(uid: string, orderCode: string, status: string): Promise<void> {
    const msg = MESSAGES[status];
    if (!msg) return;
    try {
      // 5.27 · Apertura personalizada: «Erick, tu pago está en revisión…».
      // Solo se minúsculiza la primera letra del cuerpo cuando HAY nombre
      // (sin nombre el texto queda EXACTO al mapa, como lo prueban los e2e).
      const firstName = await firstDisplayName(uid);
      const base = firstName
        ? `${firstName}, ${msg.body.charAt(0).toLowerCase()}${msg.body.slice(1)}`
        : msg.body;

      const tokensSnap = await db().collection(`users/${uid}/fcmTokens`).limit(20).get();
      if (tokensSnap.empty) return;
      const refs: TokenRef[] = tokensSnap.docs
        .map((d) => ({ token: String(d.data()['token'] ?? ''), ref: d.ref }))
        .filter((r) => r.token);
      if (refs.length === 0) return;

      const body = orderCode ? `${base} (${orderCode})` : base;
      await sendAndCleanup(refs, msg.title, body, {
        status,
        orderCode: orderCode.slice(0, 40),
      });
    } catch {
      // Notificación best-effort: jamás interrumpe la operación principal.
    }
  },

  /** 5.28 · Aviso de despacho: un pedido con envío quedó PREPARADO.
   *  · delivery → «Tómalo desde el panel de despacho.» (llamado a la acción)
   *  · gerente/admin/cajero → «Disponible en el panel de despacho.»
   *    (informativo; tomarlo es EXCLUSIVO del delivery, reasignar del resto.
   *    5.71: el cajero entra al informativo porque el despacho SÍ le permite
   *    tomar pedidos — dispatch.ts lo admite en su matriz de roles)
   *  El cuerpo lleva código + zona para decidir sin abrir la app. */
  async sendDispatchAlert(orderCode: string, zoneName: string): Promise<void> {
    const code = orderCode.slice(0, 40);
    const zone = zoneName.trim().slice(0, 40);
    const lead = zone ? `${code} · Zona ${zone}. ` : `${code} · `;
    try {
      const [delivery, staff] = await Promise.all([
        tokenRefsForRoles(['delivery']),
        tokenRefsForRoles(['gerente', 'admin', 'cajero']),
      ]);
      const data = { aud: 'dispatch', status: 'preparado', orderCode: code, zone };
      // 5.71 · EN CADENA: primero el CTA del delivery (urgente) y detrás el
      // informativo del personal. Sin ráfagas de lecturas concurrentes →
      // llegada predecible y cuota de lecturas en calma (plan gratis).
      await sendAndCleanup(delivery, DISPATCH_TITLE, `${lead}Tómalo desde el panel de despacho.`, data);
      await sendAndCleanup(staff, DISPATCH_TITLE, `${lead}Disponible en el panel de despacho.`, data);
    } catch {
      // Aviso best-effort: jamás interrumpe la operación principal.
    }
  },

  /** 5.71 · Aviso de PAGOS: un pedido entró a la cola de verificación (nace
   *  con comprobante o un legacy subió el suyo). Destinatarios: cajero +
   *  gerente/admin — TODOS pueden verificar (payments.ts) y así nadie queda
   *  fuera si el cajero no está en ese momento. Un solo texto para los tres:
   *  la verificación NO es exclusiva de nadie. El cuerpo lleva el código para
   *  ubicar el pedido sin abrir la app. */
  async sendPaymentReviewAlert(orderCode: string): Promise<void> {
    const code = orderCode.slice(0, 40);
    try {
      const staff = await tokenRefsForRoles(['cajero', 'gerente', 'admin']);
      const data = { aud: 'pagos', status: 'en_verificacion', orderCode: code };
      await sendAndCleanup(staff, PAYMENT_TITLE, `${code}. Revísalo en el panel de pagos.`, data);
    } catch {
      // Aviso best-effort: jamás interrumpe la operación principal.
    }
  },
};