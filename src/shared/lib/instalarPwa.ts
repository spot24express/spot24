/**
 * 5.139 · Instalación de la PWA — lógica pura + captura temprana del evento.
 *
 * PROBLEMA (reporte del dueño, nov 2025): en Android «antes salía» la barra
 * de instalación y «ahora no sale». Esa barra NO era de la app: era la
 * mini-infobar AUTOMÁTICA de Chrome, que solo aparece cuando Chrome quiere:
 *   · exige «engagement» (varias visitas/interacciones acumuladas);
 *   · si el usuario la descarta un par de veces, Chrome deja de mostrarla;
 *   · si la app ya está instalada en el teléfono, NUNCA vuelve a salir;
 *   · tampoco sale sin service worker (p. ej. en `npm run dev` o por http
 *     de red local — solo el deploy de producción HTTPS es instalable).
 * En iPhone «la instrucción» que sí sale es la SUYA propia (ronda
 * instalar-iphone): iOS nunca dispara beforeinstallprompt, por eso esa vía
 * siempre fue manual y por eso se ve.
 *
 * SOLUCIÓN (esta ronda): banner PROPIO de instalación para Android.
 * Chrome entrega el evento `beforeinstallprompt` apenas considera la página
 * instalable — sin depender del engagement ni de la barra automática. La app
 * toma el evento (preventDefault → se suprime la mini-infobar de Chrome y
 * queda la nuestra) y muestra el banner con el botón «Instalar», que llama
 * al diálogo oficial `prompt()` del navegador.
 *
 * Este archivo es LÓGICA PURA (testeable en node sin DOM):
 *   · detectarPlataforma()  → clasifica el user-agent (Android / iOS / PC).
 *   · debeMostrarBanner()   → matriz de decisión del banner.
 *   · capturarEventoInstalacion() → escucha global de beforeinstallprompt
 *     desde el momento en que se importa el módulo (antes del primer render):
 *     si el SW ya estaba registrado de una visita anterior, Chrome puede
 *     disparar el evento casi al instante y sin esto se perdería.
 *   · obtenerEventoInstalacion()  → devuelve el evento guardado (o null).
 */

/** Clave de sessionStorage para «Ahora no» (solo dura la visita, no para siempre). */
export const KEY_SESION_DESCARTADO = 'spot24-instalar-descartado';

/** Clasificación mínima del dispositivo para la instalación de la PWA. */
export type PlataformaInstalacion = {
  /** iPhone / iPad / iPod (iPadOS 13+ se hace pasar por Mac: se detecta con maxTouchPoints). */
  esIos: boolean;
  /** Android (Chrome, Samsung Internet, Firefox…) — donde opera el banner propio. */
  esAndroid: boolean;
  /** Todo lo demás (Windows, macOS sin touch, Linux). */
  esEscritorio: boolean;
};

/**
 * Clasifica un user-agent. `maxTouchPoints` (default 0) solo se usa para la
 * trampa del iPadOS: su UA es de macOS pero con pantalla táctil.
 */
export function detectarPlataforma(ua: string, maxTouchPoints = 0): PlataformaInstalacion {
  const u = (ua || '').toLowerCase();
  const esIos =
    /iphone|ipad|ipod/.test(u) || (/macintosh/.test(u) && maxTouchPoints > 1);
  const esAndroid = /android/.test(u) && !esIos;
  return { esIos, esAndroid, esEscritorio: !esIos && !esAndroid };
}

/** Condiciones con las que se decide si el banner de instalación se ve. */
export type CondicionBanner = {
  /** El navegador entregó el evento beforeinstallprompt (es instalable). */
  hayPrompt: boolean;
  /** Solo Android: en iPhone ya existe la instrucción propia (Safari). */
  esAndroid: boolean;
  /** Ya corre como app instalada (display-mode: standalone). */
  standalone: boolean;
  /** El usuario pulsó «Ahora no» en esta visita (sessionStorage). */
  descartado: boolean;
};

/** Matriz de decisión: instalable + Android + NO instalada + NO descartada. */
export function debeMostrarBanner(c: CondicionBanner): boolean {
  return c.hayPrompt && c.esAndroid && !c.standalone && !c.descartado;
}

/**
 * Evento propietario de Chrome/Edge/Samsung Internet. No está en lib.dom,
 * se tipa localmente (sin tocar los tipos globales del proyecto).
 */
export type EventoInstalacionPwa = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

/* ------------------------------------------------------------------ */
/* Captura TEMPRANA (module scope): corre al importar el módulo, antes  */
/* del primer render de React.                                          */
/* ------------------------------------------------------------------ */

let eventoInstalable: EventoInstalacionPwa | null = null;
let capturaInstalada = false;

/** Idempotente: instala el oyente global UNA sola vez. No-op sin window (tests). */
export function capturarEventoInstalacion(): void {
  if (typeof window === 'undefined' || capturaInstalada) return;
  capturaInstalada = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    // preventDefault: sin esto Chrome MOSTRARÍA TAMBIÉN su mini-infobar
    // automática y saldrían dos ofertas de instalación a la vez.
    e.preventDefault();
    eventoInstalable = e as EventoInstalacionPwa;
  });
  // App instalada → el evento guardado queda gastado: fuera.
  window.addEventListener('appinstalled', () => {
    eventoInstalable = null;
  });
}

/** Devuelve el evento capturado (si Chrome ya dijo «instalable») o null. */
export function obtenerEventoInstalacion(): EventoInstalacionPwa | null {
  return eventoInstalable;
}

/** Gasta el evento tras usarlo (prompt() solo puede llamarse una vez por evento). */
export function gastarEventoInstalacion(): void {
  eventoInstalable = null;
}