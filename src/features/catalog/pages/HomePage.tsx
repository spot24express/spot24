import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { useCategories, useProductList, usePromos, useTopSellers } from '../hooks/useCatalog';
import { useAutoCarousel } from '../hooks/useAutoCarousel';
import { getProductsByIds } from '../services/catalog.service';
import { curarRecientes, debeCargarMasPaginas } from '../lib/vitrina';
import { isTopLevel } from '@/shared/lib/categoryTree';
import { alFallarFotoCon, FOTO_LOCAL } from '@/shared/lib/imgFallback';
import { CategoryCard } from '../components/CategoryCard';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { VOICE } from '@/shared/constants/brand';
import { BotonCompartir } from '@/shared/components/ui/BotonCompartir';
import { TITULAR } from '@/features/legal/datos';
import { getGeneralSettingsCached, GENERAL_SEED } from '@/shared/services/settings.service';
import { useAuthStore } from '@/features/auth/store/auth.store';
import { getRepurchaseProductIds } from '@/features/orders/services/orders.service';
import type { Product } from '../types';

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

/** Diapositiva unificada del carrusel: promo del admin o foto del local. */
interface Slide {
  key: string;
  src: string;
  alt: string;
  caption?: string;
}

/** 5.108 · Datos para «Compartir la app» desde el héroe (decisión del dueño:
 *  vive DENTRO del héroe, arriba a la derecha — la barra superior del
 *  teléfono ya está llena). El enlace es el sitio oficial de TITULAR. */
const APP_COMPARTIR = {
  titulo: 'SPOT 24',
  texto: 'SPOT 24 — Tu parada segura. 24/7. Repuestos, servicios y conveniencia a domicilio',
  url: TITULAR.sitio,
} as const;

/**
 * 5.98 (punto F) · Piezas que el cliente YA compró y están activas con stock
 * (los últimos 10 pedidos no cancelados, lo más reciente primero). Sin sesión
 * o sin compras → [] y el Home OCULTA la sección (arranque desde cero).
 */
function useRepurchase(max = 8) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['orders', 'repurchase', uid, max] as const,
    queryFn: async (): Promise<Product[]> => {
      if (!uid) return [];
      const ids = await getRepurchaseProductIds(uid, 10);
      if (ids.length === 0) return [];
      const prods = await getProductsByIds(ids.slice(0, 24));
      return prods.filter((p) => p.active && p.stockTotal > 0).slice(0, max);
    },
    enabled: Boolean(uid),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Hilera de productos que AVANZA SOLA (5 s, pausa al tocar, reanuda a los 10 s)
 * — mismo comportamiento del carrusel de promos, con tarjetas de producto.
 * Con 1 sola pieza queda hilera fija (sin auto-avance).
 */
function ProductCarousel({ products, label }: { products: Product[]; label: string }) {
  const { trackRef, pause } = useAutoCarousel(products.length);
  return (
    <div
      ref={trackRef}
      aria-label={label}
      className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onPointerDown={pause}
      onWheel={pause}
    >
      {products.map((p) => (
        <div key={p.id} className="w-44 shrink-0 snap-start sm:w-52">
          <ProductCard product={p} />
        </div>
      ))}
    </div>
  );
}

/** Home 5.108 «vitrina que vende II» (decisión del dueño):
 *  Héroe con la FACHADA de fondo (impacto al entrar) + compartir la app →
 *  Visítanos (carrusel de promos/fotos, subió al 2º lugar) → Cobertura →
 *  Vuelve a comprar (si el cliente ya compró) → Bahías → Los más pedidos →
 *  Recién llegados (AHORA carrusel como las otras vitrinas) → pie.
 *  Las secciones sin datos NO aparecen: arrancamos desde cero (decisión del
 *  dueño) y se pueblan solas con el uso. */
