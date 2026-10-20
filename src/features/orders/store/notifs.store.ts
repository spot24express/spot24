/**
 * Módulo orders · 5.90 — Store del historial de avisos (Zustand, patrón
 * cart.store/auth.store). UNA sola suscripción en vivo para toda la app:
 * la campana de la barra (TopBar) y la página /notificaciones leen el MISMO
 * estado — startFor es idempotente, quien monte primero conecta el canal y
 * el resto solo lee. Con logout (uid → null) el canal se cierra y el estado
 * se limpia.
 *
 * La marca de lectura (lastReadMs) viaja en users/{uid}.notifsLastReadAt:
 * al abrir la página markAllRead() la adelanta a AHORA (1 write) y el punto
 * rojo de la campana se apaga al instante en toda la app, sin tocar los
 * 30 avisos uno por uno.
 *
 * 5.90.1 · CANAL A PRUEBA DE CORTES (diagnóstico de campo del dueño: el
 * centro «funcionaba» y se congelaba a mitad del pedido): el SDK de Firestore
 * NO reengancha un listener que murió (QUIC/Wi-Fi/cambio de red) — si ya
 * había datos en pantalla, la lista quedaba SORDA en silencio mientras el
 * push seguía llegando por FCM (otro canal). Ahora el store:
 *  · RECONECTA SOLO con backoff (3 s → 6 s → … → 60 s) al morir el canal;
 *  · levanta `stale` para que la página avise «lista desactualizada»
 *    en vez de fingir que está en vivo;
 *  · el intento que llega a buen puerto (snapshot con datos) resetea el
 *    backoff a cero.
 */
import { create } from 'zustand';
import {
  leerLastReadMs, marcarNotifsLeidas, nextReconnectDelayMs, subscribeNotifs,
  type NotifItem,
} from '../services/notifs.service';

interface NotifsState {
  notifs: NotifItem[];
  /** Marca «leído hasta aquí» local (ms). 0 = nunca abrió el panel. */
  lastReadMs: number;
  /** true cuando la marca ya cargó del doc del usuario (página congela umbral). */
  lastReadLoaded: boolean;
  /** true cuando el PRIMER snapshot llegó (para el skeleton de la página). */
  ready: boolean;
  /** true si el canal falló y aún no llega ningún dato (pantalla de error). */
  failed: boolean;
  /** 5.90.1 · true si el canal murió CON datos en pantalla (aviso discreto:
   *  la lista puede estar desactualizada hasta que la reconexión repone). */
  stale: boolean;
  uid: string | null;
  /** Conecta el canal para el uid (idempotente) o lo cierra si uid es null. */
  startFor: (uid: string | null) => void;
  /** Adelanta la marca de lectura a AHORA (local + Firestore). */
  markAllRead: () => Promise<void>;
}

interface NotifsInternals {
  /** Des-suscriptor vivo del canal (interno; lo maneja startFor/stop). */
  unsub: (() => void) | null;
  /** 5.90.1 · Reintentos consecutivos del canal (0 = sano; sube el backoff). */
  attempts: number;
  /** 5.90.1 · Temporizador de reconexión pendiente (nunca se acumulan dos). */
  timer: ReturnType<typeof setTimeout> | null;
  /** Cierra el canal y limpia el estado (logout). */
  stop: () => void;
}

export const useNotifsStore = create<NotifsState & NotifsInternals>((set, get) => ({
  notifs: [],
  lastReadMs: 0,
  lastReadLoaded: false,
  ready: false,
  failed: false,
  stale: false,
  uid: null,
  unsub: null,
  attempts: 0,
  timer: null,

  stop: () => {
    get().unsub?.();
    const timer = get().timer;
    if (timer) clearTimeout(timer);
    set({
      notifs: [], lastReadMs: 0, lastReadLoaded: false, ready: false,
      failed: false, stale: false, uid: null, unsub: null, attempts: 0, timer: null,
    });
  },

  startFor: (uid) => {
    const cur = get();
    cur.unsub?.();
    if (cur.timer) clearTimeout(cur.timer);
    if (!uid) {
      set({
        notifs: [], lastReadMs: 0, lastReadLoaded: false, ready: false,
        failed: false, stale: false, uid: null, unsub: null, attempts: 0, timer: null,
      });
      return;
    }
    // Estado fresco por cambio de cuenta; el uid queda fijo YA para que la
    // UI (campana) sepa que hay canal aunque el primer snapshot tarde.
    set({
      notifs: [], lastReadMs: 0, lastReadLoaded: false, ready: false,
      failed: false, stale: false, uid, unsub: null, attempts: 0, timer: null,
    });

    // La marca de lectura es UNA lectura del doc del usuario (barata); si
    // falla queda 0: solo implicaría punto rojo de más, jamás de menos.
    void leerLastReadMs(uid)
      .then((ms) => {
        // Cierre de carrera: otro uid ya es dueño del canal → descartado.
        // MONÓTONA: la marca nunca retrocede — si markAllRead ya adelantó
        // a AHORA (visita en curso), el valor viejo del doc se ignora.
        if (get().uid === uid) {
          set({
            lastReadMs: ms > get().lastReadMs ? ms : get().lastReadMs,
            lastReadLoaded: true,
          });
        }
      })
      .catch(() => {
        if (get().uid === uid) set({ lastReadLoaded: true });
      });

    /** 5.90.1 · Programa la reconexión con backoff (UNA sola pendiente). */
    const scheduleReconnect = () => {
      const st = get();
      if (st.uid !== uid || st.timer) return;
      const delay = nextReconnectDelayMs(st.attempts);
      set({ attempts: st.attempts + 1 });
      const timer = setTimeout(() => {
        const now = get();
        if (now.uid !== uid) return; // cambió de cuenta mientras esperaba
        now.unsub?.(); // cierra el listener muerto (higiene, ya no emite)
        set({ timer: null, unsub: null });
        connect();
      }, delay);
      set({ timer });
    };

    const connect = () => {
      // Guardia de carrera: el canal sigue siendo de ESTE uid.
      if (get().uid !== uid) return;
      const unsub = subscribeNotifs(
        uid,
        (notifs) => set({ notifs, ready: true, failed: false, stale: false, attempts: 0 }),
        () => {
          // Sin datos → pantalla de error (como siempre, con Reintentar).
          // Con datos → NUNCA silencio: aviso de «desactualizada» y el
          // propio store reengancha el canal con backoff (el SDK no lo hace).
          if (!get().ready) set({ failed: true, ready: true });
          else set({ stale: true });
          scheduleReconnect();
        },
      );
      set({ unsub });
    };

    connect();
  },

  markAllRead: async () => {
    const { uid, lastReadMs } = get();
    if (!uid) return;
    const now = Date.now();
    // Optimista: la campana se apaga al instante en TODA la app (estado
    // compartido). Si el write falla, al recargar el punto volvería —
    // best-effort, sin toast (el aviso sigue visible igualmente).
    if (now > lastReadMs) set({ lastReadMs: now });
    try {
      await marcarNotifsLeidas(uid, now);
    } catch {
      /* silencio: la marca local ya evita el puntito en esta sesión */
    }
  },
}));
