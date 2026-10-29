/**
 * SPOT 24 · Notificaciones FCM por cambio de estado (5.5) + aviso de
 * despacho al personal (5.28) + aviso de pagos al cajero (5.71).
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
 * Ronda 5.42 · PAYLOAD SOLO-DATA en `data`: title/body viajan en `data` para
 * que el SW (onBackgroundMessage) pinte el globo con control total.
 *
 * Ronda 5.67 · DOBLE VÍA DE ENTREGA (garantía del dueño: «siempre en cualquier
 * escenario debe sonar y llegar la NOTIFICACIÓN»): cada mensaje lleva
 * TAMBIÉN `webpush.notification` — el globo NATIVO que Chrome pinta aunque el
 * SW no despierte (teléfono en reposo / Chrome estrangulado). La MISMA `tag`
 * viaja en el bloque nativo y la usa el SW: las dos vías se REEMPLAZAN entre
 * sí (mismo origen + misma tag) → nunca se apilan dos globos, y el sonido lo
 * lleva la nativa (renotify:true) → EXACTAMENTE un aviso sonoro por push.
 * El clickUrl del destino viaja en `data` (el globo nativo lo hereda en
 * notification.data y el SW lo usa en notificationclick).
 *
 * Ronda 5.71 · EL CAJERO ENTRA AL MAPA (decisión del dueño: «suma al cajero»):
 *  · sendPaymentReviewAlert(orderCode): «Pago por verificar» al CAJERO (con
 *    gerencia/admin como respaldo) cada vez que un pedido entra a la cola de
 *    verificación — al crearse con comprobante (createOrder) o al subir el
 *    cliente el comprobante de un pedido legacy «pendiente» (uploadReceipt).
 *  · sendDispatchAlert: el cajero se suma al informativo de despacho (mismo
 *    aviso que gerencia/admin); el CTA «Tómalo…» sigue siendo EXCLUSIVO del
 *    delivery.
 *  · CADENA de envíos (fix de estabilidad del emulador): primero el aviso de
 *    despacho (delivery debe enterarse YA) y detrás el informativo del
 *    personal; en orders.ts igual: globo del cliente primero y detrás el
 *    aviso de pagos — sin ráfagas de lecturas concurrentes.
 *
 * Ronda 5.73-j · URGENCIA ALTA EN LA VÍA NATIVA (diagnóstico de campo del
 * dueño: «con la pantalla encendida le llega; con la pantalla apagada solo
 * llega cuando la despierto»): el push viajaba SIN el encabezado de urgencia
 * → Chrome lo entrega con urgencia «normal» y Android lo difiere en Doze
 * (pantalla apagada) hasta que el dueño del teléfono despierta el equipo.
 * Ahora TODOS los envíos llevan `Urgency: high` (RFC 8030): el push service
 * despierta el dispositivo y el globo llega —y suena— AUNQUE la pantalla
 * esté apagada, que es EL escenario real de un cliente esperando su pedido y
 * del delivery con el teléfono en el bolsillo. Espejo en el script de
 * pruebas del dueño (functions/scripts/test-notificaciones.mjs).
 *
 * Ronda 5.74 · INVENTARIO QUE AVISA (pregunta del dueño: «si quedaban 2
 * artículos y un cliente los compró, ¿el otro cliente no podrá comprar?»):
 *  · La VENTA y la CANCELACIÓN ahora cuadran el stockTotal del producto
 *    (padre) en la MISMA transacción — antes solo bajaba/subía el stock de
 *    la variante y el total del padre quedaba viejo: el catálogo mostraba
 *    stock fantasma hasta que el admin tocara el producto.
 *  · STOCK_NOTIFICATIONS.notifyVariantStock: cuando una variante se AGOTA
 *    (venta o ajuste del panel) o VUELVE (ajuste que la repone), se avisa
 *    SOLO a los clientes que la tienen en su carrito — push accionable y
 *    personal, jamás difusión masiva. Con la app abierta el cambio ya se ve
 *    en vivo (pulso del catálogo); este globo cubre la app CERRADA.
 *  · Tag propia spot24-stock-{producto}-{variante} y destino /carrito
 *    (espejo exacto en el SW 5.74).
 */
import admin from 'firebase-admin';

const db = () => admin.firestore();

