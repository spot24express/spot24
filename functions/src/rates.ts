/**
 * SPOT 24 · Tasa BCV (5.4) — regla de negocio del dueño:
 *  · El BCV publica en la tarde (~3:30 PM) la tasa del día siguiente y la página
 *    muestra su propio campo «Fecha Valor» (content="YYYY-MM-DDT…").
 *  · CAPTURA: lecturas horarias durante todo el día; la tasa nueva publicada en
 *    la tarde queda guardada como PENDIENTE (nextUsdToVes) el mismo día.
 *  · ACTIVACIÓN: a las 12:00 AM de Venezuela la primera lectura del nuevo día
 *    encuentra esa tasa ya vista un día anterior → la promueve a vigente.
 *    Así la tasa publicada hoy se usa desde las 12:00 AM de mañana.
 *  · VIERNES (regla del dueño, literal): «la tasa que publica la web del BCV el
 *    día viernes con fecha valor del lunes se usará el día sábado, domingo y
 *    lunes». El BCV no publica sábado ni domingo, así que CUALQUIER tasa que
 *    aparezca en la página un sábado o domingo distinta a la vigente ES la
 *    publicación del viernes → se activa DE INMEDIATO. Esto repara el caso en
 *    que la captura del viernes en la tarde falló (WAF/cron caído): antes esa
 *    tasa quedaba pendiente y recién se activaba el domingo o el lunes, y la
 *    tienda mostraba la tasa vieja todo el sábado (reporte del dueño:
 *    «no veo que se actualice»).
 *  · BLINDAJE 3:00 PM (solo días hábiles): nada que aparezca desde las 3:00 PM
 *    de Venezuela se activa el MISMO día, aunque la página etiquete su fecha
 *    valor como hoy (el sitio a veces es ambiguo). Regla del dueño: la de la
 *    tarde rige desde las 12:00 AM siguientes, sin excepción. En fin de semana
 *    el blindaje NO aplica: no hay publicación nueva posible.
 *  · Ante fallo se conserva la última tasa vigente (fail-open con flag).
 * Cores agnósticos del runtime: onSchedule/onCall y el scheduled de Netlify
 * reutilizan coreUpdateBcvRate/coreGetBcvRate.
 *
 * BLINDAJE DE TIEMPO (2026-10-02): el disparo manual fn-runBcvRate moría con
 * «Task timed out after 30.00 seconds» (tope fijo de lambda-local en
 * `netlify dev`; el timeout=26 de netlify.toml solo aplica en producción).
 * Causas corregidas:
 *  1. El «timeout» de httpsGet era de INACTIVIDAD de socket (req.setTimeout):
 *     con el WAF del BCV respondiendo a cuentagotas JAMÁS disparaba y la
 *     función colgaba hasta el kill externo. Ahora hay FECHA LÍMITE DURA que
 *     destruye la conexión llegue o no llegue el fin del cuerpo.
 *  2. El abort del fetch nativo se desarmaba (clearTimeout) ANTES de leer el
 *     cuerpo (res.text()): una respuesta que goteaba podía colgar eternamente.
 *     Ahora el temporizador cubre también la lectura del cuerpo.
 *  3. Peor caso anterior: 15 + 15 + 15 = 45 s > 30 s local y > 26 s producción.
 *     Presupuesto nuevo: 8 + 6 + 6 = 20 s de red + escritura Firestore ≈ 21 s.
 *  4. Presupuesto TOTAL de 22 s en coreUpdateBcvRate (deadline absoluto): pase
 *     lo que pase, la función termina, marca source 'fallback' y conserva la
 *     última tasa vigente. Nunca más un TimeoutError.
 *  5. User-Agent de navegador real: el WAF del BCV tarpaiteaba el UA de bot
 *     «SPOT24-Bot/1.0».
 *
 * DIAGNÓSTICO (2026-10-05, ronda 5.5): lectura EN VIVO de bcv.org.ve verificada
 * desde datacenter: fetch + parser + «Fecha Valor» funcionan (872,39 · fecha
 * valor del día siguiente capturada a las 9 PM). El fallo «no se actualiza»
 * estaba en la CADENA DE EJECUCIÓN (captura del viernes fallida → tasa del
 * viernes varaba como pendiente hasta domingo/lunes) y en la INVISIBILIDAD del
 * cron caído (nada avisaba que las lecturas horarias no corrían). Cambios:
 *  A. Regla de fin de semana arriba (activación inmediata sáb/dom).
 *  B. REINTENTO ÚNICO dentro del mismo presupuesto: el WAF del BCV falla a
 *     rachas y la siguiente lectura estaba a 1 hora completa.
 *  C. MOTIVO del fallo en el log (red | html | rango | presupuesto): ahora el
 *     log de Netlify dice SI el WAF bloqueó (red) o SI el BCV cambió su HTML
 *     (html) — antes ambos se veían igual («fallback»).
 *  D. lastError queda en el doc (fallback) y se limpia al capturar/activar.
 */
