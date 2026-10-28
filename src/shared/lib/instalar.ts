/**
 * SPOT 24 · Ronda 5.110 · Instalar la app en iPhone/iPad.
 * Android ya muestra el aviso nativo de Chrome (manifest + service worker).
 * iOS NO tiene ese aviso: Safari no dispara beforeinstallprompt, así que el
 * aviso hay que construirlo a mano con las instrucciones específicas
 * (Compartir → Agregar a pantalla de inicio).
 *
 * Este módulo decide CUÁNDO mostrar el aviso, sin React y sin navegador:
 * todo entra como parámetros inyectables para probarlo en node (tests).
 *
 * Reglas del aviso (las 3 a la vez):
 *  1. Dispositivo Apple (iPhone/iPad/iPod — incluidos los iPads modernos,
 *     que se presentan como «Macintosh» con pantalla táctil).
 *  2. La app NO está ya instalada (modo standalone).
 *  3. El usuario NO cerró el aviso antes (se recuerda en localStorage).
 */

/** Clave de localStorage que recuerda que el aviso se cerró. */
export const KEY_OCULTO = 'spot24-instalar-ios-oculto';

/** Datos del navegador que la decisión necesita (todo inyectable). */
export interface EntornoIOS {
  /** navigator.userAgent. */
  ua: string;
  /** navigator.maxTouchPoints (0 en PC de escritorio). */
  maxTouchPoints: number;
  /** matchMedia('(display-mode: standalone)').matches. */
  displayModeStandalone: boolean;
  /** navigator.standalone — propietario de iOS: true al abrir desde el inicio. */
  navigatorStandalone: boolean;
  /** localStorage.getItem(KEY_OCULTO): '1' si el aviso se cerró antes. */
  avisoOcultoGuardado: string | null;
}

/**
 * ¿Dispositivo Apple capaz de instalar la PWA?
 * · iPhone/iPod: UA con «iPhone» o «iPod».
 * · iPad clásico: UA con «iPad».
 * · iPad moderno (iPadOS 13+): se hace pasar por «Macintosh», pero sigue
 *   siendo táctil — maxTouchPoints > 1 lo delata (una Mac real tiene 0).
 */
export function esDispositivoApple(ua: string, maxTouchPoints: number): boolean {
  if (/iphone|ipod/i.test(ua)) return true;
  if (/ipad/i.test(ua)) return true;
  return /macintosh/i.test(ua) && maxTouchPoints > 1;
}

/**
 * ¿Safari de verdad? SOLO se pregunta en dispositivos Apple (aquí no importa
 * el resto). En iOS los «otros navegadores» reutilizan el motor de Safari y
 * su UA conserva «Safari/…» pero se delatan: CriOS (Chrome), FxiOS (Firefox),
 * EdgiOS (Edge), GSA (app de Google). Los webviews de WhatsApp/Instagram ni
 * siquiera llevan el token «Safari/». Instalar la PWA solo es posible desde
 * Safari: el aviso adaptará su texto en los demás.
 */
export function esSafariIOS(ua: string): boolean {
  return /safari\//i.test(ua) && !/crios|fxios|edgios|gsa\b/i.test(ua);
}

/**
 * La decisión completa: ¿toca mostrar el aviso de instalación?
 * Las 3 reglas del encabezado deben cumplirse a la vez.
 */
export function debeMostrarAvisoIOS(env: EntornoIOS): boolean {
  if (!esDispositivoApple(env.ua, env.maxTouchPoints)) return false;
  if (env.displayModeStandalone || env.navigatorStandalone) return false;
  if (env.avisoOcultoGuardado === '1') return false;
  return true;
}

/**
 * Lee el entorno REAL del navegador (para el componente). Devuelve null fuera
 * del navegador (SSR/tests en node) para que el componente ni se plantee
 * renderizar. localStorage puede fallar en navegación privada: se trata como
 * «aviso nunca cerrado» — siempre se podrá cerrar de nuevo.
 */
export function leerEntorno(): EntornoIOS | null {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return null;
  let oculto: string | null = null;
  try {
    oculto = window.localStorage.getItem(KEY_OCULTO);
  } catch {
    oculto = null;
  }
  const mql =
    typeof window.matchMedia === 'function'
      ? window.matchMedia('(display-mode: standalone)')
      : null;
  return {
    ua: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    displayModeStandalone: mql?.matches ?? false,
    navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone === true,
    avisoOcultoGuardado: oculto,
  };
}

/** Recuerda que el aviso se cerró (para no volver a molestar). */
export function ocultarAviso(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_OCULTO, '1');
  } catch {
    /* navegación privada: sin memoria, el aviso volverá — aceptable */
  }
}