const MESSAGES: Record<string, { title: string; body: string }> = {
  pendiente: { title: 'SPOT 24 · Pedido registrado', body: 'Sube tu comprobante para seguir. Para. Resuelve. Sigue.' },
  en_verificacion: { title: 'SPOT 24 · Verificando pago', body: 'Tu pago está en revisión. Te avisamos al confirmar.' },
  pagado: { title: 'SPOT 24 · Pago confirmado', body: 'Tu pedido entra al pit stop. Preparado en breve.' },
  preparado: { title: 'SPOT 24 · Pedido preparado', body: 'Empacado y listo. Sale de la bahía pronto.' },
  en_camino: { title: 'SPOT 24 · En camino', body: 'Tu pedido va en ruta. Síguelo en vivo desde la app.' },
  entregado: { title: 'SPOT 24 · Entregado', body: 'Entregado. Abierto cuando importa.' },
  cancelado: { title: 'SPOT 24 · Pedido cancelado', body: 'Tu pedido fue cancelado. Cuando quieras, aquí estamos.' },
};

/**
 * 5.112.1 · Textos para RETIRO EN TIENDA (pickup): el pedido NO sale por
 * ruta — el cliente pasa por el mostrador. Antes heredaba los textos del
 * envío («Sale de la bahía pronto», «va en ruta») y el dueño los leyó como
 * «el flujo sigue como delivery». Los demás estados comparten texto (son
 * neutrales). Espejo del cliente en customerStatusText (constants/orders).
 */
const MESSAGES_PICKUP: Record<string, { title: string; body: string }> = {
  preparado: { title: 'SPOT 24 · Listo para retirar', body: 'Empacado y listo. Te esperamos en la tienda.' },
  entregado: { title: 'SPOT 24 · Retirado', body: 'Retirado en tienda. ¡Gracias por tu visita!' },
};

/**
 * 5.112.1 · Texto del aviso por estado y modalidad (puro, testeable).
 * pickup gana SOLO donde tiene texto propio; el resto cae al mapa general.
 */
export function textoEstado(
  status: string,
  mode: 'delivery' | 'pickup' = 'delivery',
): { title: string; body: string } | undefined {
  if (mode === 'pickup' && MESSAGES_PICKUP[status]) return MESSAGES_PICKUP[status];
  return MESSAGES[status];
}

/** 5.28 · Aviso de despacho (pedido con envío marcado PREPARADO). */
const DISPATCH_TITLE = 'SPOT 24 · Pedido listo para salir';

/** 5.71 · Aviso de pagos: un pedido entró a la cola de verificación del cajero. */
const PAYMENT_TITLE = 'SPOT 24 · Pago por verificar';

/** 5.74 · Avisos de inventario al dueño del carrito afectado. */
const STOCK_OUT_TITLE = 'SPOT 24 · Se agotó';
const STOCK_BACK_TITLE = 'SPOT 24 · Ya disponible';

/** Iconos de marca para la vía nativa 5.67 (los mismos que pinta el SW). */
const NOTIF_ICON = '/icons/icon-192.png';
const NOTIF_BADGE = '/icons/badge-96.png';

/** Token FCM + referencia de su doc (para borrar los muertos al fallar). */
interface TokenRef {
  token: string;
  ref: admin.firestore.DocumentReference;
}

/** 5.71 · Tag de apilado por familia — ESPEJO EXACTO del SW
 *  (src/firebase-messaging-sw.ts · buildTag): despacho apila por pedido,
 *  pagos apila por pedido y los globos de estado del cliente apilan por
 *  pedido+estado. Con la misma tag, la vía nativa 5.67 y el SW se
 *  reemplazan entre sí en vez de duplicarse.
 *  5.73-f · CAMBIO DE COMPORTAMIENTO (decisión del dueño tras el ensayo de
 *  campo): la tag única «spot24-order» hacía que cada globo del cliente
 *  REEMPLAZARA al anterior («Verificando pago» desaparecía al llegar
 *  «Pago confirmado», este al llegar «Pedido preparado»…) y en la cortina
 *  solo quedaba el ÚLTIMO estado — el dueño lo leyó como «globos que no
 *  llegan». Ahora cada estado lleva tag propia
 *  (spot24-order-{código}-{estado}): TODOS los globos llegan, suenan y
 *  PERMANECEN en la cortina, uno por hito del pedido. */
