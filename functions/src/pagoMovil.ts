/**
 * SPOT 24 · Ronda 5.113 — VALIDACIÓN AUTOMÁTICA DEL PAGO MÓVIL (BDV).
 * ────────────────────────────────────────────────────────────────────────
 * El cliente paga por Pago Móvil y el sistema pregunta al API Conciliación
 * BDV si el pago entró. Sin comprobante, sin verificación manual: el banco
 * es el árbitro. La verificación manual del cajero (payments.ts) queda
 * INTACTA como red de emergencia y para todo lo demás.
 *
 * Diseño SIN ORDEN (stateless): la validación ocurre ANTES de crear la
 * orden, durante el paso Pago del checkout. Cada pago validado queda
 * cerrado con llave en Firestore (colección pagoRefs) y el dueño de esa
 * llave es el uid que la validó. fn-createOrder luego COBRA esas llaves:
 * verifica cada una dentro de su transacción (uid + unused + importe) y
 * nace la orden directamente en «pagado» (máquina existente, estado ya
 * previsto: en_verificacion → pagado → preparado — nada nuevo).
 *
 * GARANTÍAS:
 * · Una referencia solo se usa UNA vez (pagoRefs + verificación en la tx
 *   de createOrder). BDV además concilia «en una sola oportunidad».
 * · El importe validado lo confirma el BANCO: declarar un monto distinto
 *   al real revienta en «no_encontrado». No hay trampa posible.
 * · Suiche global: settings/general.pagoMovilAuto. OFF = esta función ni
 *   siquiera mira a BDV (la app sigue 100 % como hoy).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { tryRateLimit } from './lib/ratelimit';
import { writeAudit } from './payments';
import {
  bancoOrigenBdv,
  bdvValidarPago,
  cedulaBdv,
  fechaBdv,
  importeBdv,
  referenciaBdv,
  telefonoBdv,
} from './lib/bdv';

const db = () => admin.firestore(getAdminApp());

function requireAuth(ctx: CoreCtx): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  return ctx.auth.uid;
}

function requireAppCheck(ctx: CoreCtx): void {
  if (ctx.app) return;
  if (process.env['APPCHECK_ENFORCE'] === 'true') {
    throw new HttpsError('failed-precondition', 'App Check requerido.');
  }
}

/** Tope defensivo del importe por pago (Bs). Un pedido del negocio jamás lo pasa. */
const MAX_IMPORTE_BS = 1_000_000;
/** Tope de pagos parciales por pedido (coherente con el checkout). */
export const MAX_PAGOS_PARCIALES = 3;

/** Evidencia de un pago validado: la que viaja luego a fn-createOrder. */
export interface PagoBdvEvidence {
  referencia: string;
  importe: number;
  fechaPago: string;
  bancoOrigen: string;
  telefonoDestino: string;
  validatedAt: number;
}

/** Id del candado de referencia: determinista y con caracteres seguros. */
export function pagoRefId(telefonoDestino: string, referencia: string): string {
  return `${telefonoDestino}_${referencia}`;
}

/**
 * Valida un pago móvil contra BDV y deja la evidencia cerrada en pagoRefs.
 * Stateless: no conoce la orden (aún no existe). El importe a validar lo
 * manda el checkout (el restante en el intento normal, el declarado en la
 * recuperación) — el BANCO confirma o rechaza ese importe, así que ningún
 * cliente puede «inventar» un pago.
 */
