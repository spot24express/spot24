import { useEffect, useRef, useState } from 'react';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { useCategories, useProductList, usePromos } from '../hooks/useCatalog';
import { useZones } from '@/features/delivery/hooks/useZones';
import { CategoryCard } from '../components/CategoryCard';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { VOICE } from '@/shared/constants/brand';

/** Fotos del local para el banner (limpias, sin texto superpuesto).
 *  FALLBACK: se muestran cuando no hay promos activas en Firestore. */
const BANNER = [
  {
    src: '/img/local-mural.jpg',
    alt: 'Mural exterior con el escudo gigante de SPOT 24 y autos de competición',
  },
  {
    src: '/img/local-atencion.jpg',
    alt: 'Asesor de SPOT 24 atendiendo a un cliente en la bahía de servicio',
  },
  {
    src: '/img/local-mostrador.jpg',
    alt: 'Mostrador principal con el escudo retroiluminado y estantes de productos',
  },
  {
    src: '/img/local-equipo-1.jpg',
    alt: 'Asesora de SPOT 24 con tablet en el área de repuestos',
  },
  {
    src: '/img/local-equipo-2.jpg',
    alt: 'Equipo SPOT 24 con uniforme oficial frente al mural',
  },
  {
    src: '/img/local-equipo-3.jpg',
    alt: 'Cajero de SPOT 24 preparando un pedido en el mostrador',
  },
];

/** Milisegundos entre cada avance automático del banner. */
const BANNER_MS = 5000;

/** Diapositiva unificada del carrusel: promo del admin o foto del local. */
interface Slide {
  key: string;
  src: string;
  alt: string;
  caption?: string;
}