function buildTag(d: Record<string, string>): string {
  if (d['aud'] === 'dispatch') return `spot24-disp-${d['orderCode'] ?? ''}`;
  if (d['aud'] === 'pagos') return `spot24-pagos-${d['orderCode'] ?? ''}`;
  if (d['aud'] === 'stock') return `spot24-stock-${d['productId'] ?? ''}-${d['variantId'] ?? ''}`;
  return `spot24-order-${d['orderCode'] ?? ''}-${d['status'] ?? ''}`;
}

/** 5.71 · Destino al tocar — ESPEJO EXACTO del SW (buildClickUrl): despacho
 *  abre la cola de despacho, pagos abre la cola de aprobación del cajero y
 *  el cliente cae en sus pedidos. Viaja en `data` para que AMBAS vías
 *  (SW y globo nativo 5.67) abran el mismo sitio. */
function buildClickUrl(d: Record<string, string>): string {
  if (d['aud'] === 'dispatch') return '/admin/despacho';
  if (d['aud'] === 'pagos') return '/admin/pagos';
  if (d['aud'] === 'stock') return '/carrito';
  return '/pedidos';
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

/**
 * 5.90 · Tope del historial in-app por usuario. Cada aviso nuevo drena las
 * más viejas (offset + orderBy de UN campo → sin índices compuestos).
 */
export const NOTIFS_TOPE_POR_USUARIO = 30;

/**
 * 5.90 · HISTORIAL IN-APP del cliente (users/{uid}/notifs): cada aviso de
 * estado queda guardado en la subcolección PRIVADA del usuario para la
 * campana /notificaciones de PC/tablet. El push es efímero (cortina del
 * teléfono) y solo existe si el cliente activó los avisos; el historial es
 * la MEMORIA consultable de la app y la única vía para quien nunca activó
 * push. Escritura EXCLUSIVA del servidor (Admin SDK): las reglas dejan la
 * subcolección en solo-lectura para el dueño. Rotación: conserva las
 * NOTIFS_TOPE_POR_USUARIO más recientes (borra hasta 10 viejas por aviso —
 * con 30 acumulados y aviso por hito de pedido, sobra). Best-effort:
 * cualquier fallo queda atrapado y NO interrumpe el push ni la operación
 * de negocio que lo disparó.
 */
async function guardarNotifEnHistorial(
  uid: string,
  code: string,
  status: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const col = db().collection(`users/${uid}/notifs`);
    await col.add({
      code: code.slice(0, 40),
      status,
      title,
      body,
      createdAtMs: Date.now(),
    });
    // Drena las excedentes más viejas (35 acumulados → borra 5 y quedan 30).
    const viejas = await col
      .orderBy('createdAtMs', 'desc')
      .offset(NOTIFS_TOPE_POR_USUARIO)
      .limit(10)
      .get();
    await Promise.all(viejas.docs.map((d) => d.ref.delete()));
  } catch (e) {
    console.warn('[notificaciones] historial in-app fallido (best-effort)', e);
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
  } catch (e) {
    // 5.73 · Log visible en Netlify: antes este fallo era 100 % silencioso.
    console.warn('[notificaciones] fallo consultando tokens del personal (aviso omitido)', e);
    return [];
  }
  return refs;
}