export async function coreCheckPagoMovil(ctx: CoreCtx): Promise<unknown> {
  const uid = requireAuth(ctx);
  requireAppCheck(ctx);
  await tryRateLimit({ bucket: 'checkPagoMovil', identity: uid, max: 12, windowMs: 60 * 60 * 1000 });

  const d = (ctx.data ?? {}) as Record<string, unknown>;
  const referencia = referenciaBdv(d['referencia']);
  const cedulaPagador = cedulaBdv(d['cedulaPagador']);
  const telefonoPagador = telefonoBdv(d['telefonoPagador']);
  const bancoOrigen = bancoOrigenBdv(d['bancoOrigen']);
  const fechaPago = fechaBdv(d['fechaPago']);
  const importeRaw = Number(d['importe']);
  if (referencia.length < 4) {
    throw new HttpsError('invalid-argument', 'Referencia del pago: todos los dígitos que muestra tu banco.');
  }
  if (!cedulaPagador) {
    throw new HttpsError('invalid-argument', 'Cédula del pagador requerida.');
  }
  if (telefonoPagador.length !== 11) {
    throw new HttpsError('invalid-argument', 'Teléfono del pago inválido (0412…).');
  }
  if (!bancoOrigen) {
    throw new HttpsError('invalid-argument', 'Banco de origen del pago requerido.');
  }
  if (!fechaPago) {
    throw new HttpsError('invalid-argument', 'Fecha del pago requerida (AAAA-MM-DD).');
  }
  if (!Number.isFinite(importeRaw) || importeRaw <= 0 || importeRaw > MAX_IMPORTE_BS) {
    throw new HttpsError('invalid-argument', 'Importe del pago inválido.');
  }
  const importe = Math.round(importeRaw * 100) / 100;

  // Suiche del dueño + teléfono de recaudo BDV (settings/general).
  const gen = await db().collection('settings').doc('general').get();
  if (gen.data()?.['pagoMovilAuto'] !== true) {
    throw new HttpsError('failed-precondition', 'La validación automática de pago móvil no está activa.');
  }
  const telefonoDestino = telefonoBdv(gen.data()?.['pagoMovilTelefono'] ?? '');
  if (telefonoDestino.length !== 11) {
    throw new HttpsError(
      'failed-precondition',
      'La validación automática no tiene el teléfono de recaudo BDV configurado (Ajustes → Operación).',
    );
  }

  // Claves del conciliador SOLO en el servidor.
  const cfg = {
    url: process.env['BDV_CONCILIACION_URL'] ?? '',
    key: process.env['BDV_API_KEY'] ?? '',
  };

  // Idempotencia local ANTES de gastar la llamada al banco: la misma
  // referencia del mismo uid con el mismo importe devuelve la evidencia
  // guardada (reintento de red del cliente) sin re-consultar BDV.
  const refId = pagoRefId(telefonoDestino, referencia);
  const refDoc = db().collection('pagoRefs').doc(refId);
  const previo = await refDoc.get();
  if (previo.exists) {
    const prevUid = String(previo.data()?.['uid'] ?? '');
    const prevImporte = Number(previo.data()?.['importe'] ?? NaN);
    if (prevUid !== uid) {
      throw new HttpsError('already-exists', 'Esta referencia ya fue validada por otra sesión.');
    }
    if (previo.data()?.['used'] === true) {
      throw new HttpsError('already-exists', 'Esta referencia ya fue usada en un pedido.');
    }
    if (Math.abs(prevImporte - importe) > 0.004) {
      throw new HttpsError(
        'already-exists',
        'Esta referencia ya fue validada por otro monto. Usa la referencia del nuevo pago.',
      );
    }
    const evidence: PagoBdvEvidence = {
      referencia,
      importe: prevImporte,
      fechaPago: String(previo.data()?.['fechaPago'] ?? fechaPago),
      bancoOrigen,
      telefonoDestino,
      validatedAt: Number(previo.data()?.['at'] ?? Date.now()),
    };
    return { ok: true, verificado: true, repetida: true, evidencia: evidence };
  }

  const result = await bdvValidarPago(
    {
      cedulaPagador,
      telefonoPagador,
      telefonoDestino,
      referencia,
      fechaPago,
      importe: importeBdv(importe),
      bancoOrigen,
    },
    cfg,
  );

  if (result.motivo === 'configuracion' || result.motivo === 'contrato' || result.motivo === 'inaccesible') {
    // Fallo NUESTRO o del banco: la orden del cliente no se bloquea — el
    // checkout ofrece el camino manual (comprobante + cajero) como siempre.
    throw new HttpsError('unavailable', result.message);
  }
  if (!result.ok) {
    // El banco NO vio el pago: mensaje honesto y accionable, sin detalle interno.
    await writeAudit({
      action: 'pago_auto_bdv_rechazo',
      adminUid: uid,
      targetId: referencia.slice(0, 40),
      note: `importe ${importeBdv(importe)} · ${result.motivo ?? '?'}`,
    });
    throw new HttpsError('failed-precondition', result.message);
  }

  // ÉXITO: cerramos la llave de la referencia en una transacción (carrera:
  // dos pestañas validando lo mismo a la vez — gana una, la otra la ve).
  const evidence: PagoBdvEvidence = {
    referencia,
    importe,
    fechaPago,
    bancoOrigen,
    telefonoDestino,
    validatedAt: Date.now(),
  };
  await db().runTransaction(async (tx) => {
    // Lectura primero (regla de transacciones Firestore).
    const fresh = await tx.get(refDoc);
    if (fresh.exists) {
      const freshUid = String(fresh.data()?.['uid'] ?? '');
      const freshImporte = Number(fresh.data()?.['importe'] ?? NaN);
      if (freshUid === uid && Math.abs(freshImporte - importe) <= 0.004 && fresh.data()?.['used'] !== true) {
        return; // la otra pestaña ganó: la evidencia ya está guardada, sirve igual
      }
      throw new HttpsError('already-exists', 'Esta referencia ya fue validada. Usa la referencia del nuevo pago.');
    }
    // Después la escritura.
    tx.set(refDoc, {
      uid,
      importe,
      fechaPago,
      at: evidence.validatedAt,
      used: false,
    });
  });

  await writeAudit({
    action: 'pago_auto_bdv',
    adminUid: uid,
    targetId: referencia.slice(0, 40),
    note: `importe ${importeBdv(importe)} · banco ${bancoOrigen} · code 1000`,
  });

  return { ok: true, verificado: true, repetida: false, evidencia: evidence };
}

export const fnCheckPagoMovil = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreCheckPagoMovil(req as unknown as CoreCtx),
);
