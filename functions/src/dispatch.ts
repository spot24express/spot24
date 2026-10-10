/**
 * SPOT 24 · Cambio de estado de pedido (panel de despacho, 5.5) + modelo de
 * reclamo de delivery (5.28). Roles con permisos acotados: admin (todo),
 * cajero (hasta preparado), delivery (en_camino → entregado). Máquina de
 * transiciones estricta, tracking code en en_camino, notificación FCM al
 * cliente y auditoría. Core agnóstico del runtime + wrapper onCall (modo
 * Cloud Functions).
 *
 * Ronda 5.28 · DESPACHO CON RECLAMO (decisión del dueño):
 *  · Al quedar PREPARADO un pedido con envío, todos los deliverys reciben el
 *    push «listo para salir» (llamado a la acción) y gerencia/admin a manera
 *    informativa (ORDER_NOTIFICATIONS.sendDispatchAlert).
 *  · «Tomar pedido» (coreClaimDeliveryOrder): UNA sola acción — asigna el
 *    pedido al delivery y lo pasa a EN CAMINO en la misma transacción
 *    atómica. EXCLUSIVO del rol delivery: el que llega primero se lo queda
 *    (si otro lo tomó antes, la transacción falla con el nombre del ganador).
 *  · «Reasignar» (coreReleaseDeliveryOrder): SOLO gerencia/admin — suelta el
 *    pedido en camino que un delivery tomó, borra la asignación, lo devuelve
 *    a PREPARADO y vuelve a avisar a los deliverys. Transición inversa
 *    intencional (corrección operativa, no avance de la máquina de estados).
 *  · Culminar (→ entregado) es del delivery (UI); el backend conserva la
 *    válvula de emergencia del admin vía coreUpdateOrderStatus.
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

  // 5.28 · Aviso de despacho: pedido con envío PREPARADO → push a los
  // deliverys (tómalo) y a gerencia/admin (informativo). Los retiros en
  // tienda no generan aviso: nadie tiene que ir a entregarlos.
  if (to === 'preparado' && String(order['delivery']?.['mode'] ?? 'delivery') !== 'pickup') {
    void ORDER_NOTIFICATIONS.sendDispatchAlert(String(order['code']), String(order['delivery']?.['zoneName'] ?? ''));
  }
  void ORDER_NOTIFICATIONS.send(String(order['uid']), String(order['code']), to);
  await writeAudit({ action: `estado_${to}`, adminUid: ctx.auth.uid, targetId: orderId, note });
  return { ok: true, trackingCode: patch['delivery.trackingCode'] ?? order['delivery']?.['trackingCode'] ?? null };
}

export const fnUpdateOrderStatus = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreUpdateOrderStatus(req as unknown as CoreCtx),
);

/**
 * 5.28 · «Tomar pedido» — reclamo first-grab-wins del repartidor.
 * UNA sola acción: la transacción asigna el pedido al delivery Y lo pasa a
 * EN CAMINO (con tracking si no lo tenía). Si otro delivery lo tomó antes,
 * falla con «ya lo tomó {nombre}»: imposible el doble assignment. El nombre
 * visible del repartidor sale de su perfil (primer nombre, fallback
 * «Delivery»); queda en delivery.claimed* y en la línea de tiempo.
 */