export default function HomePage() {
  useDocumentTitle('Tu parada segura. 24/7');
  const { data: categories } = useCategories();
  // Ronda 5.76: el Home muestra SOLO categorías principales — las subcategorías
  // viven dentro de su bahía (chips del catálogo), no como tarjetas sueltas.
  const parents = categories?.filter(isTopLevel) ?? [];
  // 5.98 (punto D) · Trae recientes y los CURA: variedad de máx 2 por bahía
  // y, si con el tope no llena la vitrina, RELLENA hasta 8 (ronda 5.103).
  // 5.107 · Si en la primera tanda de 24 hay menos de 8 ACTIVOS (p. ej. una
  // tanda reciente de productos sin publicar tapa la lista y la sección
  // quedaba a medias), la consulta infinita pide hasta 2 tandas extra y el
  // pool crece: la vitrina se llena con los activos que vengan detrás.
  // 0 lecturas extra cuando la primera tanda alcanza (el caso normal).
  const {
    data: page, isError, refetch, fetchNextPage, isFetchingNextPage, hasNextPage,
  } = useProductList({}, 24);
  const pool = useMemo(() => page?.pages.flatMap((p) => p.items) ?? [], [page]);
  const curados = useMemo(() => curarRecientes(pool, 8, 2), [pool]);
  useEffect(() => {
    if (!page || !hasNextPage || isFetchingNextPage) return;
    if (debeCargarMasPaginas(page.pages.length, curados.length)) void fetchNextPage();
  }, [page, hasNextPage, isFetchingNextPage, curados.length, fetchNextPage]);
  // 5.75: la franja de cobertura ya NO muestra el ETA de zonas («en 15-20 min»):
  // muestra el HORARIO en que trabajan los deliverys, que el dueño edita en
  // Admin → Ajustes (settings/general.deliveryHours) sin deploy ni código.
  // Fallback: seed del servicio mientras el doc no exista o el campo venga vacío.
  const [deliveryHours, setDeliveryHours] = useState(GENERAL_SEED.deliveryHours);
  useEffect(() => {
    let alive = true;
    void getGeneralSettingsCached()
      .then((g) => {
        // Promesa compartida con RootLayout: 1 sola lectura de settings/general
        // por carga de app, sin costo extra aunque el Home se abra mil veces.
        if (alive && g?.deliveryHours) setDeliveryHours(g.deliveryHours);
      })
      .catch(() => {
        /* sin ajustes: sigue el valor por defecto */
      });
    return () => {
      alive = false;
    };
  }, []);

  // 5.98 · Vitrina que vende: F (compradas por el cliente) y C (top entregadas).
  // undefined = cargando; [] = sin datos → la sección NO se renderiza.
  const { data: repurchase } = useRepurchase(8);
  const { data: topSellers } = useTopSellers(8);

  // Promos del carrusel EN VIVO: undefined = cargando, [] = sin promos activas
  // (usa BANNER). El vigía refresca al instante cuando el admin edita promos.
  const { data: promos } = usePromos();

  // Carrusel de promos/fotos: avanza solo cada 5 s; pausa al interactuar (5.98:
  // mismo hook que las hileras de producto — comportamiento idéntico).
  // 5.112-C · PARCHE IMGBB: ESPERAR la primera imagen antes de empezar a
  // contar los 5 s (durante la caída de imgbb el slide mostraba el cartel
  // azul de imgbb y el carrusel saltaba sin esperar). Si la foto falla, el
  // onError muestra la foto del local del repo Y libera el carrusel; a los
  // 8 s arranca igual (tope del hook) para no congelar el Home.
  const promoRef = useAutoCarousel(promos && promos.length > 0 ? promos.length : BANNER.length, 5000, {
    esperarPrimera: true,
  });

  // Respaldo visual de un slide de promo (5.112-C): foto del local con el
  // escudo (archivo del repo, jamás se cae) y ADEMÁS libera el carrusel si
  // la que falló era la primera (onError del slide 0 = «primera lista»).
  const alFallarPromo = (e: { currentTarget: HTMLImageElement }): void => {
    alFallarFotoCon(FOTO_LOCAL)(e);
    promoRef.marcarLista();
  };

  const slides: Slide[] =
    promos && promos.length > 0
      ? promos.map((p, i) => ({ key: `${p.imageUrl}-${i}`, src: p.imageUrl, alt: p.title, caption: p.title }))
      : BANNER.map((b) => ({ key: b.src, src: b.src, alt: b.alt }));

  return (
    <div className="spot-container py-8">
      {/* 5.108 (Opción A, decisión del dueño) · HERO CON LA FACHADA DE FONDO:
          la primera pantalla es la identidad del local — fachada nocturna,
          la promesa y el buscador ENCIMA con degradado oscuro (el mismo truco
          de las fotos del carrusel para que el texto se lea). Arriba a la
          derecha, discreto: compartir la app. */}
      <section className="relative rounded-brand-lg border-2 border-line">
        {/* 5.109 (hallazgo 2 del dueño) · el recorte de esquinas vive SOLO en
            esta capa interna (foto + degradado): si el section recorta,
            las sugerencias del buscador salen cortadas. */}
        <div className="absolute inset-0 overflow-hidden rounded-brand-lg">
          <img
            src="/img/fachada-spot24.jpg"
            alt="Fachada de SPOT 24 al anochecer: valla con la promesa, letrero iluminado y mural del escudo"
            loading="eager"
            decoding="async"
            className="h-full w-full object-cover"
          />
          {/* Degradado: oscurece la zona del texto sin apagar la foto. */}
          <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-ink/80 via-ink/55 to-ink/85" />
        </div>
        <BotonCompartir
          titulo={APP_COMPARTIR.titulo}
          texto={APP_COMPARTIR.texto}
          url={APP_COMPARTIR.url}
          tipo="app"
          ariaLabel="Compartir SPOT 24"
          iconSize={20}
          className="absolute right-3 top-3 z-10 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-brand border-2 border-line bg-ink/60 text-paper backdrop-blur transition-colors hover:border-signal hover:text-signal"
        />
        <div className="relative px-6 py-10 sm:px-10 sm:py-14">
          <SpeedLines className="mb-6" />
          <h1 className="max-w-2xl font-display text-4xl font-black italic uppercase leading-[1.05] text-paper sm:text-6xl">
            Tu parada segura. <span className="text-signal">24/7.</span>
          </h1>
          <p className="mt-4 max-w-xl text-body-lg text-paper/85">
            Repuestos, servicios y conveniencia entregados a tu puerta. Pedidos por la app
          </p>
          <div className="mt-8">
            <SearchBar />
          </div>
        </div>
      </section>

      {/* 5.108 · VISÍTANOS subió al 2º lugar (decisión del dueño: el impacto
          visual de los carruseles entra de una vez). La fachada ahora vive en
          el héroe; aquí queda el carrusel: promos del admin o, si no hay,
          fotos limpias del local. */}
      <section className="mt-4" aria-labelledby="visit-title">
        <h2 id="visit-title" className="spot-title mb-2">
          Visítanos
        </h2>
        <p className="spot-subtitle mb-6">Tu pit stop de confianza, abierto las 24 horas.</p>

        {/* CARRUSEL — avanza solo cada 5 s; las promos activas del admin tienen
            título superpuesto; si no hay, salen las fotos limpias del local.
            5.112-C: el avance espera la primera imagen; toda promo fallida
            muestra la foto del local del repo (nunca el cartel de imgbb). */}
        <div
          ref={promoRef.trackRef}
          aria-label={promos && promos.length > 0 ? 'Promociones' : 'Galería del local'}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          onPointerDown={promoRef.pause}
          onWheel={promoRef.pause}
        >
          {slides.map((g, i) => (
            <figure
              key={g.key}
              className={`relative shrink-0 snap-start overflow-hidden rounded-brand-lg border-2 border-line ${
                g.caption ? 'aspect-[16/9] h-52 sm:h-72' : 'h-52 w-auto sm:h-72'
              }`}
            >
              <img
                src={g.src}
                alt={g.alt}
                // 5.112-C: la primera eager (el carrusel y su espera la miran);
                // el resto lazy como siempre.
                loading={i === 0 ? 'eager' : 'lazy'}
                decoding="async"
                onError={alFallarPromo}
                onLoad={i === 0 ? promoRef.marcarLista : undefined}
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

      {/* COBERTURA — operamos en Maracay: horario de deliverys + retiro en tienda */}
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
            Envío a domicilio {deliveryHours} · Retiro en tienda sin costo
          </p>
        </div>
      </section>

      {/* 5.98 (F) · VUELVE A COMPRAR — piezas que el cliente ya compró (hilera
          que avanza sola). Solo con sesión y compras: si no, no aparece. */}
      {repurchase && repurchase.length > 0 && (
        <section className="mt-12" aria-labelledby="rep-title">
          <h2 id="rep-title" className="spot-title mb-2">
            Vuelve a comprar
          </h2>
          <p className="spot-subtitle mb-6">Tus piezas de siempre, a un toque.</p>
          <ProductCarousel products={repurchase} label="Piezas que ya compraste" />
        </section>
      )}

      {/* CATEGORÍAS — bahías según la cantidad que gestione el admin */}
      <section className="mt-12" aria-labelledby="cats-title">
        <h2 id="cats-title" className="spot-title mb-2">
          {parents.length === 1 ? 'La bahía' : parents.length > 1 ? `${parents.length} bahías` : 'Las bahías'}
        </h2>
        <p className="spot-subtitle mb-6">Elige tu categoría. Todo en el mismo pit stop.</p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {parents.map((c) => (
            <CategoryCard key={c.id} category={c} />
          ))}
        </div>
      </section>

      {/* 5.98 (C) · LOS MÁS PEDIDOS — top por unidades entregadas (cada pedido
          marcado Entregado suma solito). Con cero ventas la sección NO aparece:
          desde la primera entrega empieza a poblarse sola. */}
      {topSellers && topSellers.length > 0 && (
        <section className="mt-12" aria-labelledby="top-title">
          <h2 id="top-title" className="spot-title mb-2">
            Los más pedidos
          </h2>
          <p className="spot-subtitle mb-6">Lo que Maracay ya está comprando.</p>
          <ProductCarousel products={topSellers} label="Los productos más pedidos" />
        </section>
      )}

      {/* 5.108 · RECIÉN LLEGADOS como carrusel (decisión del dueño): misma
          hilera que avanza sola de «Vuelve a comprar» y «Los más pedidos» —
          la única vitrina que quedó estática ahora vende igual. Con 8 piezas
          curadas (5.106) el carrusel da una vuelta completa. */}
      <section className="mt-12" aria-labelledby="feat-title">
        <div className="mb-2 flex items-end justify-between gap-4">
          <div>
            <h2 id="feat-title" className="spot-title">
              Recién llegados
            </h2>
            <p className="spot-subtitle mt-2">Lo último en la bahía, listo para el pedido.</p>
          </div>
          {curados.length > 0 && (
            <Link
              to="/catalogo"
              className="shrink-0 rounded-brand border-2 border-line px-3 py-2 spot-label transition-colors hover:border-signal hover:text-signal"
            >
              Ver todo
            </Link>
          )}
        </div>
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : page ? (
          curados.length ? (
            <ProductCarousel products={curados} label="Recién llegados" />
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
