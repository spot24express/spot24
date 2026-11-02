/**
 * SPOT 24 · Ronda 5.113 — Adaptador del API Conciliación BDV (MDU-006).
 * ────────────────────────────────────────────────────────────────────────
 * El Banco de Venezuela ofrece a los comercios un endpoint de conciliación
 * de pago móvil (getMovement): se le pregunta por UN movimiento concreto
 * (cédula y teléfono del pagador, teléfono destino del comercio, referencia,
 * fecha, importe y banco origen) y responde si ESE pago existe.
 *
 * Contrato del manual (MDU-006 v1, 17/01/2024):
 * · POST con header X-API-Key (calidad: clave del manual; producción: la
 *   que genera el dueño desde BDVenLinea Empresa). URLs por variable de
 *   entorno — NUNCA quemadas en el código.
 * · Entrada: cedulaPagador, telefonoPagador, telefonoDestino, referencia,
 *   fechaPago "2023-02-12" (sin "/"), importe "120.00" (punto, no coma),
 *   bancoOrigen "0102".
 * · Salida HTTP 200 con body.code: 1000 = validada (data.amount con el
 *   monto), 1010 = «Registro solicitado no existe» / «Datos Mandatorios no
 *   pueden estar en null». Contrato JSON roto = HTTP 400.
 * · ⚠ Los rechazos llegan con HTTP 200: el error vive en body.code — el
 *   adaptador NUNCA se fía del status HTTP.
 *
 * Este módulo NO lanza: devuelve un resultado con motivo honesto. La
 * decisión (fallback manual, reintento del cliente) es del llamador.
 */

/** Una consulta al conciliador, ya normalizada. */
export interface BdvQuery {
  cedulaPagador: string;
  telefonoPagador: string;
  telefonoDestino: string;
  referencia: string;
  fechaPago: string;
  importe: string;
  bancoOrigen: string;
}

export type BdvMotivo =
  | 'no_encontrado' // 1010: el banco no ve ese pago (referencia/monto/fecha)
  | 'datos' // 1010 por mandatorios null (no debería pasar: saneamos arriba)
  | 'contrato' // HTTP 400: JSON malformado (bug nuestro, no del cliente)
  | 'inaccesible' // red caída / timeout / respuesta ilegible
  | 'configuracion'; // falta URL o clave

export interface BdvResult {
  ok: boolean;
  /** Monto que el banco reporta en data.amount (solo con ok). */
  amount: number | null;
  motivo: BdvMotivo | null;
  /** Mensaje corto y honesto para mostrar al cliente. Sin PII del banco. */
  message: string;
}

/** Configuración por entorno (variables de Netlify / .env local). */
export interface BdvConfig {
  url: string;
  key: string;
}

const BDV_TIMEOUT_MS = 12_000;

/* ───────────────────── normalizadores (puros, testeables) ───────────────── */

/**
 * Cédula como la espera BDV: letra + dígitos sin separadores ("V27037606").
 * Acepta lo que el cliente escribió ("12.345.678", "v-12345678", "V12345678").
 * Sin letra queda solo con dígitos (el manual trae ejemplos con y sin V).
 */
export function cedulaBdv(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^0-9VE]/g, '').slice(0, 10);
}

/**
 * Teléfono como lo espera BDV: 11 dígitos locales con 0 inicial
 * ("04127141363") — el MISMO formato que la app ya usa en toda la UI.
 */
export function telefonoBdv(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 12 && d.startsWith('58')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('4')) d = `0${d}`;
  return d.slice(0, 11);
}

/** Referencia: solo dígitos (el banco la muestra como número puro). */
export function referenciaBdv(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\D/g, '').slice(0, 15);
}

/** Banco origen: el código de 4 dígitos ("0102") del select "(0102) Banco…". */
export function bancoOrigenBdv(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const m = raw.match(/\((\d{4})\)/);
  if (m) return m[1]!;
  const d = raw.replace(/\D/g, '');
  return d.length === 4 ? d : '';
}

