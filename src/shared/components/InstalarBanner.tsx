/**
 * 5.139 · Banner de instalación de la PWA (Android).
 *
 * Por qué existe (reporte del dueño): en Android «antes salía» la oferta de
 * instalación y «ahora no». Esa oferta era la mini-infobar AUTOMÁTICA de
 * Chrome, que depende del humor del navegador (engagement acumulado, si el
 * usuario la descartó antes, si la app ya está instalada). En iPhone lo que
 * sale es la instrucción propia de la app (ronda instalar-iphone) y esa sí
 * siempre aparece.
 *
 * Qué hace: cuando Chrome considera la página instalable dispara el evento
 * `beforeinstallprompt` — la app lo intercepta (preventDefault, para que no
 * salga TAMBIÉN la barra de Chrome) y muestra este banner con su propio
 * botón «Instalar». Ese botón llama al diálogo OFICIAL del navegador
 * (`prompt()`), así que la instalación es 100% estándar: crea el ícono en
 * el teléfono, abre en su propia ventana sin barras, offline incluido.
 *
 * Comportamiento:
 *  · Solo Android con evento vivo. iPhone excluido (ya tiene su instrucción
 *    propia) y PC excluido (Chrome de escritorio ya ofrece el ícono en la
 *    barra de direcciones).
 *  · Si ya corre como app instalada (standalone) no se muestra jamás.
 *  · «Ahora no» guarda en sessionStorage: callado el resto de la VISITA,
 *    pero la próxima visita vuelve a ofrecerse (no se pierde para siempre).
 *  · Tras el diálogo del usuario (acepte o rechace) el banner se retira:
 *    el evento del navegador solo puede usarse una vez.
 */
import { useCallback, useEffect, useState } from 'react';
import { LogoShield } from '@/shared/components/brand/Logo';
import {
  capturarEventoInstalacion,
  obtenerEventoInstalacion,
  gastarEventoInstalacion,
  detectarPlataforma,
  debeMostrarBanner,
  KEY_SESION_DESCARTADO,
  type EventoInstalacionPwa,
} from '@/shared/lib/instalarPwa';

// Captura el evento LO ANTES POSIBLE (al importar el módulo, antes del primer
// render): si el service worker ya estaba registrado de una visita anterior,
// Chrome puede disparar beforeinstallprompt apenas carga la página.
capturarEventoInstalacion();

export function InstalarBanner() {
  // El evento puede llegar ANTES de que este componente se monte (captura
  // temprana del módulo) o DESPUÉS (oyente del efecto). Ambas vías caen aquí.
  const [evento, setEvento] = useState<EventoInstalacionPwa | null>(() =>
    obtenerEventoInstalacion(),
  );
  const [descartado, setDescartado] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem(KEY_SESION_DESCARTADO) === '1';
    } catch {
      return false;
    }
  });
  const [standalone] = useState<boolean>(() => {
    try {
      const yaInstalada =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      return yaInstalada;
    } catch {
      return false;
    }
  });
  const [esAndroid] = useState<boolean>(() => {
    try {
      return detectarPlataforma(navigator.userAgent, navigator.maxTouchPoints || 0).esAndroid;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onInstalable = (e: Event) => {
      e.preventDefault();
      setEvento(e as EventoInstalacionPwa);
    };
    const onInstalada = () => setEvento(null);
    window.addEventListener('beforeinstallprompt', onInstalable);
    window.addEventListener('appinstalled', onInstalada);
    return () => {
      window.removeEventListener('beforeinstallprompt', onInstalable);
      window.removeEventListener('appinstalled', onInstalada);
    };
  }, []);

  /** Lanza el diálogo OFICIAL del navegador desde el toque del usuario. */
  const instalar = useCallback(async () => {
    if (!evento) return;
    try {
      await evento.prompt();
      await evento.userChoice; // accepted → `appinstalled` ya retira todo; dismissed → igual se retira
    } catch {
      // El evento puede expirar si el usuario tardó demasiado: nada que hacer.
    }
    gastarEventoInstalacion();
    setEvento(null);
  }, [evento]);

  /** «Ahora no»: callado el resto de la visita (sessionStorage), no para siempre. */
  const ahoraNo = useCallback(() => {
    try {
      window.sessionStorage.setItem(KEY_SESION_DESCARTADO, '1');
    } catch {
      /* navegación privada: solo se retira en esta pantalla */
    }
    setDescartado(true);
    setEvento(null);
  }, []);

  const visible = debeMostrarBanner({
    hayPrompt: evento !== null,
    esAndroid,
    standalone,
    descartado,
  });
  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-[76px] z-40 sm:bottom-6" role="region" aria-label="Instalar SPOT 24">
      <div className="spot-container">
        <div className="mx-auto flex max-w-xl items-center gap-3 rounded-brand border-2 border-line bg-ink/95 p-3 shadow-xl backdrop-blur">
          <LogoShield className="h-10 w-auto shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold italic uppercase text-paper">
              Instalar SPOT 24
            </p>
            <p className="text-xs leading-snug text-muted">
              Ábrelo como app, directo en tu teléfono y sin recargar nada.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void instalar()}
            className="min-h-[44px] shrink-0 rounded-brand bg-signal px-4 spot-label text-paper transition active:scale-95"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={ahoraNo}
            className="min-h-[44px] shrink-0 rounded-brand px-2 spot-label text-muted transition hover:text-paper"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}