/** Home: hero con buscador de primero + cobertura + Visítanos (fachada + carrusel de promos). */
export default function HomePage() {
  useDocumentTitle('Tu parada segura. 24/7');
  const { data: categories } = useCategories();
  const { data: page, isError, refetch } = useProductList({}, 8);
  const { data: zones } = useZones();

  // Cobertura real (zonas activas del admin): ETA mínimo y máximo de Maracay.
  const activeZones = zones?.filter((z) => z.active) ?? [];
  const etaMin = activeZones.length ? Math.min(...activeZones.map((z) => z.etaMinMinutes)) : null;
  const etaMax = activeZones.length ? Math.max(...activeZones.map((z) => z.etaMaxMinutes)) : null;

  // Promos del carrusel EN VIVO: undefined = cargando, [] = sin promos activas
  // (usa BANNER). El vigía refresca al instante cuando el admin edita promos.
  const { data: promos } = usePromos();

  // Carrusel: avanza solo cada 5 s; se pausa mientras el usuario interactúa.
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);

  // Cuando cambia la lista de promos (alta/edición del admin), el carrusel
  // vuelve a arrancar desde el inicio.
  useEffect(() => {
    setSlide(0);
  }, [promos?.length]);

  const slides: Slide[] =
    promos && promos.length > 0
      ? promos.map((p, i) => ({ key: `${p.imageUrl}-${i}`, src: p.imageUrl, alt: p.title, caption: p.title }))
      : BANNER.map((b) => ({ key: b.src, src: b.src, alt: b.alt }));
  const slideCount = slides.length;

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % slideCount);
    }, BANNER_MS);
    return () => window.clearInterval(id);
  }, [paused, slideCount]);

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
  const pauseCarousel = () => {
    setPaused(true);
    if (resumeTimer.current) window.clearTimeout(resumeTimer.current);
    resumeTimer.current = window.setTimeout(() => setPaused(false), 10000);
  };

  return (
    <div className="spot-container py-8">
      {/* HERO — promesa + buscador (de primero) */}
      <section className="rounded-brand-lg border-2 border-line bg-surface-1 px-6 py-10 sm:px-10 sm:py-14">
        <SpeedLines className="mb-6" />
        <h1 className="max-w-2xl font-display text-4xl font-black italic uppercase leading-[1.05] text-paper sm:text-6xl">
          Tu parada segura. <span className="text-signal">24/7.</span>
        </h1>
        <p className="mt-4 max-w-xl text-body-lg text-muted">
          Repuestos, servicios y conveniencia entregados a tu puerta. Pedidos por la app
        </p>
        <div className="mt-8">
          <SearchBar />
        </div>
      </section>

      {/* COBERTURA — operamos en Maracay: retiro en tienda + envío por zona */}
      <section className="mt-4" aria-label="Cobertura de entrega">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-brand border-2 border-line bg-surface-1 px-4 py-3">
          <span className="inline-flex items-center gap-1.5 font-display text-sm font-bold italic uppercase text-signal">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" />
              <circle cx="12" cy="10" r="2.6" />
            </svg>
            Maracay, Aragua
          </span>
          <p className="text-sm text-muted">
            {etaMin !== null && etaMax !== null
              ? `Envío a domicilio en ${etaMin}–${etaMax} min · Retiro en tienda sin costo`
              : 'Envío a domicilio por zonas · Retiro en tienda sin costo'}
          </p>
        </div>
      </section>

      {/* VISÍTANOS — fachada real + carrusel (promos del admin o fotos del local) */}
      <section className="mt-12" aria-labelledby="visit-title">
        <h2 id="visit-title" className="spot-title mb-2">
          Visítanos
        </h2>
        <p className="spot-subtitle mb-6">Tu pit stop de confianza, abierto las 24 horas.</p>

        <figure className="relative overflow-hidden rounded-brand-lg border-2 border-line">
          <img
            src="/img/fachada-spot24.jpg"
            alt="Fachada de SPOT 24 al anochecer: valla con la promesa, letrero iluminado y mural del escudo"
            loading="eager"
            decoding="async"
            className="aspect-[16/9] w-full object-cover"
          />
          <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 via-ink/60 to-transparent p-6 pt-16 sm:p-8 sm:pt-24">
            <p className="spot-label text-signal">Abierto · 24/7</p>
            <p className="mt-1 font-display text-2xl font-extrabold italic uppercase text-paper sm:text-3xl">
              Para. Resuelve. Sigue.
            </p>
          </figcaption>
        </figure>

        {/* CARRUSEL — avanza solo cada 5 s; las promos activas del admin tienen
            título superpuesto; si no hay, salen las fotos limpias del local */}
        <div
          ref={trackRef}
          aria-label={promos && promos.length > 0 ? 'Promociones' : 'Galería del local'}
          className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={pauseCarousel}
          onWheel={pauseCarousel}
        >
          {slides.map((g) => (
            <figure
              key={g.key}
              className={`relative shrink-0 snap-start overflow-hidden rounded-brand-lg border-2 border-line ${
                g.caption ? 'aspect-[16/9] h-52 sm:h-72' : 'h-52 w-auto sm:h-72'
              }`}
            >
              <img
                src={g.src}
                alt={g.alt}
                loading="lazy"
                decoding="async"
                className={g.caption ? 'h-full w-full object-cover' : 'h-full w-auto object-cover'}
              />
              {g.caption ? (
                <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/95 via-ink/60 to-transparent p-4 pt-12 sm:p-5 sm:pt-16">
                  <p className="font-display text-lg font-extrabold italic uppercase leading-tight text-paper sm:text-2xl">
                    {g.caption}
                  </p>
                </figcaption>
              ) : null}
            </figure>
          ))}
        </div>
      </section>

      {/* CATEGORÍAS — bahías según la cantidad que gestione el admin */}
      <section className="mt-12" aria-labelledby="cats-title">
        <h2 id="cats-title" className="spot-title mb-2">
          {categories && categories.length === 1 ? 'La bahía' : categories && categories.length > 1 ? `${categories.length} bahías` : 'Las bahías'}
        </h2>
        <p className="spot-subtitle mb-6">Elige tu categoría. Todo en el mismo pit stop.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories?.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>

      {/* DESTACADOS */}
      <section className="mt-12" aria-labelledby="feat-title">
        <h2 id="feat-title" className="spot-title mb-2">
          Recién llegados
        </h2>
        <p className="spot-subtitle mb-6">Lo último en la bahía, listo para el pedido.</p>
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : page ? (
          page.pages[0]?.items.length ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {page.pages[0].items.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          ) : (
            <EmptyState title="Catálogo en preparación" message={VOICE.emptyCatalog} />
          )
        ) : (
          <ProductGridSkeleton />
        )}
      </section>

      <SpeedDivider className="mt-14" />
      <p className="mt-4 text-center spot-label">{VOICE.thanks}</p>
    </div>
  );
}