/** Importe con punto decimal y 2 decimales, como exige el manual ("120.00"). */
export function importeBdv(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '';
  return n.toFixed(2);
}

/** Fecha "YYYY-MM-DD" bien formada (el manual rechaza "/" y otros formatos). */
export function fechaBdv(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const t = raw.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : '';
}

/** ¿La consulta quedó completa y con los formatos del manual? */
export function bdvQueryValida(q: BdvQuery): boolean {
  return (
    q.cedulaPagador.length >= 1 &&
    q.telefonoPagador.length === 11 &&
    q.telefonoDestino.length === 11 &&
    q.referencia.length >= 4 &&
    q.fechaPago.length === 10 &&
    q.importe.length >= 4 &&
    q.bancoOrigen.length === 4
  );
}

/* ─────────────────────────── llamada al conciliador ─────────────────────── */

/**
 * Valida UN movimiento contra el API Conciliación BDV. Nunca lanza:
 * cualquier fallo vuelve como { ok: false, motivo, message }.
 * SIN reintentos automáticos a propósito: cada validación es una consulta
 * de negocio (el banco la concilia «en una sola oportunidad») y el
 * idempotente real vive en el llamador (pagoRefs en Firestore).
 */
export async function bdvValidarPago(q: BdvQuery, cfg: BdvConfig): Promise<BdvResult> {
  if (!cfg.url || !cfg.key) {
    return {
      ok: false,
      amount: null,
      motivo: 'configuracion',
      message:
        'La validación automática no está configurada en el servidor (BDV_CONCILIACION_URL / BDV_API_KEY).',
    };
  }
  if (!bdvQueryValida(q)) {
    return {
      ok: false,
      amount: null,
      motivo: 'datos',
      message: 'Los datos del pago están incompletos o mal formateados.',
    };
  }

  let res: Response;
  try {
    res = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': cfg.key },
      body: JSON.stringify({
        cedulaPagador: q.cedulaPagador,
        telefonoPagador: q.telefonoPagador,
        telefonoDestino: q.telefonoDestino,
        referencia: q.referencia,
        fechaPago: q.fechaPago,
        importe: q.importe,
        bancoOrigen: q.bancoOrigen,
      }),
      signal: AbortSignal.timeout(BDV_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      amount: null,
      motivo: 'inaccesible',
      message: 'El banco no respondió a tiempo. Reintenta en unos segundos.',
    };
  }

  if (res.status === 400) {
    // Contrato JSON roto: bug nuestro — mensaje neutro, el detalle queda
    // para los logs del llamador (aquí no hay cuerpo fiable que leer).
    return {
      ok: false,
      amount: null,
      motivo: 'contrato',
      message: 'El banco rechazó el formato de la consulta. Reintenta en unos minutos.',
    };
  }

  const body = (await res.json().catch(() => null)) as
    | { code?: number; message?: string; data?: { status?: string; amount?: string; reason?: string } | null }
    | null;

  if (!body || typeof body['code'] !== 'number') {
    return {
      ok: false,
      amount: null,
      motivo: 'inaccesible',
      message: 'El banco dio una respuesta ilegible. Reintenta en unos segundos.',
    };
  }

  if (body.code === 1000) {
    const amount = Number(body.data?.['amount'] ?? NaN);
    return {
      ok: true,
      amount: Number.isFinite(amount) ? amount : null,
      motivo: null,
      message: String(body.data?.['reason'] ?? 'Transaccion realizada'),
    };
  }

  const msg = String(body.message ?? '');
  if (msg.includes('Datos Mandatorios')) {
    return { ok: false, amount: null, motivo: 'datos', message: 'Datos del pago incompletos.' };
  }
  return {
    ok: false,
    amount: null,
    motivo: 'no_encontrado',
    message: 'El banco no encontró ese pago con esos datos. Revisa la referencia, el monto o la fecha.',
  };
}
