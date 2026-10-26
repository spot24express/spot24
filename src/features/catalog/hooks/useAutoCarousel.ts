/**
 * SPOT 24 · Ronda 5.98 · Carrusel auto-avance reutilizable (mismo patrón que
 * el carrusel de promos del Home): avanza solo cada `ms` (5 s), se PAUSA
 * mientras el usuario toca o desliza (pointer/wheel) y reanuda 10 s después.
 * Vitrina del Home que vende: «Vuelve a comprar», «Los más pedidos» y el
 * carrusel de promos comparten exactamente este comportamiento.
 */
import { useEffect, useRef, useState } from 'react';

export function useAutoCarousel(count: number, ms = 5000) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);

  // La lista cambia (alta/edición) → el carrusel vuelve a arrancar del inicio.
  useEffect(() => {
    setSlide(0);
  }, [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % count);
    }, ms);
    return () => window.clearInterval(id);
  }, [paused, count, ms]);

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

  return { trackRef, pause };
}
