import { useEffect, useState } from 'react';
import { debeMostrarAvisoIOS, esSafariIOS, leerEntorno, ocultarAviso } from '@/shared/lib/instalar';

/**
 * SPOT 24 · Ronda 5.110 · Aviso de instalación para iPhone/iPad.
 * Android ya muestra el aviso NATIVO de Chrome (manifest + service worker).
 * iOS no lo tiene: Safari nunca dispara beforeinstallprompt, así que el aviso
 * se construye aquí con los 3 pasos exactos del teléfono:
 *   Compartir → «Agregar a pantalla de inicio» → Agregar.
 *
 * Comportamiento (la decisión vive en shared/lib/instalar.ts, con tests):
 * · SOLO dispositivos Apple; si la app ya está instalada (standalone) o el
 *   usuario cerró el aviso antes, no aparece jamás.
 * · Entra a los 1.6 s (deja pasar la carga: no compite con la fachada) con
 *   una subida suave; la anula el bloque global prefers-reduced-motion.
 * · En Safari muestra los pasos; en Chrome/WhatsApp/Instagram de iOS añade
 *   «ábrela en Safari» (instalar solo se puede desde Safari).
 * · En el teléfono flota sobre la barra inferior SIN tapar el botón de
 *   WhatsApp; en iPad (sin barra) baja a la esquina izquierda — la derecha
 *   ya está ocupada por ese botón.
 */

/** Icono «Compartir» de iOS: cuadrado con la flecha hacia arriba. */
function IconoCompartirIOS() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="inline-block align-[-2px]"
    >
      <path d="M12 15V3" />
      <path d="M7.5 7 12 2.5 16.5 7" />
      <path d="M7 11H5.5A1.5 1.5 0 0 0 4 12.5v7A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 18.5 11H17" />
    </svg>
  );
}

const PASOS = [
  <>Toca <strong className="text-paper">Compartir</strong> <IconoCompartirIOS /> — el cuadrado con la flecha.</>,
  <>Baja y elige <strong className="text-paper">«Agregar a pantalla de inicio»</strong>.</>,
  <>Toca <strong className="text-paper">«Agregar»</strong>. SPOT 24 queda como una app más.</>,
];

export function InstalarEnIphone() {
  const [visible, setVisible] = useState(false);
  const [entra, setEntra] = useState(false);
  const [enSafari, setEnSafari] = useState(true);

  useEffect(() => {
    // 1.6 s de cortesía: la primera pantalla manda (fachada del héroe).
    const t = window.setTimeout(() => {
      const env = leerEntorno();
      if (env && debeMostrarAvisoIOS(env)) {
        setEnSafari(esSafariIOS(env.ua));
        setVisible(true);
        // Doble paso para que la transición de entrada corra suave.
        window.requestAnimationFrame(() => setEntra(true));
      }
    }, 1600);
    return () => window.clearTimeout(t);
  }, []);

  if (!visible) return null;

  const cerrar = () => {
    setEntra(false);
    setVisible(false);
    ocultarAviso(); // no volver a molestar (localStorage)
  };

  return (
    <aside
      aria-label="Instalar SPOT 24 en iPhone"
      className={`fixed inset-x-3 bottom-[140px] z-40 rounded-brand-lg border-2 border-line bg-surface-1 p-4 shadow-lg transition-all duration-200 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[22rem] ${
        entra ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-base font-bold italic uppercase text-paper">
          Lleva SPOT 24 a tu inicio
        </p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar aviso de instalación"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-brand text-muted transition hover:text-paper"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      {!enSafari && (
        <p className="mt-1 text-xs font-semibold text-signal">
          Estás en otro navegador: ábrelo en Safari para poder instalarlo.
        </p>
      )}

      <ol className="mt-3 space-y-2.5">
        {PASOS.map((paso, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-brand bg-signal font-display text-xs font-bold italic text-paper">
              {i + 1}
            </span>
            <span className="text-sm leading-snug text-muted">{paso}</span>
          </li>
        ))}
      </ol>
    </aside>
  );
}