/** Multicast común (iconos de marca + TTL 24 h) y limpieza de tokens muertos.
 *  Best-effort: cualquier fallo queda atrapado y jamás interrumpe la
 *  operación principal que lo disparó.
 *  5.67 · DOBLE VÍA: además del `data` (vía SW), el bloque
 *  `webpush.notification` pinta el globo NATIVO si el SW no despierta.
 *  Misma tag en ambas vías → se reemplazan, jamás se duplican; renotify:true
 *  pone el aviso sonoro en la nativa (el SW NO re-alerta al reemplazarla). */
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
    // 5.71 · El destino al tocar viaja SIEMPRE en data (el globo nativo lo
    // hereda en notification.data → notificationclick lo usa).
    const fullData: Record<string, string> = { ...data, clickUrl: buildClickUrl(data) };
    const batch = await messaging.sendEachForMulticast({
      tokens: refs.map((r) => r.token),
      // 5.42/5.67 · title/body viajan en `data` (vía SW, control total) Y en
      // el bloque nativo de respaldo (vía Chrome cuando el SW no despierta).
      // Icon y badge idénticos en ambas vías; tag idéntica → se reemplazan.
      data: { ...fullData, title, body },
      webpush: {
        // 5.73-j · TTL 24 h + URGENCIA HIGH (RFC 8030): sin Urgency, Android
        // difiere el globo en Doze (pantalla apagada) hasta despertar el
        // equipo. high despierta el dispositivo: llega y suena SIEMPRE.
        headers: { TTL: '86400', Urgency: 'high' },
        notification: {
          title,
          body,
          icon: NOTIF_ICON,
          badge: NOTIF_BADGE,
          tag: buildTag(data),
          renotify: true,
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
  } catch (e) {
    // 5.73 · Log visible en Netlify: sin esto un fallo de FCM es invisible.
    console.warn('[notificaciones] envío FCM fallido (best-effort)', e);
  }
}

export const ORDER_NOTIFICATIONS = {
  /**
   * Envía a todos los tokens registrados del usuario (fan-out acotado a 20).
   * 5.112.1 · `mode` ajusta el texto a la modalidad (pickup: «Listo para
   * retirar» / «Retirado»). Default 'delivery': los envíos actuales y TODOS
   * los llamadores existentes conservan el texto de siempre.
   */
  async send(
    uid: string,
    orderCode: string,
    status: string,
    mode: 'delivery' | 'pickup' = 'delivery',
  ): Promise<void> {
    const msg = textoEstado(status, mode);
    if (!msg) return;
    try {
      // 5.27 · Apertura personalizada: «Erick, tu pago está en revisión…».
      // Solo se minúsculiza la primera letra del cuerpo cuando HAY nombre
      // (sin nombre el texto queda EXACTO al mapa, como lo prueban los e2e).
      const firstName = await firstDisplayName(uid);
      const base = firstName
        ? `${firstName}, ${msg.body.charAt(0).toLowerCase()}${msg.body.slice(1)}`
        : msg.body;
      const body = orderCode ? `${base} (${orderCode})` : base;

      // 5.90 · El aviso entra al HISTORIAL IN-APP SIEMPRE (con o sin tokens
      // de push) ANTES del gate de tokens: la campana /notificaciones de
      // PC/tablet lo muestra aunque el cliente jamás haya activado los
      // avisos del teléfono. Best-effort: si falla, el push sigue igual.
      await guardarNotifEnHistorial(uid, orderCode, status, msg.title, body);

      const tokensSnap = await db().collection(`users/${uid}/fcmTokens`).limit(20).get();
      if (tokensSnap.empty) return;
      const refs: TokenRef[] = tokensSnap.docs
        .map((d) => ({ token: String(d.data()['token'] ?? ''), ref: d.ref }))
        .filter((r) => r.token);
      if (refs.length === 0) return;

      await sendAndCleanup(refs, msg.title, body, {
        status,
        orderCode: orderCode.slice(0, 40),
      });
    } catch (e) {
      // 5.73 · Log visible en Netlify (best-effort: jamás interrumpe la operación).
      console.warn('[notificaciones] push de estado fallido (best-effort)', e);
    }
  },

  /** 5.28 · Aviso de despacho: un pedido con envío quedó PREPARADO.
   *  · delivery → «Tómalo desde el panel de despacho.» (llamado a la acción)
   *  · gerente/admin/cajero (5.71) → «Disponible en el panel de despacho.»
   *    (informativo; tomarlo es EXCLUSIVO del delivery, reasignar de
   *    gerencia/admin)
   *  El cuerpo lleva código + zona para decidir sin abrir la app.
   *  5.71 · EN CADENA: primero el CTA del delivery (debe enterarse YA) y
   *  detrás el informativo del personal — sin ráfagas de lecturas
   *  concurrentes → orden de llegada predecible. */
  async sendDispatchAlert(orderCode: string, zoneName: string): Promise<void> {
    const code = orderCode.slice(0, 40);
    const zone = zoneName.trim().slice(0, 40);
    const lead = zone ? `${code} · Zona ${zone}. ` : `${code} · `;
    try {
      const data = { aud: 'dispatch', status: 'preparado', orderCode: code, zone };
      const delivery = await tokenRefsForRoles(['delivery']);
      await sendAndCleanup(delivery, DISPATCH_TITLE, `${lead}Tómalo desde el panel de despacho.`, data);
      const staff = await tokenRefsForRoles(['gerente', 'admin', 'cajero']);
      await sendAndCleanup(staff, DISPATCH_TITLE, `${lead}Disponible en el panel de despacho.`, data);
    } catch (e) {
      // 5.73 · Log visible en Netlify (best-effort: jamás interrumpe la operación).
      console.warn('[notificaciones] push de personal fallido (best-effort)', e);
    }
  },

  /** 5.71 · «Pago por verificar»: un pedido entró a la cola de verificación.
   *  VA AL CAJERO (con gerencia/admin como respaldo): es el rol que aprueba
   *  o rechaza el pago en /admin/pagos. El cuerpo lleva el código para
   *  cotejar la referencia sin abrir la app; el detalle (comprobante, monto,
   *  datos del pagador) vive en el panel. */
  async sendPaymentReviewAlert(orderCode: string): Promise<void> {
    const code = orderCode.slice(0, 40);
    try {
      const staff = await tokenRefsForRoles(['cajero', 'gerente', 'admin']);
      await sendAndCleanup(staff, PAYMENT_TITLE, `${code}. Revísalo en el panel de pagos.`, {
        aud: 'pagos',
        status: 'en_verificacion',
        orderCode: code,
      });
    } catch (e) {
      // 5.73 · Log visible en Netlify (best-effort: jamás interrumpe la operación).
      console.warn('[notificaciones] push de personal fallido (best-effort)', e);
    }
  },
};

/**
 * 5.74 · Carritos que contienen UNA variante concreta (productId+variantId).
 * Firestore NO puede consultar dentro de arrays de mapas: se escanea la
 * colección (tope 500 docs — un negocio de barrio queda muy por debajo) y
 * se filtra en código. Coste: 1 consulta por evento de stock.
 */
async function cartUidsWithVariant(
  productId: string,
  variantId: string,
  excludeUid?: string,
): Promise<string[]> {
  const snap = await db().collection('carts').limit(500).get();
  const uids: string[] = [];
  for (const d of snap.docs) {
    if (excludeUid && d.id === excludeUid) continue; // el comprador ya sabe
    const items = d.data()['items'];
    if (!Array.isArray(items)) continue;
    const hit = items.some(
      (it: Record<string, unknown>) =>
        String(it?.['productId'] ?? '') === productId && String(it?.['variantId'] ?? '') === variantId,
    );
    if (hit) uids.push(d.id);
  }
  return uids;
}

/**
 * 5.74 · Avisos de inventario al dueño del carrito (agotado / volvió).
 * Push ACCIONABLE y PERSONAL: solo llega a quien tiene la variante en el
 * carrito — nunca difusión masiva (los cambios del catálogo se ven en vivo
 * con la app abierta vía el pulso onSnapshot; este globo cubre la cerrada).
 * EN CADENA uid por uid (mismo criterio de estabilidad 5.71). Best-effort:
 * cualquier fallo queda atrapado y jamás interrumpe la venta/cancelación
 * que lo disparó.
 */
export const STOCK_NOTIFICATIONS = {
  async notifyVariantStock(
    productId: string,
    variantId: string,
    opts: { back: boolean; name?: string; excludeUid?: string },
  ): Promise<void> {
    const pid = String(productId ?? '').trim().slice(0, 120);
    const vid = String(variantId ?? '').trim().slice(0, 140);
    if (!pid || !vid) return;
    const name = String(opts?.name ?? '').replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 80);
    const display = name || 'Un producto de tu carrito';
    const title = opts?.back ? STOCK_BACK_TITLE : STOCK_OUT_TITLE;
    const body = opts?.back
      ? `«${display}» volvió a stock y lo sigues teniendo en tu carrito.`
      : `«${display}» se agotó. Revísalo en tu carrito antes de pagar.`;
    try {
      const uids = await cartUidsWithVariant(pid, vid, opts?.excludeUid);
      for (const uid of uids) {
        try {
          const tokensSnap = await db().collection(`users/${uid}/fcmTokens`).limit(20).get();
          if (tokensSnap.empty) continue;
          const refs: TokenRef[] = tokensSnap.docs
            .map((d) => ({ token: String(d.data()['token'] ?? ''), ref: d.ref }))
            .filter((r) => r.token);
          if (refs.length === 0) continue;
          await sendAndCleanup(refs, title, body, {
            aud: 'stock',
            productId: pid,
            variantId: vid,
            back: opts?.back ? '1' : '0',
          });
        } catch (e) {
          // Un carrito que falla no detiene a los demás (best-effort).
          console.warn('[notificaciones] aviso de stock fallido para un carrito', e);
        }
      }
    } catch (e) {
      // 5.73 · Log visible en Netlify (best-effort: jamás interrumpe la operación).
      console.warn('[notificaciones] aviso de stock omitido (best-effort)', e);
    }
  },
};
