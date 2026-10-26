/**
 * SPOT 24 · Verificación manual de pagos (5.4).
 * Admin o cajero (custom claim). Ejecuta antifraude de referencia duplicada,
 * transiciona estados, notifica al cliente y escribe auditoría (6.9).
 * Core agnóstico del runtime + wrapper onCall (modo Cloud Functions).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { canTransition } from './domain/order-state';
import { isDuplicateReference } from './lib/fraud';
import { ORDER_NOTIFICATIONS } from './lib/notifications';
import { hashReference } from './lib/crypto';
import { finiteNum } from './lib/items';

const db = () => admin.firestore(getAdminApp());

/** Exige sesión con uno de los roles indicados (custom claim). */
function requireStaff(ctx: CoreCtx, roles: readonly string[]): { uid: string; role: string } {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = String(ctx.auth.token['role'] ?? '');
  if (!roles.includes(role)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para esta acción.');
  }
  return { uid: ctx.auth.uid, role };
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

export async function coreVerifyPayment(ctx: CoreCtx): Promise<unknown> {
  // Ronda 3: gerente también verifica pagos (rol de jefatura de operations).
  const staff = requireStaff(ctx, ['admin', 'gerente', 'cajero']);

  const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
  const approve = ctx.data?.['approve'] === true;
  const note = sanitizeStr(ctx.data?.['note'], 300);
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId requerido.');

  const ref = db().collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const order = snap.data()!;
  const status = String(order['status']);

  // Ronda 5i-c — REPLAY IDEMPOTENTE. Con el arranque en frío de netlify dev
  // (22-28 s) la 1ª llamada SÍ se aplicó en el servidor, pero su 200 llegó a
  // un cliente que ya había abortado por timeout; el reintento (o el clic
  // siguiente del admin) chocaba con el guardia de abajo y veía un 400
  // «La orden no está en verificación de pago.» aunque el pago YA estaba
  // aprobado. Si la orden ya está en el estado DESTINO de la acción,
  // respondemos ok SIN re-aplicar nada (sin evento, sin notificación, sin
  // auditoría duplicada).
  if (approve && status === 'pagado') {
    return { ok: true, alreadyApplied: true };
  }
  if (
    !approve &&
    status === 'cancelado' &&
    String(order['payment']?.['status'] ?? '') === 'rechazado'
  ) {
    // 'cancelado' también lo produce fn-cancelOrder del cliente (que no toca
    // payment.status): exigimos payment.status 'rechazado' para repasar SOLO
    // el rechazo de pago propio y no cancelaciones ajenas.
    return { ok: true, alreadyApplied: true };
  }

  if (!['pendiente', 'en_verificacion'].includes(status)) {
    throw new HttpsError('failed-precondition', 'La orden no está en verificación de pago.');
  }

  // Ronda 5i-j — SIN COMPROBANTE NO SE APRUEBA. Verificar implica que el
  // cliente YA pagó (comprobante subido vía fn-uploadReceipt, que además
  // deja la orden en en_verificacion). Así el cajero no aprueba por error
  // un pedido sin pago: el rechazo/cancelación sigue disponible para
  // pedidos estancados sin comprobante.
  if (approve && order['payment']?.['hasReceipt'] !== true) {
    throw new HttpsError(
      'failed-precondition',
      'El cliente aún no subió el comprobante de pago: no se puede aprobar sin pago registrado.',
    );
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
      'payment.verifiedBy': staff.uid,
      updatedAt: Date.now(),
      riskFlags: [],
    });
    await ref.collection('events').add({
      status: 'pagado',
      at: Date.now(),
      by: staff.role,
      note: note || 'Pago verificado.',
    });
    // 5.73 · await en vez de «void»: Netlify congela la lambda al devolver la
    // respuesta y un push fire-and-forget NUNCA sale en producción (el
    // emulador no congela → aquí pasó desapercibido). Internamente los envíos
    // son best-effort (nunca lanzan): el await no puede romper la verificación.
    await ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), 'pagado');
  } else {
    await db().runTransaction(async (tx) => {
      // REGLA DE TRANSACCIONES FIRESTORE: TODAS las lecturas primero.
      // Repone stock leyendo las variantes ANTES de escribir la orden
      // (el tx.get tras tx.update revienta la transacción con
      // «reads to be executed before all writes»).
      const lines = (order['lines'] ?? []) as Array<{ productId: string; variantId: string; qty: number }>;
      const restock: Array<{ ref: admin.firestore.DocumentReference; newStock: number; qty: number }> = [];
      for (const line of lines) {
        const vref = db().doc(`products/${line.productId}/variants/${line.variantId}`);
        const vsnap = await tx.get(vref);
        if (vsnap.exists) {
          // 5.93: finiteNum — stock NaN corrupto llegaba a tx.update → 500 opaco.
          restock.push({ ref: vref, newStock: finiteNum(vsnap.data()?.['stock']) + line.qty, qty: line.qty });
        }
      }
      // 5.74 · VITRINA HONESTA: leer los productos ANTES de escribir (regla
      // de tx) para SUBIR su stockTotal junto con el stock de la variante —
      // el rechazo devuelve mercancía a la vitrina y el pulso del catálogo
      // refresca las pantallas abiertas al instante.
      const parentBumps = new Map<
        string,
        { ref: admin.firestore.DocumentReference; qty: number; exists: boolean }
      >();
      for (const p of restock) {
        const pid = p.ref.parent.parent?.id ?? '';
        if (!pid) continue;
        const cur = parentBumps.get(pid);
        if (cur) {
          cur.qty += p.qty;
        } else {
          const pRef = db().doc(`products/${pid}`);
          const psnap = await tx.get(pRef);
          parentBumps.set(pid, { ref: pRef, qty: p.qty, exists: psnap.exists });
        }
      }
      // ── A partir de aquí SOLO escrituras: ninguna lectura después ──
      tx.update(ref, {
        status: 'cancelado',
        'payment.status': 'rechazado',
        'payment.verifiedAt': Date.now(),
        'payment.verifiedBy': staff.uid,
        updatedAt: Date.now(),
      });
      tx.set(ref.collection('events').doc(), {
        status: 'cancelado',
        at: Date.now(),
        by: staff.role,
        note: note || 'Pago rechazado.',
      });
      for (const p of restock) {
        tx.update(p.ref, { stock: p.newStock });
      }
      // 5.74 · stockTotal del padre SUBE con la reposición (vitrina honesta):
      // solo si el producto existe (jamás resucitar padres huérfanos).
      for (const b of parentBumps.values()) {
        if (!b.exists) continue;
        tx.update(b.ref, {
          stockTotal: admin.firestore.FieldValue.increment(b.qty),
          updatedAt: Date.now(),
        });
      }
    });
    // 5.73 · await: ver comentario en la aprobación (Netlify congela al responder).
    await ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), 'cancelado');
  }

  await writeAudit({
    action: approve ? 'verificar_pago_aprobado' : 'verificar_pago_rechazado',
    adminUid: staff.uid,
    targetId: orderId,
    note,
  });
  void hashReference; // refHash ya viene calculado en la orden
  void canTransition;
  return { ok: true };
}

export const fnVerifyPayment = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreVerifyPayment(req as unknown as CoreCtx),
);