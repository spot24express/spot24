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
 */
import admin from 'firebase-admin';

const db = () => admin.firestore();

/** Origen del sitio: los iconos de push deben ser URL absoluta (Chrome no
 *  resuelve rutas relativas en el payload webpush de FCM). */
const SITE_URL = 'https://spot24express.netlify.app';

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

/** Multicast común (iconos de marca + TTL 24 h) y limpieza de tokens muertos.
 *  Best-effort: cualquier fallo queda atrapado y jamás interrumpe la
 *  operación principal que lo disparó. */
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
    const batch = await messaging.sendEachForMulticast({
      tokens: refs.map((r) => r.token),
      notification: { title, body },
      data,
      webpush: {
        headers: { TTL: '86400' },
        // Sin esto Chrome muestra SU icono por defecto (logo de Chrome en
        // círculo azul): icon = escudo transparente, badge = silueta blanca
        // del escudo (Android exige monocromo blanco+alpha para el badge).
        notification: {
          icon: `${SITE_URL}/icons/icon-192.png`,
          badge: `${SITE_URL}/icons/badge-96.png`,
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
   *  · gerente/admin → «Disponible en el panel de despacho.» (informativo;
   *    tomarlo es EXCLUSIVO del delivery, reasignar de gerencia/admin)
   *  El cuerpo lleva código + zona para decidir sin abrir la app. */
  async sendDispatchAlert(orderCode: string, zoneName: string): Promise<void> {
    const code = orderCode.slice(0, 40);
    const zone = zoneName.trim().slice(0, 40);
    const lead = zone ? `${code} · Zona ${zone}. ` : `${code} · `;
    try {
      const [delivery, staff] = await Promise.all([
        tokenRefsForRoles(['delivery']),
        tokenRefsForRoles(['gerente', 'admin']),
      ]);
      const data = { aud: 'dispatch', status: 'preparado', orderCode: code, zone };
      await Promise.all([
        sendAndCleanup(delivery, DISPATCH_TITLE, `${lead}Tómalo desde el panel de despacho.`, data),
        sendAndCleanup(staff, DISPATCH_TITLE, `${lead}Disponible en el panel de despacho.`, data),
      ]);
    } catch {
      // Aviso best-effort: jamás interrumpe la operación principal.
    }
  },
};