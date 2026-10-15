/**
 * SPOT 24 · Ajuste de stock (6.3): SOLO función de servidor con auditoría.
 * El panel admin llama fn-adjustStock; el cliente nunca toca variantes.
 * Core agnóstico del runtime + wrapper onCall (modo Cloud Functions).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { writeAudit } from './payments';
import { STOCK_NOTIFICATIONS } from './lib/notifications';

const db = () => admin.firestore(getAdminApp());

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export async function coreAdjustStock(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Solo administración o gerencia.');
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
  // 5.74 · Contexto para el push de inventario (capturado dentro de la tx).
  let prevStock = -1;
  let nextStock = -1;
  let displayName = '';

  await db().runTransaction(async (tx) => {
    // REGLA DE TRANSACCIONES FIRESTORE: TODAS las lecturas primero.
    // El tx.get de la colección de variantes iba después del tx.update de
    // la variante → «Firestore transactions require all reads to be
    // executed before all writes». Se lee TODO, luego se escribe TODO.
    const [vsnap, psnap] = await Promise.all([tx.get(vref), tx.get(pref)]);
    if (!vsnap.exists) throw new HttpsError('not-found', 'Variante no encontrada.');
    const stock = Number(vsnap.data()?.['stock'] ?? 0);
    const next = Math.max(0, stock + delta);
    // 5.74 · capturas para el push post-transacción (nombre del producto;
    // si la variante tiene nombre propio y no repite el del producto, va entre
    // paréntesis — «Aceite 20W-50 (Sintético)»).
    prevStock = stock;
    nextStock = next;
    const vName = String(vsnap.data()?.['name'] ?? '').trim();
    const pName = String(psnap.data()?.['name'] ?? '').trim();
    displayName = pName || vName;
    if (pName && vName && vName.toLowerCase() !== pName.toLowerCase()) {
      displayName = `${pName} (${vName})`;
    }

    // Recalcula stockTotal del padre (lectura ANTES de escribir).
    const variantsSnap = await tx.get(db().collection(`products/${productId}/variants`));
    const perVariant = new Map<string, number>();
    variantsSnap.docs.forEach((d) => perVariant.set(d.id, Number(d.data()['stock'] ?? 0)));
    perVariant.set(variantId, next);
    newTotal = [...perVariant.values()].reduce((a, b) => a + b, 0);

    // ── A partir de aquí SOLO escrituras ──
    tx.update(vref, { stock: next });
    if (psnap.exists) {
      tx.update(pref, { stockTotal: newTotal, updatedAt: Date.now() });
    }
  });

  await writeAudit({ action: 'ajustar_stock', adminUid: ctx.auth.uid, targetId: `${productId}/${variantId}`, note: `${reason} (Δ${delta} → total ${newTotal})` });

  // 5.74 · INVENTARIO QUE AVISA — push SOLO cuando la variante CRUZA el cero:
  // · stock > 0 → 0  → «Se agotó» a los carritos que la tenían.
  // · stock 0 → > 0  → «Ya disponible» a esos mismos carritos (reposición).
  // Ajustes internos que no cruzan el cero NO notifican (cero ruido).
  // Best-effort: jamás interrumpe la respuesta del panel.
  if (nextStock === 0 && prevStock > 0) {
    await STOCK_NOTIFICATIONS.notifyVariantStock(productId, variantId, { back: false, name: displayName });
  } else if (prevStock === 0 && nextStock > 0) {
    await STOCK_NOTIFICATIONS.notifyVariantStock(productId, variantId, { back: true, name: displayName });
  }

  return { ok: true, stock: Math.max(0, newTotal) };
}

export const fnAdjustStock = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreAdjustStock(req as unknown as CoreCtx),
);