import admin from 'firebase-admin';
import https from 'node:https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getAdminApp, type CoreCtx } from './lib/ctx';

const db = () => admin.firestore(getAdminApp());

const BCV_URL = 'https://www.bcv.org.ve/';

/* Presupuestos de red (ver BLINDAJE DE TIEMPO arriba). */
const FETCH_STRICT_MS = 8_000;   // fetch nativo (verificación TLS estricta)
const FETCH_RELAXED_MS = 6_000;  // respaldo node:https (cadena TLS incompleta)
const TOTAL_BUDGET_MS = 22_000;  // techo TOTAL de la lectura (red + parsing)

const BCV_HEADERS = {
  // UA de navegador real: el WAF del BCV tarpaiteaba el UA de bot
  // «SPOT24-Bot/1.0» (conexión a cuentagotas que nunca llegaba al end).
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'es-VE,es;q=0.9',
};

interface HttpResult {
  status: number;
  location: string;
  html: string;
}

/** Motivo por el que una lectura no produjo tasa (C: diagnóstico fino). */
type BcvFailReason = 'red' | 'html' | 'rango' | 'presupuesto';

interface BcvFetch {
  rate: number | null;
  /** Fecha valor oficial que muestra la página del BCV (YYYY-MM-DD) o null. */
  fechaValor: string | null;
  /** Por qué no hubo tasa (solo cuando rate === null). */
  reason?: BcvFailReason;
}

/**
 * GET HTTPS con agente concreto y FECHA LÍMITE DURA: aunque el servidor
 * gotee bytes, a timeoutMs se destruye la conexión y la promesa termina
 * (resolve o reject) una sola vez. La inactividad de socket queda como
 * segunda red de seguridad.
 */
function httpsGet(url: string, agent: https.Agent, timeoutMs: number): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let hardDeadline: NodeJS.Timeout;
    const finish = (err: Error | null, val?: HttpResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(hardDeadline);
      if (err) {
        req.destroy();
        reject(err);
        return;
      }
      resolve(val!);
    };
    const req = https.get(url, { agent, headers: BCV_HEADERS }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c as Buffer));
      res.on('end', () =>
        finish(null, {
          status: res.statusCode ?? 0,
          location: String(res.headers['location'] ?? ''),
          html: Buffer.concat(chunks).toString('utf8'),
        }),
      );
      res.on('error', (e) => finish(e as Error));
    });
    hardDeadline = setTimeout(() => finish(new Error(`límite duro de ${timeoutMs}ms alcanzado`)), timeoutMs);
    req.on('error', (e) => finish(e as Error));
    // Red de seguridad adicional: inactividad total del socket.
    req.setTimeout(timeoutMs, () => finish(new Error('socket inactivo')));
  });
}

/**
 * HTML del BCV con doble estrategia TLS:
 *  · 1.º fetch nativo (verificación estricta) — si el BCV corrige su cadena.
 *  · 2.º respaldo node:https con verificación relajada SOLO para esta lectura
 *    pública: bcv.org.ve sirve una cadena TLS incompleta (intermedio ausente)
 *    y Node la rechaza con UNABLE_TO_VERIFY_LEAF_SIGNATURE (verificado EN VIVO
 *    2026-10-05: el fetch nativo sigue fallando y el respaldo sigue ok).
 *    La tasa se sanea después (rango, formato, fecha valor y reglas del
 *    dueño), el sitio es de lectura pública y el agente relajado queda
 *    encapsulado en esta única función.
 * Presupuesto total: 8 + 6 (+ 6 de un eventual redirect) en el peor caso.
 */
