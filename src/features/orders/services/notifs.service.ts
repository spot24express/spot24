/**
 * Módulo orders · 5.90 — Historial in-app de avisos (campana /notificaciones).
 *
 * El SERVIDOR escribe cada aviso en users/{uid}/notifs (subcolección privada,
 * solo-lectura para el cliente según reglas) en el mismo momento que manda el
 * push. Aquí solo hay LECTURA en vivo (onSnapshot, limit 30, más nuevo
 * arriba), la marca de «leído hasta aquí» (notifsLastReadAt en users/{uid}:
 * 1 write por visita a la página, sin tocar avisos) y helpers PUROS para
 * probar el conteo y las fechas sin Firebase.
 *
 * El punto rojo es DERIVADO: hay aviso sin leer si su createdAtMs es mayor a
 * la marca de última lectura — así abrir la página apaga la campana al
 * instante (estado local) sin 30 writes.
 */
import {
  collection, doc, getDoc, limit as fbLimit, onSnapshot, orderBy, query, updateDoc,
} from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';

const NOTIFS_PAGE = 30;

/** Tamaño de página público: la UI acota la lista a lo mismo que escucha. */
export const NOTIFS_PAGE_SIZE = NOTIFS_PAGE;

/** Un aviso del historial (espejo del doc users/{uid}/notifs del servidor). */
export interface NotifItem {
  id: string;
  /** Código del pedido (p.ej. SP-260102-0001); '' si el aviso no lo traía. */
  code: string;
  /** Estado del pedido en el momento del aviso (pendiente…entregado). */
  status: string;
  title: string;
  body: string;
  createdAtMs: number;
}

function mapNotif(id: string, d: Record<string, unknown>): NotifItem {
  return {
    id,
    code: String(d['code'] ?? ''),
    status: String(d['status'] ?? ''),
    title: String(d['title'] ?? ''),
    body: String(d['body'] ?? ''),
    createdAtMs: Number(d['createdAtMs'] ?? 0),
  };
}

/**
 * Suscripción EN VIVO al historial (más nuevo arriba). La campana y la
 * página comparten el store, así que este listener es el ÚNICO canal:
 * se monta con la sesión y vive hasta el logout. Devuelve el des-suscriptor
 * (patrón subscribeMyOrders: cierre seguro si se llama antes de conectar).
 */
export function subscribeNotifs(
  uid: string,
  onData: (notifs: NotifItem[]) => void,
  onError: () => void,
): () => void {
  let unsub: (() => void) | null = null;
  let dead = false;
  void (async () => {
    const bundle = await loadFirebase();
    if (dead) return;
    if (!bundle) {
      onError();
      return;
    }
    const q = query(
      collection(bundle.db, 'users', uid, 'notifs'),
      orderBy('createdAtMs', 'desc'),
      fbLimit(NOTIFS_PAGE),
    );
    unsub = onSnapshot(
      q,
      (snap) => onData(snap.docs.map((d) => mapNotif(d.id, d.data() as Record<string, unknown>))),
      () => onError(),
    );
  })();
  return () => {
    dead = true;
    unsub?.();
  };
}

/** Marca de «leído hasta aquí» guardada en users/{uid}. 0 si no existe. */
export async function leerLastReadMs(uid: string): Promise<number> {
  const bundle = await loadFirebase();
  if (!bundle) return 0;
  try {
    const snap = await getDoc(doc(bundle.db, 'users', uid));
    return Number(snap.data()?.['notifsLastReadAt'] ?? 0);
  } catch {
    return 0;
  }
}

/** Fija la marca de «leído hasta aquí» (regla 5.90: número acotado a ahora+1 min). */
export async function marcarNotifsLeidas(uid: string, ms: number): Promise<void> {
  const bundle = await loadFirebase();
  if (!bundle) return;
  await updateDoc(doc(bundle.db, 'users', uid), { notifsLastReadAt: ms });
}

/* ───────────────────────── Helpers PUROS (tests) ───────────────────────── */

/**
 * 5.90.1 · Retardo de la RECONEXIÓN automática del canal en vivo (backoff
 * exponencial con techo): 3 s → 6 s → 12 s → 24 s → 48 s → 60 s (tope).
 * El SDK de Firestore NO reengancha un listener que murió (corte QUIC/Wi-Fi,
 * cambio de red): si el store no lo hace por su cuenta, la campana queda
 * SORDA en silencio mientras los pushes siguen llegando por FCM (otro canal).
 * Intentos negativos/no finitos cuentan como 0 (primer reintento a los 3 s).
 */
export function nextReconnectDelayMs(attempts: number): number {
  const n = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  return Math.min(3000 * 2 ** n, 60000);
}

/**
 * Cuántos avisos son posteriores a la marca de última lectura. La comparación
 * es ESTRICTA (> ): un aviso creado exactamente en el mismo milisegundo de la
 * marca cuenta como leído (empate = ya visto) — evita puntos fantasma al
 * abrir la página y guardar la marca en el mismo instante.
 */
export function contarNoLeidas(
  notifs: readonly { createdAtMs: number }[],
  lastReadMs: number,
): number {
  return notifs.reduce((acc, n) => (n.createdAtMs > lastReadMs ? acc + 1 : acc), 0);
}

/**
 * Fecha CORTA local: «20/10/2026 3:45 p.m.» — misma voz que la lista de
 * copias de seguridad (5.89). Sin fecha válida → «—».
 */
export function fechaCortaNotif(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  let h = d.getHours();
  const ampm = h < 12 ? 'a.m.' : 'p.m.';
  h = h % 12;
  if (h === 0) h = 12;
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${h}:${min} ${ampm}`;
}
