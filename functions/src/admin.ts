/**
 * SPOT 24 · Funciones administrativas (6.3/6.9).
 * · fn-setUserRole: asigna custom claims customer/admin (solo admin; no
 *   permite degradarse a sí mismo para evitar bloqueos).
 * · fn-revokeUserSessions: cierra todas las sesiones del usuario vía época.
 * · fn-getAdminMetrics: métricas agregadas calculadas en el backend.
 */
import * as admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { writeAudit } from './payments';

const db = () => admin.firestore();

function requireAdmin(ctx: CallableRequest): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  if (ctx.auth.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administración.');
  }
  return ctx.auth.uid;
}

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export const fnSetUserRole = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 10 },
  async (ctx) => {
    const adminUid = requireAdmin(ctx);
    const targetUid = sanitizeStr(ctx.data?.['uid'], 128);
    const role = sanitizeStr(ctx.data?.['role'], 16);
    if (!targetUid || !['customer', 'admin'].includes(role)) {
      throw new HttpsError('invalid-argument', 'Datos inválidos.');
    }
    if (targetUid === adminUid && role !== 'admin') {
      throw new HttpsError('failed-precondition', 'No puedes degradarte a ti mismo.');
    }

    await admin.auth().setCustomUserClaims(targetUid, { role });
    // Rotación de sesión: nueva época cierra las demás sesiones (5.3).
    const epoch = Date.now();
    await db().collection('users').doc(targetUid).set(
      { role, sessionEpoch: epoch },
      { merge: true },
    );

    await writeAudit({ action: `asignar_rol_${role}`, adminUid, targetId: targetUid });
    return { ok: true };
  },
);

export const fnRevokeUserSessions = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 10 },
  async (ctx) => {
    const adminUid = requireAdmin(ctx);
    const targetUid = sanitizeStr(ctx.data?.['uid'], 128);
    if (!targetUid) throw new HttpsError('invalid-argument', 'uid requerido.');

    await admin.auth().revokeRefreshTokens(targetUid);
    await db().collection('users').doc(targetUid).set(
      { sessionEpoch: Date.now() },
      { merge: true },
    );

    await writeAudit({ action: 'revocar_sesiones', adminUid, targetId: targetUid });
    return { ok: true };
  },
);

export const fnGetAdminMetrics = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 10 },
  async (ctx) => {
    requireAdmin(ctx);

    // Conteos por estado (agregación count, sin leer documentos).
    const statuses = ['pendiente', 'en_verificacion', 'pagado', 'preparado', 'en_camino', 'entregado', 'cancelado'];
    const counts = await Promise.all(
      statuses.map(async (s) => {
        const snap = await db().collection('orders').where('status', '==', s).count().get();
        return [s, snap.data().count] as const;
      }),
    );
    const ordersByStatus: Record<string, number> = {};
    counts.forEach(([s, c]) => (ordersByStatus[s] = c));

    // Ventas 30 días: stream de totals (campos mínimos).
    const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const salesSnap = await db()
      .collection('orders')
      .where('createdAt', '>=', since)
      .where('status', 'in', ['pagado', 'preparado', 'en_camino', 'entregado'])
      .select('totals.totalUsd', 'createdAt')
      .get();
    const revenueUsd30d = Math.round(
      salesSnap.docs.reduce((acc, d) => acc + Number(d.data()['totals']?.['totalUsd'] ?? 0), 0) * 100,
    ) / 100;

    // Pedidos últimos 7 días por día.
    const ordersLast7d: number[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = dayStart.getTime() + 24 * 60 * 60 * 1000;
      const c = await db()
        .collection('orders')
        .where('createdAt', '>=', dayStart.getTime())
        .where('createdAt', '<', dayEnd)
        .count()
        .get();
      ordersLast7d.push(c.data().count);
    }

    // Top productos: agregación por nombre desde líneas (últimos 30 días, acotado).
    const qtyByName = new Map<string, number>();
    const linesSnap = await db()
      .collection('orders')
      .where('createdAt', '>=', since)
      .select('lines')
      .limit(500)
      .get();
    linesSnap.docs.forEach((d) => {
      const lines = (d.data()['lines'] ?? []) as Array<{ name?: string; qty?: number }>;
      lines.forEach((l) => {
        if (l.name) qtyByName.set(l.name, (qtyByName.get(l.name) ?? 0) + Number(l.qty ?? 0));
      });
    });
    const topProducts = [...qtyByName.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    return { ordersByStatus, revenueUsd30d, ordersLast7d, topProducts };
  },
);