async function fetchBcvHtml(): Promise<string | null> {
  try {
    const controller = new AbortController();
    // El abort cubre TAMBIÉN la lectura del cuerpo: clearTimeout solo al final.
    const abortTimer = setTimeout(() => controller.abort(), FETCH_STRICT_MS);
    try {
      const res = await fetch(BCV_URL, {
        signal: controller.signal,
        headers: BCV_HEADERS,
        redirect: 'follow',
      });
      if (res.ok) return await res.text();
      logger.warn('BCV respondió', res.status);
    } finally {
      clearTimeout(abortTimer);
    }
  } catch {
    /* cadena TLS incompleta o red: vamos al respaldo */
  }

  const relaxed = new https.Agent({ rejectUnauthorized: false });
  try {
    let out = await httpsGet(BCV_URL, relaxed, FETCH_RELAXED_MS);
    if (out.status >= 300 && out.status < 400 && out.location) {
      out = await httpsGet(new URL(out.location, BCV_URL).toString(), relaxed, FETCH_RELAXED_MS);
    }
    return out.status === 200 ? out.html : null;
  } catch {
    return null;
  } finally {
    relaxed.destroy();
  }
}

/** Día calendario de HOY en Venezuela (YYYY-MM-DD). en-CA da formato ISO. */
function veToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Caracas' });
}

/** Hora (0-23) en Venezuela. hourCycle h23 evita el «24» de medianoche. */
function veHour(): number {
  const h = Number(
    new Date().toLocaleString('en-CA', { timeZone: 'America/Caracas', hour: '2-digit', hourCycle: 'h23' }),
  );
  return Number.isFinite(h) ? h : (new Date().getUTCHours() + 20) % 24;
}

/**
 * ¿Es sábado (6) o domingo (0) en Venezuela? Parse ISO en UTC del mediodía del
 * día VE: sin ambigüedad de zona (el propio AdminMetricsPage usa el truco
 * T12:00:00 para fechas puras). Base de la regla del dueño del viernes.
 */
function isVeWeekend(): boolean {
  const wd = new Date(`${veToday()}T12:00:00Z`).getUTCDay();
  return wd === 0 || wd === 6;
}

async function fetchBcvUsd(): Promise<BcvFetch> {
  try {
    const html = await fetchBcvHtml();
    if (!html) {
      // Ni fetch nativo ni respaldo trajeron HTML: WAF/red (C: motivo fino).
      return { rate: null, fechaValor: null, reason: 'red' };
    }

    // Fecha valor oficial: «Fecha Valor: <span … content="2026-09-29T00:00:00-04:00">»
    const fvm =
      /Fecha\s+Valor:[\s\S]{0,300}?content="(\d{4}-\d{2}-\d{2})/i.exec(html) ??
      /content="(\d{4}-\d{2}-\d{2})T[\d:.+-]*"/i.exec(html);
    const fechaValor = fvm?.[1] ?? null;

    // Precio del USD dentro del bloque <div id="dolar"> … <strong>857,88760000</strong>
    let m =
      /<div\s+id="dolar"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i.exec(html) ??
      /id="dolar"[\s\S]{0,800}?<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i.exec(html);
    // Respaldo: sección «dolar» y primer strong (comportamiento antiguo).
    if (!m || !m[1]) {
      const usdSection = html.split('dolar')[1] ?? html;
      m = /<strong[^>]*>\s*([\d.,]+)\s*<\/strong>/i.exec(usdSection);
    }
    if (!m || !m[1]) {
      logger.warn('BCV: patrón del USD no encontrado');
      return { rate: null, fechaValor, reason: 'html' };
    }
    // Formato venezolano: 857,88760000
    const normalized = m[1].replace(/\./g, '').replace(',', '.');
    const rate = Number(normalized);
    if (!Number.isFinite(rate) || rate <= 0 || rate > 10_000_000) {
      logger.warn('BCV: valor fuera de rango', rate);
      return { rate: null, fechaValor, reason: 'rango' };
    }
    return { rate: Math.round(rate * 100) / 100, fechaValor };
  } catch (e) {
    logger.warn('BCV fetch falló', e);
    return { rate: null, fechaValor: null, reason: 'red' };
  }
}

