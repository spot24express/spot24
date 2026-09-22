/**
 * SPOT 24 · Verificación manual de pagos (5.4).
 * Solo admins (custom claim). Ejecuta antifraude de referencia duplicada,
 * transiciona estados, notifica al cliente y escribe auditoría (6.9).
 */
import * as admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { canTransition } from './domain/order-state';
import { isDuplicateReference } from './lib/fraud';
import { ORDER_NOTIFICATIONS } from './lib/notifications';
import { hashReference } from './lib/crypto';

const db = () => admin.firestore();

function requireAdmin(ctx: CallableRequest): void {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  if (ctx.auth.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administración.');
  }
}

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Auditoría de acciones admin: colección de solo escritura para clientes (6.9). */
export async function writeAudit(entry: {
  action: string;
  adminUid: string;
  targetId: string;
  note?: string;
}): Promise<void> {
  await db().collection('auditLog').add({
    ...entry,
    note: entry.note ? entry.note.slice(0, 200) : '',
    at: Date.now(),
    // Nunca PII: solo UIDs e IDs internos.
  });
}

export const fnVerifyPayment = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  async (ctx) => {
    requireAdmin(ctx);

    const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
    const approve = ctx.data?.['approve'] === true;
    const note = sanitizeStr(ctx.data?.['note'], 300);
    if (!orderId) throw new HttpsError('invalid-argument', 'orderId requerido.');

    const ref = db().collection('orders').doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
    const order = snap.data()!;
    const status = String(order['status']);

    if (!['pendiente', 'en_verificacion'].includes(status)) {
      throw new HttpsError('failed-precondition', 'La orden no está en verificación de pago.');
    }

    if (approve) {
      // Antifraude: referencia duplicada NO aprueba automáticamente (6.8).
      const refHash = order['payment']?.['refHash'] ?? null;
      if (refHash) {
        const dup = await isDuplicateReference(String(refHash), orderId);
        if (dup) {
          await db().collection('fraudReview').add({
            orderId,
            reason: 'referencia_duplicada',
            refHash,
            at: Date.now(),
          });
          throw new HttpsError('failed-precondition', 'Referencia duplicada: va a la cola de revisión.');
        }
      }
      await ref.update({
        status: 'pagado',
        'payment.status': 'pagado',
        'payment.verifiedAt': Date.now(),
        'payment.verifiedBy': ctx.auth!.uid,
        updatedAt: Date.now(),
        riskFlags: [],
      });
      await ref.collection('events').add({
        status: 'pagado',
        at: Date.now(),
        by: 'admin',
        note: note || 'Pago verificado.',
      });
      void ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), 'pagado');
    } else {
      await db().runTransaction(async (tx) => {
        tx.update(ref, {
          status: 'cancelado',
          'payment.status': 'rechazado',
          'payment.verifiedAt': Date.now(),
          'payment.verifiedBy': ctx.auth!.uid,
          updatedAt: Date.now(),
        });
        tx.set(ref.collection('events').doc(), {
          status: 'cancelado',
          at: Date.now(),
          by: 'admin',
          note: note || 'Pago rechazado.',
        });
        // Repone stock.
        const lines = (order['lines'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>;
        for (const line of lines) {
          const vref = db().doc(`products/${line.productId}/variants/${line.variantId}`);
          const vsnap = await tx.get(vref);
          if (vsnap.exists) {
            tx.update(vref, { stock: Number(vsnap.data()?.['stock'] ?? 0) + line.qty });
          }
        }
      });
      void ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), 'cancelado');
    }

    await writeAudit({
      action: approve ? 'verificar_pago_aprobado' : 'verificar_pago_rechazado',
      adminUid: ctx.auth!.uid,
      targetId: orderId,
      note,
    });
    void hashReference; // refHash ya viene calculado en la orden
    void canTransition;
    return { ok: true };
  },
);