export async function coreClaimDeliveryOrder(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = String(ctx.auth.token['role'] ?? '');
  if (role !== 'delivery') {
    // Decisión del dueño: gerencia/admin son informativos; SOLO delivery toma.
    throw new HttpsError('permission-denied', 'Solo un delivery puede tomar pedidos.');
  }
  const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
  if (!orderId) throw new HttpsError('invalid-argument', 'Datos inválidos.');

  const ref = db().collection('orders').doc(orderId);
  /** Resultado de la transacción de reclamo (unión explícita de salidas). */
  interface ClaimOutcome {
    alreadyApplied?: boolean;
    claimed?: boolean;
    ownerUid?: string;
    code?: string;
    deliveryName?: string;
    trackingCode?: string | null;
  }
  const result = await db().runTransaction<ClaimOutcome>(async (tx): Promise<ClaimOutcome> => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
    const order = snap.data()!;
    const status = String(order['status']);
    const claimedBy = String(order['delivery']?.['claimedByUid'] ?? '');
    const uid = ctx.auth!.uid;

    // Replay idempotente (mismo espíritu que 5i-c): mi propio claim ya quedó.
    if (claimedBy === uid) {
      return { alreadyApplied: true, trackingCode: (order['delivery']?.['trackingCode'] as string | null) ?? null };
    }
    // Alguien más lo tomó ANTES: mensaje específico con su nombre (el pedido
    // ya estará en_camino por el claim — este check va ANTES del de estado).
    if (claimedBy) {
      const other = String(order['delivery']?.['claimedByName'] ?? '').trim();
      throw new HttpsError('failed-precondition', `Llegaste tarde: ya lo tomó ${other || 'otro delivery'}.`);
    }
    if (status !== 'preparado') {
      throw new HttpsError('failed-precondition', 'Este pedido ya no está disponible para tomar.');
    }
    if (String(order['delivery']?.['mode'] ?? 'delivery') === 'pickup') {
      throw new HttpsError('failed-precondition', 'Es retiro en tienda: no requiere delivery.');
    }

    // Primer nombre del perfil del repartidor (best-effort, dentro de la tx).
    let myName = '';
    try {
      const usnap = await tx.get(db().collection('users').doc(uid));
      const raw = String(usnap.data()?.['name'] ?? '').trim();
      const first = raw ? raw.split(/\s+/)[0] : '';
      myName = first ? first.slice(0, 24) : '';
    } catch {
      myName = '';
    }
    if (!myName) myName = 'Delivery';

    const trackingCode = String(order['delivery']?.['trackingCode'] ?? '') || `SP-TRK-${Math.floor(100000 + Math.random() * 899999)}`;
    const ownerUid = String(order['uid']);
    const code = String(order['code']);

    tx.update(ref, {
      status: 'en_camino',
      'delivery.claimedByUid': uid,
      'delivery.claimedByName': myName,
      'delivery.claimedAt': Date.now(),
      'delivery.trackingCode': trackingCode,
      updatedAt: Date.now(),
    });
    tx.set(ref.collection('events').doc(), {
      status: 'en_camino',
      at: Date.now(),
      by: 'delivery',
      byUid: uid,
      byName: myName,
      note: `Tomado por ${myName}.`,
    });
    return { claimed: true, ownerUid, code, deliveryName: myName, trackingCode };
  });

  // Fuera de la transacción: push al cliente + auditoría (best-effort).
  if (result.claimed && result.ownerUid && result.code && result.deliveryName) {
    void ORDER_NOTIFICATIONS.send(result.ownerUid, result.code, 'en_camino');
    await writeAudit({
      action: 'delivery_tomado',
      adminUid: ctx.auth.uid,
      targetId: orderId,
      note: `Tomado por ${result.deliveryName}.`,
    });
  }
  return { ok: true, trackingCode: result.trackingCode ?? null };
}

/**
 * 5.28 · «Reasignar» — SOLO gerencia/admin: suelta un pedido EN CAMINO que un
 * delivery tomó. Borra el claim (delivery.claimedByUid/Name/At), devuelve el
 * pedido a PREPARADO y vuelve a avisar a los deliverys para que otro lo
 * agarre. El cliente recibe el push de 'preparado' (su pedido salió y volvió
 * a estar listo — honesto con el estado real). La transición inversa es
 * intencional y queda en la línea de tiempo con el motivo.
 */
export async function coreReleaseDeliveryOrder(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = String(ctx.auth.token['role'] ?? '');
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Reasignar es de gerencia o administración.');
  }
  const orderId = sanitizeStr(ctx.data?.['orderId'], 120);
  const note = sanitizeStr(ctx.data?.['note'], 200);
  if (!orderId) throw new HttpsError('invalid-argument', 'Datos inválidos.');

  const ref = db().collection('orders').doc(orderId);
  const released = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Orden no encontrada.');
    const order = snap.data()!;
    const status = String(order['status']);
    const claimedBy = String(order['delivery']?.['claimedByUid'] ?? '');
    if (status !== 'en_camino') {
      throw new HttpsError('failed-precondition', 'Solo se puede reasignar un pedido en camino.');
    }
    if (!claimedBy) {
      throw new HttpsError('failed-precondition', 'Este pedido no está tomado por ningún delivery.');
    }
    const ownerUid = String(order['uid']);
    const code = String(order['code']);
    const who = String(order['delivery']?.['claimedByName'] ?? 'un delivery').trim() || 'un delivery';

    tx.update(ref, {
      status: 'preparado',
      'delivery.claimedByUid': admin.firestore.FieldValue.delete(),
      'delivery.claimedByName': admin.firestore.FieldValue.delete(),
      'delivery.claimedAt': admin.firestore.FieldValue.delete(),
      updatedAt: Date.now(),
    });
    tx.set(ref.collection('events').doc(), {
      status: 'preparado',
      at: Date.now(),
      by: role,
      byUid: ctx.auth!.uid,
      note: note || `Reasignado por ${role}: lo llevaba ${who}; vuelve a estar disponible.`,
    });
    return { ownerUid, code, zone: String(order['delivery']?.['zoneName'] ?? '') };
  });

  // Fuera de la transacción: cliente notificado + re-aviso a deliverys + auditoría.
  void ORDER_NOTIFICATIONS.send(released.ownerUid, released.code, 'preparado');
  void ORDER_NOTIFICATIONS.sendDispatchAlert(released.code, released.zone);
  await writeAudit({ action: 'delivery_soltado', adminUid: ctx.auth.uid, targetId: orderId, note });
  return { ok: true };
}