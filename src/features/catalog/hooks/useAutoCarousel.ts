/**
 * SPOT 24 · Ronda 5.98 · Carrusel auto-avance reutilizable (mismo patrón que
 * el carrusel de promos del Home): avanza solo cada `ms` (5 s), se PAUSA
 * mientras el usuario toca o desliza (pointer/wheel) y reanuda 10 s después.
 * Vitrina del Home que vende: «Vuelve a comprar», «Los más pedidos» y el
 * carrusel de promos comparten exactamente este comportamiento.
 *
 * 5.112-C · ESPERAR LA PRIMERA IMAGEN (opción `esperarPrimera`): con la
 * caída de imgbb del 29/10/2026 el carrusel «Visítanos» arrancaba su cuenta
 * de 5 s con el slide vacío (el placeholder azul de imgbb duraba un instante
 * y saltaba al siguiente). Con esta opción el auto-avance NO arranca hasta
 * que la primera imagen dispara `onLoad` (o `onError` → respaldo del repo).
 * · Tope de seguridad de 8 s: si la red está tan lenta que la imagen ni
 *   carga ni falla, el carrusel arranca igual (la espera no debe congelar
 *   el Home para siempre).
 * · El cambio de lista (el admin sube/edita promos) re-arma la espera.
 * Los carruseles de PRODUCTO siguen sin esperar: sus fotos ya tienen
 * respaldo instantáneo del repo (alFallarFoto).
 */
import { useCallback, useEffect, useRef, useState } from 'react';

/** Tope de espera de la primera imagen antes de arrancar igual (ms). */
const TOPE_ESPERA_MS = 8_000;

export function useAutoCarousel(count: number, ms = 5000, opciones?: { esperarPrimera?: boolean }) {
  const esperarPrimera = opciones?.esperarPrimera === true;
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);
  // 5.112-C · true cuando la primera imagen ya cargó (o falló → respaldo):
  // mientras sea false, el auto-avance no arranca.
  const [primeraLista, setPrimeraLista] = useState(false);

  // La lista cambia (alta/edición) → el carrusel vuelve a arrancar del inicio
  // y la espera de la primera imagen se re-arma con la lista nueva.
  useEffect(() => {
    setSlide(0);
    if (esperarPrimera) setPrimeraLista(false);
  }, [count, esperarPrimera]);

  // Tope de seguridad: imagen que ni carga ni falla (red moribunda) no
  // congela el carrusel — a los 8 s arranca de todos modos.
  useEffect(() => {
    if (!esperarPrimera || primeraLista) return;
    const tope = window.setTimeout(() => setPrimeraLista(true), TOPE_ESPERA_MS);
    return () => window.clearTimeout(tope);
  }, [esperarPrimera, primeraLista, count]);

  useEffect(() => {
    if (paused || count < 2) return;
    // 5.112-C · EL CANDADO: sin primera imagen lista, no hay cuenta regresiva.
    if (esperarPrimera && !primeraLista) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % count);
    }, ms);
    return () => window.clearInterval(id);
  }, [paused, count, ms, esperarPrimera, primeraLista]);

  // Cada avance desliza suave hasta el hijo activo (scroll-snap).
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const child = track.children[slide] as HTMLElement | undefined;
    if (child) {
      track.scrollTo({ left: child.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    }
  }, [slide]);

  useEffect(
    () => () => {
      if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    },
    [],
  );

  /** Pausa el auto-avance 10 s cuando el usuario toca o desliza el carrusel. */
  const pause = (): void => {
    setPaused(true);
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), 10000);
  };

  /** 5.112-C: marca la primera imagen como lista (onLoad/onError del slide 0). */
  const marcarLista = useCallback((): void => {
    setPrimeraLista(true);
  }, []);

  return { trackRef, pause, marcarLista };
}
