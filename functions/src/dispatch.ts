/**
 * SPOT 24 · Cambio de estado de pedido (panel de despacho, 5.5).
 * Roles con permisos acotados: admin (todo), cajero (hasta preparado),
 * delivery (en_camino → entregado). Máquina de transiciones estricta,
 * tracking code en en_camino, notificación FCM y auditoría.
 * Core agnóstico del runtime + wrapper onCall (modo Cloud Functions).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { canTransition, isOrderStatus } from './domain/order-state';
import { ORDER_NOTIFICATIONS } from './lib/notifications';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/**
 * Transiciones permitidas por rol (el admin y el gerente pasan todas las
 * válidas). Formato "desde>hasta"; el backend SIEMPRE re-valida con
 * canTransition.
 */
const ROLE_MOVES: Record<string, readonly string[]> = {
  cajero: [
    'pendiente>en_verificacion', 'pendiente>cancelado',
    'en_verificacion>pagado', 'en_verificacion>cancelado',
    'pagado>preparado', 'pagado>cancelado',
  ],
  delivery: ['preparado>en_camino', 'en_camino>entregado'],
};

function canRoleMove(role: string, from: string, to: string): boolean {
  if (role === 'admin' || role === 'gerente') return true;
  return (ROLE_MOVES[role] ?? []).includes(`${from}>${to}`);
}

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export async function coreUpdateOrderStatus(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = String(ctx.auth.token['role'] ?? '');
  if (!['admin', 'gerente', 'cajero', 'delivery'].includes(role)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para esta acción.');
  }

  const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
  const toRaw = ctx.data?.['to'];
  const note = sanitizeStr(ctx.data?.['note'], 300);
  if (!orderId || !isOrderStatus(toRaw)) {
    throw new HttpsError('invalid-argument', 'Datos inválidos.');
  }
  const to = toRaw;

  const ref = db().collection('orders').doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
  const order = snap.data()!;
  const from = String(order['status']);

  // Ronda 5i-c — REPLAY IDEMPOTENTE: la orden YA está en el estado destino
  // (el 200 de la llamada original no llegó al cliente por el arranque en
  // frío de netlify dev y el clic se repitió). Respondemos ok sin escribir
  // nada: sin evento duplicado, sin notificación, sin auditoría. Va ANTES
  // de canTransition porque «X → X» no es una transición válida y produciría
  // un 400 «Transición inválida» para una acción que ya se aplicó.
  if (from === to) {
    return {
      ok: true,
      alreadyApplied: true,
      trackingCode: order['delivery']?.['trackingCode'] ?? null,
    };
  }

  if (!canTransition(from as never, to)) {
    throw new HttpsError('failed-precondition', `Transición inválida: ${from} → ${to}.`);
  }
  if (!canRoleMove(role, from, to)) {
    throw new HttpsError('permission-denied', 'Tu rol no permite mover el pedido a ese estado.');
  }

  const patch: Record<string, unknown> = { status: to, updatedAt: Date.now() };
  if (to === 'en_camino' && !order['delivery']?.['trackingCode']) {
    patch['delivery.trackingCode'] = `SP-TRK-${Math.floor(100000 + Math.random() * 899999)}`;
  }
  if (to === 'entregado') {
    patch['deliveredAt'] = Date.now();
  }

  await db().runTransaction(async (tx) => {
    tx.update(ref, patch);
    tx.set(ref.collection('events').doc(), {
      status: to,
      at: Date.now(),
      by: role,
      note,
    });
  });

  void ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), to);
  await writeAudit({ action: `estado_${to}`, adminUid: ctx.auth.uid, targetId: orderId, note });
  return { ok: true, trackingCode: patch['delivery.trackingCode'] ?? order['delivery']?.['trackingCode'] ?? null };
}

export const fnUpdateOrderStatus = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreUpdateOrderStatus(req as unknown as CoreCtx),
);