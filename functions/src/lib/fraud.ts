/**
 * SPOT 24 · Antifraude básico (6.8).
 * · Detección de referencias de pago duplicadas (hash sha256, no PII).
 * · Límite de pedidos por usuario por hora.
 * · Puntaje de riesgo → cola de revisión (status en_verificacion + riskFlags).
 *
 * A PRUEBA DE FALLOS: si una consulta de riesgo falla (p. ej. índice
 * compuesto faltante → Firestore FAILED_PRECONDITION, código gRPC 9), la
 * orden NUNCA se bloquea: se marca con 'riesgo_no_verificado' y needsReview
 * para que el dueño la revise en la cola. Crear la orden es lo importante;
 * el análisis de riesgo es un extra que puede degradarse con elegancia.
 */
import admin from 'firebase-admin';

const db = () => admin.firestore();

export const MAX_ORDERS_PER_HOUR = 5;
export const HIGH_AMOUNT_USD = 500;

export async function countUserOrdersLastHour(uid: string): Promise<number> {
  const since = Date.now() - 60 * 60 * 1000;
  const snap = await db()
    .collection('orders')
    .where('uid', '==', uid)
    .where('createdAt', '>=', since)
    .count()
    .get();
  return snap.data().count;
}

/** true si YA existe otra orden con la misma referencia (hash) no cancelada. */
export async function isDuplicateReference(refHash: string, excludeOrderId?: string): Promise<boolean> {
  const snap = await db()
    .collection('orders')
    .where('payment.refHash', '==', refHash)
    .limit(3)
    .get();
  return snap.docs.some((d) => d.id !== excludeOrderId && d.data()['status'] !== 'cancelado');
}

export interface RiskInput {
  uid: string;
  totalUsd: number;
  accountCreatedAtMs: number;
  refHash: string | null;
  orderId?: string;
}

export interface RiskResult {
  flags: string[];
  needsReview: boolean;
}

export async function assessRisk(input: RiskInput): Promise<RiskResult> {
  const flags: string[] = [];

  // Velocidad: N pedidos por hora por usuario. Requiere el índice compuesto
  // orders(uid ASC, createdAt DESC). Si falta (o Firestore falla por cualquier
  // motivo), marcamos la orden para revisión manual en vez de reventar.
  try {
    const ordersLastHour = await countUserOrdersLastHour(input.uid);
    if (ordersLastHour >= MAX_ORDERS_PER_HOUR) {
      flags.push('velocidad_alta');
    }
  } catch (e) {
    console.error('[fraud] countUserOrdersLastHour falló:', (e as Error)?.message ?? e);
    flags.push('riesgo_no_verificado');
  }

  if (input.totalUsd >= HIGH_AMOUNT_USD) {
    flags.push('monto_alto');
  }
  const isNewAccount = Date.now() - input.accountCreatedAtMs < 24 * 60 * 60 * 1000;
  if (isNewAccount) {
    flags.push('cuenta_nueva');
  }
  if (input.refHash) {
    try {
      const dup = await isDuplicateReference(input.refHash, input.orderId);
      if (dup) {
        flags.push('referencia_duplicada');
      }
    } catch (e) {
      console.error('[fraud] isDuplicateReference falló:', (e as Error)?.message ?? e);
      flags.push('riesgo_no_verificado');
    }
  }
  return { flags, needsReview: flags.length > 0 };
}