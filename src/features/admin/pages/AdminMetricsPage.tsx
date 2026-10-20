import { useEffect, useState, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { BigFigure } from '@/shared/components/ui/PriceTag';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { Button } from '@/shared/components/ui/Button';
import {
  adminGetMetrics, type AdminMetrics, type BcvRateInfo,
} from '../services/admin.service';
import { loadFirebase } from '@/shared/lib/firebase';
import { STATUS_LABELS, ORDER_STATUSES, type OrderStatus } from '@/shared/constants/orders';
import { formatUsd } from '@/shared/lib/format';

/**
 * Métricas básicas de ventas y pedidos (5.6), calculadas en el backend.
 * La tarjeta «Tasa BCV» vive aquí y se muestra SIEMPRE (aunque fn-getAdminMetrics
 * no responda: en local esa función no existe, solo corre en producción).
 *
 * Ronda 5.5 — VIGÍA DEL CRON DE LA TASA: el dueño reportó «no veo que se
 * actualice». La tasa solo cambia si la función programada (update-bcv-rate,
 * horaria) corre y lee bcv.org.ve; si el cron muere, el doc rates/bcv queda
 * congelado y NADA lo avisaba. Ahora la tarjeta marca la staleness de
 * lastAttemptAt (escrito en CADA lectura, cambie o no la tasa):
 *  · > 2 h sin lecturas → franja ámbar con la edad exacta y los pasos para
 *    repararlo (deploy de functions, logs de Netlify, disparo manual).
 *  · lastAttemptAt === 0 → nunca hubo lecturas (el cron nunca corrió).
 * Un tick de 60 s mantiene la edad honesta si el panel queda abierto.
 *
 * Ronda 5.6 — «EL BOTÓN ACTUALIZAR NO HACE NADA»: el botón viejo solo volvía a
 * LEER el doc rates/bcv (refrescar la vista) y el dueño esperaba que consultara
 * el BCV. Ahora hay DOS botones con nombres honestos:
 *  · «Recargar» → relee el doc guardado (vista, instantáneo).
 *  · «Leer BCV ahora» → dispara la lectura REAL via fn-runBcvRate con la
 *    BCV_RUN_KEY (se pide una vez, queda en sessionStorage de ESTE navegador)
 *    y muestra el resultado inline: tasa nueva, pendiente 12:00 AM, o el error
 *    exacto (clave inválida / env var sin configurar / función no desplegada).
 *
 * Ronda 5.53 — «Recargar» ELIMINADO a pedido del dueño: la tarjeta escucha
 * rates/bcv EN VIVO con onSnapshot propio y se refresca sola cada vez que el
 * cron escribe (cada hora) o cuando «Leer BCV ahora» termina. Es listener
 * PROPIO y no el hook público useBcvRate porque la tarjeta necesita los
 * campos extra que el hook no expone: fechaValor, lastAttemptAt (pulso del
 * vigía) y la tasa pendiente next*. Con escucha en vivo, «Recargar» sobraba.
 */

/** > 2 h sin lecturas = cron detenido (normal: 1 lectura por hora). */
const STALE_MS = 2 * 60 * 60 * 1000;

/** Endpoint de disparo manual (mismo core que el cron horario). */
const RUN_URL = '/.netlify/functions/fn-runBcvRate';
/** Clave BCV_RUN_KEY en sessionStorage: muere al cerrar el navegador. */
const RUN_KEY_STORAGE = 'spot24.bcvRunKey';
/** La función tarda hasta ~26 s (fetch BCV): abortamos con margen. */
const RUN_TIMEOUT_MS = 32_000;

type RunMsg = { kind: 'ok' | 'err'; text: string };

export default function AdminMetricsPage() {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // Tasa BCV: undefined = cargando · null = sin doc todavía · objeto = publicada.
  const [rate, setRate] = useState<BcvRateInfo | null | undefined>(undefined);
  // Tick de staleness: re-render cada 60 s para que la edad del último intento
  // no quede congelada si el panel queda abierto.
  const [, setTick] = useState(0);

  // ── Ronda 5.6: disparo manual desde la UI ──
  const [runKey, setRunKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyFormOpen, setKeyFormOpen] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [runMsg, setRunMsg] = useState<RunMsg | null>(null);

  // Ronda 3 — CORRECCIÓN del aviso de error que salía al entrar: antes
  // load() hacía setError(true) AL MONTAR, así que el ErrorState se pintaba
  // de inmediato y desaparecía solo cuando llegaban los datos. Ahora el
  // error SOLO se marca si la petición realmente falla; mientras tanto hay
  // un esqueleto de carga.
  const load = () => {
    setLoading(true);
    setError(false);
    void adminGetMetrics()
      .then((m) => {
        setMetrics(m);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  // ── Escucha EN VIVO del doc rates/bcv (ronda 5.53) ──
  // onSnapshot PROPIO (no el hook público): la tarjeta necesita fechaValor,
  // lastAttemptAt (pulso del vigía) y next*, que useBcvRate no expone.
  // Cualquier escritura del cron (horaria) o de fn-runBcvRate repinta sola.
  useEffect(() => {
    let alive = true;
    let unsub: (() => void) | null = null;
    void loadFirebase().then((fb) => {
      if (!alive) return;
      if (!fb) {
        setRate(null); // demo/sin Firebase: mensaje «Aún no publicada»
        return;
      }
      unsub = onSnapshot(
        doc(fb.db, 'rates', 'bcv'),
        (snap) => {
          if (!alive) return;
          if (!snap.exists()) {
            setRate(null);
            return;
          }
          const d = snap.data();
          setRate({
            usdToVes: Number(d['usdToVes'] ?? 0),
            fechaValor: String(d['fechaValor'] ?? ''),
            updatedAt: Number(d['updatedAt'] ?? 0),
            lastAttemptAt: Number(d['lastAttemptAt'] ?? 0),
            source: String(d['source'] ?? 'fallback'),
            lastError: String(d['lastError'] ?? ''),
            nextUsdToVes: Number(d['nextUsdToVes'] ?? 0),
            nextFechaValor: String(d['nextFechaValor'] ?? ''),
            nextCapturedAt: Number(d['nextCapturedAt'] ?? 0),
          });
        },
        () => {
          if (!alive) return;
          setRate(null);
          setRunMsg({ kind: 'err', text: 'No se pudo escuchar rates/bcv en Firestore (revisa tu conexión).' });
        },
      );
    });
    return () => {
      alive = false;
      if (unsub) unsub();
    };
  }, []);

  // Clave guardada en sessionStorage (si la hay) al montar.
  useEffect(() => {
    try {
      setRunKey(sessionStorage.getItem(RUN_KEY_STORAGE));
    } catch {
      /* sessionStorage bloqueado (privado): se pedirá cada vez */
    }
  }, []);

  useEffect(load, []);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 60_000);
    return () => clearInterval(id);
  }, []);

  /** Resume el estado devuelto por fn-runBcvRate en una línea legible. */
  const summarizeRun = (r: BcvRateInfo): string => {
    if (r.source === 'bcv.org.ve') {
      const base = `Lectura OK: tasa vigente ${rateText(r.usdToVes)} · fecha valor ${fmtFechaValor(r.fechaValor)}.`;
      if (r.nextUsdToVes > 0) {
        return `${base} Nueva tasa capturada: ${rateText(r.nextUsdToVes)} — se activa sola a las 12:00 AM.`;
      }
      return base;
    }
    return `El BCV no respondió; se mantiene la tasa vigente ${rateText(r.usdToVes)}. Motivo: ${r.lastError || 'desconocido'} (revisa los logs de Netlify).`;
  };

  /** «Leer BCV ahora»: dispara fn-runBcvRate con la clave y muestra el resultado. */
  const runNow = (key: string) => {
    if (runBusy) return;
    setRunBusy(true);
    setRunMsg(null);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
    void (async () => {
      try {
        const res = await fetch(`${RUN_URL}?key=${encodeURIComponent(key)}`, { signal: ctrl.signal });
        const body: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const err = (body as { error?: { message?: string } } | null)?.error?.message ?? '';
          const fallback404 = 'La función fn-runBcvRate no existe en este deploy: haz un deploy nuevo del sitio.';
          const msg =
            res.status === 403 ? 'Clave inválida: compara BCV_RUN_KEY en Netlify → Environment variables.'
            : res.status === 503 ? err || 'Configura BCV_RUN_KEY en Netlify (Environment variables) y haz un deploy nuevo.'
            : res.status === 404 ? fallback404
            : err || `Error HTTP ${res.status} al disparar la lectura.`;
          setRunMsg({ kind: 'err', text: msg });
          return;
        }
        const result = (body as { result?: BcvRateInfo } | null)?.result;
        if (!result) {
          setRunMsg({ kind: 'err', text: 'Respuesta inesperada del servidor (sin campo result).' });
          return;
        }
        setRunMsg({ kind: 'ok', text: summarizeRun(result) });
        // La tarjeta se refresca SOLA: el onSnapshot propaga lo que el backend
        // acaba de escribir en rates/bcv (ronda 5.53).
      } catch (e) {
        const abort = (e as Error)?.name === 'AbortError';
        setRunMsg({
          kind: 'err',
          text: abort
            ? 'Se agotó la espera (32 s): el BCV tardó demasiado. Revisa Netlify → Functions → fn-runBcvRate → Latest logs.'
            : `Fallo de red: ${(e as Error)?.message ?? 'sin conexión con el servidor'}.`,
        });
      } finally {
        clearTimeout(timer);
        setRunBusy(false);
      }
    })();
  };

  /** Click en «Leer BCV ahora»: con clave guardada corre directo; sin clave, pide el formulario. */
  const handleRunClick = () => {
    if (runKey) runNow(runKey);
    else setKeyFormOpen(true);
  };

  /** Guarda la clave en sessionStorage y ejecuta de una vez. */
  const saveKeyAndRun = (e: FormEvent) => {
    e.preventDefault();
    const k = keyDraft.trim();
    if (!k) return;
    setRunKey(k);
    try {
      sessionStorage.setItem(RUN_KEY_STORAGE, k);
    } catch {
      /* sin storage: se usa solo esta vez */
    }
    setKeyFormOpen(false);
    setKeyDraft('');
    runNow(k);
  };

  const forgetKey = () => {
    setRunKey(null);
    try {
      sessionStorage.removeItem(RUN_KEY_STORAGE);
    } catch {
      /* noop */
    }
  };

  const maxDay = metrics ? Math.max(1, ...metrics.ordersLast7d) : 1;
  const hayPedidos7d = metrics ? metrics.ordersLast7d.some((n) => n > 0) : false;
  // Día de HOY en el eje lun→dom (0=lun … 6=dom): es la barra resaltada.
  const hoyIdx = (new Date().getDay() + 6) % 7;

  // ── Vigía del cron (ronda 5.5) ──
  // lastAttemptAt se escribe en CADA lectura del cron (tasa nueva o no):
  // es el pulso de update-bcv-rate. Más de 2 h de silencio = cron detenido.
  const staleMs = rate && rate.lastAttemptAt > 0 ? Date.now() - rate.lastAttemptAt : -1;
  const cronNeverRan = rate != null && rate.lastAttemptAt === 0;
  const cronStale = rate != null && staleMs > STALE_MS;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl font-bold italic uppercase text-paper">Métricas</h2>
        <p className="spot-subtitle mt-1">Pedidos por estado y ventas agregadas por el servidor.</p>
      </div>

      {/* Tasa BCV — SIEMPRE visible, independiente de las métricas */}
      <section aria-labelledby="bcv-metrics">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 id="bcv-metrics" className="spot-title text-xl">Tasa BCV</h3>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" loading={runBusy} onClick={handleRunClick}>
              Leer BCV ahora
            </Button>
          </div>
        </div>

        {/* Formulario de clave (solo si falta) */}
        {keyFormOpen && !runKey && (
          <form onSubmit={saveKeyAndRun} className="mb-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
            <label htmlFor="bcv-run-key" className="spot-label">Clave de disparo (BCV_RUN_KEY de Netlify)</label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="bcv-run-key"
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="Pega la clave aquí"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-brand border-2 border-line bg-ink px-3 py-2 font-mono text-sm text-paper outline-none placeholder:text-paper/40 focus:border-paper"
              />
              <Button type="submit" variant="primary" size="sm" disabled={!keyDraft.trim()}>
                Guardar y ejecutar
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setKeyFormOpen(false)}>
                Cancelar
              </Button>
            </div>
            <p className="mt-2 spot-label">
              Se configura en Netlify → Site configuration → Environment variables → BCV_RUN_KEY (si la acabas de
              crear, necesita un deploy nuevo para llegar a las funciones). La clave queda SOLO en este navegador
              (sessionStorage) y muere al cerrarlo.
            </p>
          </form>
        )}

        {/* Resultado del disparo manual (éxito o error exacto) */}
        {runMsg && (
          <div
            role="status"
            className={`mb-4 flex flex-wrap items-center justify-between gap-2 rounded-brand border-2 p-4 ${
              runMsg.kind === 'ok' ? 'border-ink bg-ink' : 'border-red-500 bg-ink'
            }`}
          >
            <p className={`spot-label ${runMsg.kind === 'err' ? 'text-red-400' : 'text-paper'}`}>{runMsg.text}</p>
            {runKey && (
              <Button variant="ghost" size="sm" onClick={forgetKey}>
                Olvidar clave
              </Button>
            )}
          </div>
        )}

        <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          {rate === undefined ? (
            <p className="spot-label">Cargando tasa…</p>
          ) : rate === null ? (
            <p className="spot-label">
              Aún no publicada. Pulsa «Leer BCV ahora» para capturar la primera tasa, o se activa sola con el
              próximo deploy.
            </p>
          ) : (
            <>
              {/* Franja ámbar: el cron de la tasa está detenido (o nunca corrió) */}
              {(cronNeverRan || cronStale) && (
                <div
                  role="alert"
                  className="mb-4 rounded-brand border-2 border-ink bg-amber-500 p-4 text-ink"
                >
                  <p className="font-display text-sm font-bold italic uppercase">
                    {cronNeverRan
                      ? 'La lectura automática de la tasa nunca ha corrido'
                      : `Sin lecturas automáticas hace ${fmtEdad(staleMs)} (lo normal: cada hora)`}
                  </p>
                  <p className="mt-1 text-sm">
                    Mientras lo reparas, <span className="font-bold">«Leer BCV ahora»</span> mantiene la tasa al día.
                    Verifica en orden:
                  </p>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">
                    <li>
                      Netlify → <span className="font-bold">Functions → update-bcv-rate → Function configuration</span>:
                      debe mostrar <span className="font-bold">Schedule: 0 * * * *</span>. Si no aparece, un deploy
                      nuevo lo re-registra (Netlify → Deploys → Trigger deploy).
                    </li>
                    <li>
                      Netlify → <span className="font-bold">Functions → update-bcv-rate → Latest logs</span>:
                      debe haber una invocación por hora (motivos de fallo: «red» = WAF del BCV, «html» = cambió
                      la página).
                    </li>
                    <li>
                      Disparo inmediato con el botón <span className="font-bold">«Leer BCV ahora»</span> (arriba) o
                      abriendo{' '}
                      <span className="font-bold break-all">/.netlify/functions/fn-runBcvRate?key=TU_CLAVE</span>{' '}
                      (requiere BCV_RUN_KEY).
                    </li>
                  </ol>
                </div>
              )}
              <div className="flex flex-wrap items-end justify-between gap-6">
                <div>
                  <p className="spot-label">Tasa vigente (Bs por USD)</p>
                  <BigFigure>{rateText(rate.usdToVes)}</BigFigure>
                  <p className="mt-1 spot-label">Fecha valor: {fmtFechaValor(rate.fechaValor)}</p>
                </div>
                <div className="min-w-0 text-right">
                  <p className="spot-label">
                    {rate.lastAttemptAt > 0
                      ? `Último intento: ${new Date(rate.lastAttemptAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'Sin intentos aún'}
                  </p>
                  <p className="mt-1 spot-label">
                    {rate.source === 'bcv.org.ve'
                      ? 'Resultado: capturada de bcv.org.ve (oficial)'
                      : 'Resultado: el BCV no respondió — se mantiene la tasa vigente'}
                  </p>
                  <p className="mt-1 spot-label">
                    {rate.updatedAt > 0
                      ? `Tasa vigente desde: ${new Date(rate.updatedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
                      : 'Sin lectura aún'}
                  </p>
                </div>
              </div>
              {rate.nextUsdToVes > 0 && (
                <div className="mt-4 rounded-brand border-2 border-line bg-ink p-4">
                  <p className="spot-label">
                    Nueva tasa pendiente
                    {rate.nextCapturedAt > 0
                      ? ` (capturada el ${new Date(rate.nextCapturedAt).toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`
                      : ''}{' '}
                    · fecha valor {fmtFechaValor(rate.nextFechaValor)}:{' '}
                    <span className="font-display font-bold text-paper">{rateText(rate.nextUsdToVes)}</span>{' '}
                    — se activa sola a las 12:00 AM.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Métricas del servidor: en local la función no existe (aviso normal). */}
      {!metrics ? (
        loading ? (
          <ListSkeleton rows={4} />
        ) : error ? (
          <ErrorState
            onRetry={load}
            message="Las métricas las calcula fn-getAdminMetrics en el servidor. En local esa función no existe (normal): funcionará tras el deploy."
          />
        ) : (
          <ListSkeleton rows={4} />
        )
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
              <p className="spot-label">Ventas 30 días</p>
              <BigFigure tone="signal">{formatUsd(metrics.revenueUsd30d).replace('US$', '$')}</BigFigure>
            </div>
            <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
              <p className="spot-label">Pedidos totales</p>
              <BigFigure>
                {Object.values(metrics.ordersByStatus).reduce((a, b) => a + b, 0)}
              </BigFigure>
            </div>
            <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
              <p className="spot-label">En ruta ahora</p>
              <BigFigure>{metrics.ordersByStatus['en_camino'] ?? 0}</BigFigure>
            </div>
          </div>

          {/* Por estado */}
          <section aria-labelledby="status-metrics">
            <h3 id="status-metrics" className="mb-4 spot-title text-xl">Pedidos por estado</h3>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ORDER_STATUSES.filter((s): s is OrderStatus => s !== 'entregado' || true).map((s) => (
                <li key={s} className="rounded-brand-lg border-2 border-line bg-surface-1 p-4">
                  <p className="spot-label">{STATUS_LABELS[s]}</p>
                  <p className="mt-1 font-display text-3xl font-extrabold italic text-paper">
                    {metrics.ordersByStatus[s] ?? 0}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          {/* Semana actual lun→dom — FIX 5.75: (a) las barras medían 0 px
              (height % contra columna sin altura definida): el gráfico nunca
              se vio — ahora la columna estira la caja y muestra su número;
              (b) ventana cambiada de «rodante 7 días» a SEMANA FIJA lun→dom
              (a pedido del dueño); la barra de HOY se resalta en señal. */}
          <section aria-labelledby="week-metrics">
            <h3 id="week-metrics" className="mb-4 spot-title text-xl">Pedidos de la semana (lun → dom)</h3>
            {hayPedidos7d ? (
              <div className="flex h-40 items-end gap-3 rounded-brand-lg border-2 border-line bg-surface-1 p-6">
                {metrics.ordersLast7d.map((n, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span aria-hidden="true" className="font-display text-sm font-bold italic text-paper">{n}</span>
                    <div
                      className={`w-full rounded-t-brand ${i === hoyIdx ? 'bg-signal' : 'bg-surface-3'}`}
                      style={{ height: `${Math.max(3, (n / maxDay) * 60)}%` }}
                      role="img"
                      aria-label={`${n} pedidos`}
                    />
                    <span className="spot-label">{['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'][i]}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-brand-lg border-2 border-line bg-surface-1 p-6 spot-label">
                Sin pedidos esta semana. En cuanto entren, aparecen aquí por día.
              </p>
            )}
          </section>

          <SpeedLines />
        </>
      )}
    </div>
  );
}

/** Formatea la tasa al estilo venezolano: 36,58 */
function rateText(usdToVes: number): string {
  if (!(usdToVes > 0)) return '—';
  return usdToVes.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** «2026-09-29» → «Martes, 29 de septiembre de 2026» (— si viene vacía). */
function fmtFechaValor(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Milisegundos → «3 h 24 min» / «47 min» (edad del último intento del cron). */
function fmtEdad(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem > 0 ? `${h} h ${rem} min` : `${h} h`;
}