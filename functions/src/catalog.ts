/**
 * SPOT 24 · Ajuste de stock (6.3): SOLO función de servidor con auditoría.
 * El panel admin llama fn-adjustStock; el cliente nunca toca variantes.
 * Core agnóstico del runtime + wrapper onCall (modo Cloud Functions).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export async function coreAdjustStock(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  if (ctx.auth.token['role'] !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo administración.');
  }

  const productId = sanitizeStr(ctx.data?.['productId'], 120);
  const variantId = sanitizeStr(ctx.data?.['variantId'], 140);
  const delta = Number(ctx.data?.['delta']);
  const reason = sanitizeStr(ctx.data?.['reason'], 200) || 'ajuste manual';
  if (!productId || !variantId || !Number.isInteger(delta) || Math.abs(delta) > 1000) {
    throw new HttpsError('invalid-argument', 'Datos de ajuste inválidos.');
  }

  const vref = db().doc(`products/${productId}/variants/${variantId}`);
  const pref = db().doc(`products/${productId}`);
  let newTotal = 0;

  await db().runTransaction(async (tx) => {
    const [vsnap, psnap] = await Promise.all([tx.get(vref), tx.get(pref)]);
    if (!vsnap.exists) throw new HttpsError('not-found', 'Variante no encontrada.');
    const stock = Number(vsnap.data()?.['stock'] ?? 0);
    const next = Math.max(0, stock + delta);
    tx.update(vref, { stock: next });

    // Recalcula stockTotal del padre.
    const variantsSnap = await tx.get(db().collection(`products/${productId}/variants`));
    const perVariant = new Map<string, number>();
    variantsSnap.docs.forEach((d) => perVariant.set(d.id, Number(d.data()['stock'] ?? 0)));
    perVariant.set(variantId, next);
    newTotal = [...perVariant.values()].reduce((a, b) => a + b, 0);
    if (psnap.exists) {
      tx.update(pref, { stockTotal: newTotal, updatedAt: Date.now() });
    }
  });

  await writeAudit({ action: 'ajustar_stock', adminUid: ctx.auth.uid, targetId: `${productId}/${variantId}`, note: `${reason} (Δ${delta} → total ${newTotal})` });
  return { ok: true, stock: Math.max(0, newTotal) };
}

export const fnAdjustStock = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreAdjustStock(req as unknown as CoreCtx),
);
