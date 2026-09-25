/**
 * SPOT 24 · Notificaciones FCM por cambio de estado (5.5).
 * Voz de marca: afirmativa y corta. Sin datos personales en el payload.
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

export const ORDER_NOTIFICATIONS = {
  /** Envía a todos los tokens registrados del usuario (fan-out acotado a 20). */
  async send(uid: string, orderCode: string, status: string): Promise<void> {
    const msg = MESSAGES[status];
    if (!msg) return;
    try {
      const tokensSnap = await db().collection(`users/${uid}/fcmTokens`).limit(20).get();
      if (tokensSnap.empty) return;
      const tokens = tokensSnap.docs.map((d) => String(d.data()['token'] ?? '')).filter(Boolean);
      if (tokens.length === 0) return;

      const { getMessaging } = await import('firebase-admin/messaging');
      const messaging = getMessaging();
      const body = orderCode ? `${msg.body} (${orderCode})` : msg.body;
      const batch = await messaging.sendEachForMulticast({
        tokens,
        notification: { title: msg.title, body },
        data: { status, orderCode: orderCode.slice(0, 40) },
        webpush: { headers: { TTL: '86400' } },
      });

      // Limpieza: elimina tokens inválidos/unregistrados.
      const removals: Promise<unknown>[] = [];
      batch.responses.forEach((r, i) => {
        const failed = r.success === false && (r.error?.code === 'messaging/registration-token-not-registered' || r.error?.code === 'messaging/invalid-registration-token');
        if (failed && tokensSnap.docs[i]) {
          removals.push(tokensSnap.docs[i].ref.delete());
        }
      });
      await Promise.all(removals);
    } catch {
      // Notificación best-effort: jamás interrumpe la operación principal.
    }
  },
};