/** Promueve una tasa a VIGENTE y limpia la pendiente (12:00 AM o arranque). */
async function promote(
  ref: FirebaseFirestore.DocumentReference,
  rate: number,
  fechaValor: string,
): Promise<void> {
  const now = Date.now();
  await ref.set(
    {
      usdToVes: rate,
      fechaValor,
      updatedAt: now,
      source: 'bcv.org.ve',
      lastAttemptAt: now,
      lastError: admin.firestore.FieldValue.delete(),
      nextUsdToVes: admin.firestore.FieldValue.delete(),
      nextFechaValor: admin.firestore.FieldValue.delete(),
      nextCapturedAt: admin.firestore.FieldValue.delete(),
      nextCapturedVe: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );
  logger.info('BCV tasa ACTIVADA:', rate, '· fecha valor:', fechaValor);
}

/**
 * Cuerpo de la tarea programada (cada hora):
 *  1. Lee la página del BCV (tasa + fecha valor oficial), con UN reintento
 *     temprano si la lectura falla (el WAF cae a rachas; la próxima lectura
 *     está a 1 hora). El presupuesto TOTAL manda: un deadline absoluto de
 *     22 s cubre ambos intentos + parsing.
 *  2. Si la tasa ya estaba capturada desde un día anterior (pasó la medianoche)
 *     o el propio BCV declara fecha valor ≤ hoy antes de las 3:00 PM → la ACTIVA.
 *  3. SÁBADO/DOMINGO → ACTIVA de inmediato cualquier tasa distinta (regla del
 *     dueño: la publicada el viernes rige sábado, domingo y lunes).
 *  4. Si fue publicada hoy (día hábil) en la tarde → queda PENDIENTE.
 *  5. Si el BCV no responde → conserva la vigente, marca source 'fallback'
 *     y deja el MOTIVO en lastError (visible en fn-getBcvRate y en el log).
 */
export async function coreUpdateBcvRate(): Promise<void> {
  // Presupuesto TOTAL de lectura con deadline ABSOLUTO compartido: pase lo que
  // pase, la lectura termina antes del tope externo (30.00 s de lambda-local
  // en `netlify dev`; 26 s en producción) y registra el fallback.
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const withBudget = (): Promise<BcvFetch> => {
    const left = deadline - Date.now();
    if (left <= 0) {
      return Promise.resolve({ rate: null, fechaValor: null, reason: 'presupuesto' });
    }
    return Promise.race([
      fetchBcvUsd(),
      new Promise<BcvFetch>((resolve) =>
        setTimeout(() => {
          logger.warn(`BCV: presupuesto total de ${TOTAL_BUDGET_MS / 1000}s agotado → fallback`);
          resolve({ rate: null, fechaValor: null, reason: 'presupuesto' });
        }, left),
      ),
    ]);
  };

  let read = await withBudget();
  if (read.rate === null) {
    // (B) Reintento único: el WAF del BCV falla a rachas; esperar 1 hora
    // completa por un tropiezo de 2 s era la causa de capturas perdidas.
    logger.warn('BCV: lectura falló (', read.reason ?? '?', ') → reintento único');
    read = await withBudget();
  }
  const { rate, fechaValor, reason } = read;

  const ref = db().collection('rates').doc('bcv');
  if (rate === null) {
    await ref.set(
      { source: 'fallback', lastAttemptAt: Date.now(), lastError: reason ?? 'desconocido' },
      { merge: true },
    );
    logger.warn('BCV no disponible (motivo:', reason ?? 'desconocido',
      '): se conserva la última tasa vigente.');
    return;
  }

  const todayVe = veToday();
  const snap = await ref.get();
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const active = Number(d['usdToVes'] ?? 0);

  // Arranque en frío: sin tasa vigente se activa de una (la tienda necesita tasa).
  if (!Number.isFinite(active) || active <= 0) {
    await promote(ref, rate, fechaValor ?? todayVe);
    return;
  }

  // La página sigue mostrando la MISMA tasa vigente → nada que activar.
  if (rate === active) {
    const payload: Record<string, unknown> = {
      source: 'bcv.org.ve',
      lastAttemptAt: Date.now(),
      lastError: admin.firestore.FieldValue.delete(),
    };
    if (d['nextUsdToVes'] !== undefined) {
      // Pendiente obsoleta (el BCV volvió a mostrar la vigente): limpiar.
      payload['nextUsdToVes'] = admin.firestore.FieldValue.delete();
      payload['nextFechaValor'] = admin.firestore.FieldValue.delete();
      payload['nextCapturedAt'] = admin.firestore.FieldValue.delete();
      payload['nextCapturedVe'] = admin.firestore.FieldValue.delete();
    }
    await ref.set(payload, { merge: true });
    logger.info('BCV sin cambios:', rate, '· fecha valor:', fechaValor ?? '?');
    return;
  }

  // Tasa DISTINTA a la vigente:
  //  · ¿Sobrevivió la medianoche? (vista por primera vez en un día anterior y
  //    hoy sigue en la página) → es la tasa en vigor → activar.
  const pendingRate = Number(d['nextUsdToVes'] ?? 0);
  const pendingVe = typeof d['nextCapturedVe'] === 'string' ? String(d['nextCapturedVe']) : '';
  const survived = pendingRate === rate && pendingVe !== '' && pendingVe < todayVe;
  //  · ¿El propio BCV declara fecha valor ≤ hoy? → ya está en vigor → activar
  //    SOLO antes de las 3:00 PM: en la tarde la página puede traer la tasa de
  //    MAÑANA y la regla del dueño prohíbe activarla el mismo día.
  const effectiveToday = fechaValor !== null && fechaValor <= todayVe;
  const afternoonVe = veHour() >= 15;
  //  · ¿FIN DE SEMANA? Regla del dueño: la publicada el viernes (fecha valor
  //    lunes) rige sábado, domingo y lunes. El BCV no publica sáb/dom, así que
  //    toda tasa distinta visible un fin de semana ES la del viernes → activar
  //    DE INMEDIATO (repara capturas del viernes perdidas o cron caído).
  const weekendVe = isVeWeekend();
  if (survived || weekendVe || (effectiveToday && !afternoonVe)) {
    if (weekendVe && !survived) {
      logger.info('BCV: regla de FIN DE SEMANA (publicación del viernes) → activación inmediata');
    }
    await promote(ref, rate, fechaValor ?? (pendingVe || todayVe));
    return;
  }

  // Publicada hoy (día hábil) en la tarde → queda PENDIENTE hasta las 12:00 AM.
  await ref.set(
    {
      nextUsdToVes: rate,
      nextFechaValor: fechaValor ?? '',
      nextCapturedAt: Date.now(),
      nextCapturedVe: todayVe,
      source: 'bcv.org.ve',
      lastAttemptAt: Date.now(),
      lastError: admin.firestore.FieldValue.delete(),
    },
    { merge: true },
  );
  logger.info('BCV tasa capturada (pendiente para las 12:00 AM):', rate,
    '· fecha valor:', fechaValor ?? '?', '· capturada:', todayVe);
}

export async function coreGetBcvRate(_ctx: CoreCtx): Promise<unknown> {
  const snap = await db().collection('rates').doc('bcv').get();
  if (!snap.exists) throw new HttpsError('not-found', 'Tasa no publicada aún.');
  const d = snap.data()!;
  return {
    usdToVes: Number(d['usdToVes'] ?? 0),
    fechaValor: String(d['fechaValor'] ?? ''),
    updatedAt: Number(d['updatedAt'] ?? 0),
    // Marca del ÚLTIMO INTENTO (exitoso o fallback): cambia en cada lectura
    // del cron o del disparo manual, aunque la tasa vigente siga igual.
    lastAttemptAt: Number(d['lastAttemptAt'] ?? 0),
    source: String(d['source'] ?? 'fallback'),
    // Motivo del último fallo de lectura ('red'|'html'|'rango'|'presupuesto');
    // vacío si la última lectura fue exitosa.
    lastError: String(d['lastError'] ?? ''),
    nextUsdToVes: Number(d['nextUsdToVes'] ?? 0),
    nextFechaValor: String(d['nextFechaValor'] ?? ''),
    nextCapturedAt: Number(d['nextCapturedAt'] ?? 0),
  };
}

export const updateBcvRate = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
    retryCount: 1,
  },
  () => coreUpdateBcvRate(),
);

export const fnGetBcvRate = onCall(
  { region: 'us-central1', cors: true, maxInstances: 20 },
  (req: CallableRequest) => coreGetBcvRate(req as unknown as CoreCtx),
);