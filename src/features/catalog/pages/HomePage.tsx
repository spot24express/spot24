import { useEffect, useRef, useState } from 'react';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton, Skeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { useCategories, useCategoryCount, useProductList } from '../hooks/useCatalog';
import { CategoryCard } from '../components/CategoryCard';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { VOICE } from '@/shared/constants/brand';

/** Fotos del local para el banner (limpias, sin texto superpuesto). */
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

/** Home: hero con buscador de primero + Visítanos (fachada + banner automático). */
export default function HomePage() {
  useDocumentTitle('Tu parada segura. 24/7');
  const { data: categories } = useCategories();
  const { data: page, isError, refetch } = useProductList({}, 8);

  // Banner: avanza solo cada 5 s; se pausa mientras el usuario interactúa.
  const trackRef = useRef<HTMLDivElement>(null);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const resumeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setSlide((s) => (s + 1) % BANNER.length);
    }, BANNER_MS);
    return () => window.clearInterval(id);
  }, [paused]);

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

  /** Pausa el auto-avance 10 s cuando el usuario toca o desliza el banner. */
  const pauseBanner = () => {
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

      {/* VISÍTANOS — fachada real + banner del local */}
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

        {/* BANNER — tira que avanza sola cada 5 s, fotos limpias sin texto */}
        <div
          ref={trackRef}
          aria-label="Galería del local"
          className="mt-4 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={pauseBanner}
          onWheel={pauseBanner}
        >
          {BANNER.map((g) => (
            <div
              key={g.src}
              className="relative h-52 w-auto shrink-0 snap-start overflow-hidden rounded-brand-lg border-2 border-line sm:h-72"
            >
              <img
                src={g.src}
                alt={g.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-auto object-cover"
              />
            </div>
          ))}
        </div>
      </section>

      {/* CATEGORÍAS 01–08 */}
      <section className="mt-12" aria-labelledby="cats-title">
        <h2 id="cats-title" className="spot-title mb-2">
          Las ocho bahías
        </h2>
        <p className="spot-subtitle mb-6">Elige tu categoría. Todo en el mismo pit stop.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {categories?.map((c) => (
            <CategoryCardItem key={c.id} id={c.id} />
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

/** Item con contador por categoría (consulta count agregada). */
function CategoryCardItem({ id }: { id: string }) {
  const { data: categories } = useCategories();
  const category = categories?.find((c) => c.id === id);
  const { data: count } = useCategoryCount(id);
  if (!category) return <Skeleton className="min-h-[120px]" />;
  return <CategoryCard category={category} count={count} />;
}