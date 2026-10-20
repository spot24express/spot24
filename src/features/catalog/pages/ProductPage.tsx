import { useMemo, useState, useEffect, useRef, type UIEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { StockBadge } from '@/shared/components/ui/PriceTag';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState } from '@/shared/components/ui/States';
import { useCategories, useProduct, useRelated, useVariants } from '../hooks/useCatalog';
import { subscribeProduct } from '../services/catalog.service';
import { ProductCard } from '../components/ProductCard';
import { useCart } from '@/features/cart/hooks/useCart';
import { trackEvent } from '@/shared/lib/analytics';
import { validateAdd } from '@/features/cart/lib/cartLogic';
import { useBcvRate } from '@/shared/hooks/useBcvRate';
import { formatBs, usdToBs } from '@/shared/lib/format';
import { cleanProductName } from '@/shared/lib/display';
import { alFallarFoto } from '@/shared/lib/imgFallback';
import { VOICE } from '@/shared/constants/brand';

/** Ficha de producto: galería, variantes, precio en Bs. en vivo, stock, relacionados. */
export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading } = useProduct(slug);
  const productId = product?.id;
  const { data: variants } = useVariants(productId);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [liveStockTotal, setLiveStockTotal] = useState<number | null>(null);
  // 5.81/5.83 · galería de la ficha: carrusel DESLIZABLE con puntos (como
  // Farmatodo) + miniaturas sincronizadas (tocar una desliza hasta esa foto).
  const [imgIdx, setImgIdx] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const { addItem } = useCart();
  const rate = useBcvRate();

  useDocumentTitle(product?.name ?? 'Producto');

  // Stock en vivo: onSnapshot acotado al documento del producto (5.1).
  useEffect(() => {
    if (!productId) return;
    const unsub = subscribeProduct(productId, (p) => setLiveStockTotal(p ? p.stockTotal : null));
    return unsub;
  }, [productId]);

  useEffect(() => {
    if (variants && variants.length > 0 && !variantId) {
      setVariantId(variants[0]!.id);
    }
  }, [variants, variantId]);

  // 5.81 · producto distinto → la galería vuelve a la portada (carrusel al
  // inicio, sin heredar el deslize del producto anterior).
  useEffect(() => {
    setImgIdx(0);
    carouselRef.current?.scrollTo({ left: 0 });
  }, [productId]);

  const variant = useMemo(
    () => variants?.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );

  useEffect(() => {
    if (product) {
      void trackEvent({
        name: 'view_item',
        params: { itemId: product.id, itemCategory: product.categoryId, valueUsd: variant?.priceUsd },
      });
    }
  }, [product, variant]);

  // Relacionados: misma categoría (hook activo antes de los early-returns).
  const { data: relatedData } = useRelated(product ?? undefined);
  const related = relatedData ?? [];

  // Categoría para el breadcrumb: desde Firestore (la misma lista de la tienda).
  const { data: categories } = useCategories();
  const category = categories?.find((c) => c.id === product?.categoryId);
  const cartLineQty = useCartStoreLine(product?.id ?? '', variantId);

  if (isLoading) {
    return (
      <div className="spot-container py-8">
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <Skeleton className="aspect-square" />
          <div className="space-y-4">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="spot-container py-16">
        <EmptyState
          title="No encontramos esa pieza"
          message={VOICE.emptySearch}
          action={{ label: 'Volver al catálogo', onClick: () => window.history.back() }}
        />
      </div>
    );
  }

  const stock = liveStockTotal ?? product.stockTotal;
  // 5.83 · fotos de la ficha (≤6, sin vacías). La primera es la PORTADA (la
  // que viaja al carrito); el resto se ven en el carrusel de la ficha.
  const gallery = product.images.filter(Boolean).slice(0, 6);

  // Punto activo del carrusel = diapositiva más centrada (scroll-snap).
  const handleGalleryScroll = (e: UIEvent<HTMLDivElement>): void => {
    const el = e.currentTarget;
    const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    const next = Math.min(gallery.length - 1, Math.max(0, i));
    if (next !== imgIdx) setImgIdx(next);
  };

  // Miniatura → el carrusel se desliza suave hasta esa foto.
  const goToImage = (i: number): void => {
    setImgIdx(i);
    const el = carouselRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  // Nombre SIN la marca repetida (regla compartida con el carrito): aunque el
  // admin guardara «POLARCAR Caroreña Verano», la ficha y el carrito muestran
  // solo el producto; la marca vive arriba en su campo propio.
  const displayName = cleanProductName(product.name, product.brand);
  const canAdd = variant
    ? validateAdd(variant.stock, cartLineQty, qty).ok
    : false;

  const onAdd = () => {
    if (!variant) return;
    const ok = addItem(
      {
        productId: product.id,
        variantId: variant.id,
        slug: product.slug,
        name: displayName, // sin la marca repetida: el carrito queda limpio
        brand: product.brand, // ronda 5e: la marca viaja con la línea
        variantName: variant.name,
        sku: variant.sku,
        unitPriceUsd: variant.priceUsd,
        image: gallery[0] ?? '/img/products/lubricantes.svg',
        categoryId: product.categoryId,
        stockAtAdd: variant.stock,
      },
      qty,
    );
    if (ok) toast.success('En el carrito. Para. Resuelve. Sigue.');
  };

  // Precio en Bs. en vivo (presentación; el oficial lo fija el backend al cotizar).
  const priceUsd = variant?.priceUsd ?? product.basePriceUsd;
  const bs = rate ? usdToBs(priceUsd, rate.rate) : null;

  return (
    <div className="spot-container py-8">
      <nav aria-label="Ruta" className="mb-6 spot-label">
        <Link to="/" className="hover:text-signal">Inicio</Link>
        <span className="mx-2">/</span>
        <Link to={`/catalogo?cat=${product.categoryId}`} className="hover:text-signal">
          {category ? `${category.code ? `${category.code} · ` : ''}${category.name}` : 'Catálogo'}
        </Link>
        <span className="mx-2">/</span>
        <span className="text-paper">{displayName}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* GALERÍA — 5.83 · carrusel DESLIZABLE con puntos (como Farmatodo):
            el dueño lo corrigió: la TARJETA solo muestra la portada y el
            carrusel se ve AQUÍ, dentro de la ficha. Varias fotos se pasan con
            el dedo (scroll con resortes) y los puntos indican cuál se ve; las
            miniaturas quedan debajo y se sincronizan (tocar una desliza el
            carrusel hasta esa foto). Con una sola foto, imagen fija. */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1">
            {gallery.length > 1 ? (
              <div
                ref={carouselRef}
                className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                onScroll={handleGalleryScroll}
              >
                {gallery.map((src, i) => (
                  <div key={`${src}-${i}`} className="h-full w-full shrink-0 snap-center">
                    <img
                      src={src}
                      alt={i === 0 ? product.name : `${product.name} — foto ${i + 1} de ${gallery.length}`}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      draggable={false}
                      className="aspect-square w-full object-cover"
                      onError={alFallarFoto}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <img
                src={gallery[0] ?? '/img/products/lubricantes.svg'}
                alt={product.name}
                className="aspect-square w-full object-cover"
                loading="eager"
                decoding="async"
                onError={alFallarFoto}
              />
            )}
            {gallery.length > 1 && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink/60 px-1.5 py-1"
              >
                {gallery.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 w-1.5 rounded-full ${i === imgIdx ? 'bg-signal' : 'bg-paper/60'}`}
                  />
                ))}
              </div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {gallery.map((img, i) => (
                <button
                  key={`${img}-${i}`}
                  type="button"
                  aria-label={`Ver foto ${i + 1} de ${product.name}`}
                  aria-pressed={i === imgIdx}
                  onClick={() => goToImage(i)}
                  className={`aspect-square overflow-hidden rounded-brand border-2 transition-colors ${
                    i === imgIdx ? 'border-signal' : 'border-line hover:border-line-strong'
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                    onError={alFallarFoto}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INFO + VARIANTES */}
        <div>
          <p className="spot-label">{product.brand}</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold italic uppercase leading-tight text-paper sm:text-4xl">
            {displayName}
          </h1>
          <div className="mt-3">
            <StockBadge stock={stock} />
          </div>

          <div className="mt-5">
            <p className="font-display text-3xl font-extrabold italic leading-tight text-signal">
              {bs !== null ? formatBs(bs) : 'Bs. —'}
            </p>
            <p className="mt-1 spot-label">Precio en bolívares</p>
          </div>

          {variants && variants.length > 1 && (
            <fieldset className="mt-6">
              <legend className="mb-2 spot-label">Variante</legend>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    aria-pressed={v.id === variantId}
                    disabled={v.stock <= 0}
                    onClick={() => {
                      setVariantId(v.id);
                      setQty(1);
                    }}
                    className={`min-h-[44px] rounded-brand border-2 px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
                      v.id === variantId
                        ? 'border-signal bg-signal/10 text-signal'
                        : 'border-line text-paper hover:border-line-strong'
                    }`}
                  >
                    {v.name}
                    <span className="ml-2 font-display italic text-signal">
                      {rate ? formatBs(usdToBs(v.priceUsd, rate.rate)) : 'Bs. —'}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {/* CANTIDAD + CTA */}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <div className="flex items-center rounded-brand border-2 border-line">
              <button
                type="button"
                aria-label="Disminuir cantidad"
                className="min-h-[48px] w-12 font-display text-xl font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                disabled={qty <= 1}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
              >
                −
              </button>
              <span aria-live="polite" className="w-12 text-center font-display text-lg font-bold italic text-paper">
                {qty}
              </span>
              <button
                type="button"
                aria-label="Aumentar cantidad"
                className="min-h-[48px] w-12 font-display text-xl font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                disabled={!variant || qty >= Math.min(variant.stock, 20)}
                onClick={() => setQty((q) => Math.min(20, q + 1))}
              >
                +
              </button>
            </div>
            <Button size="lg" disabled={!canAdd} onClick={onAdd}>
              {variant && variant.stock <= 0 ? 'Sin stock' : 'Al carrito'}
            </Button>
          </div>

          {/* 5.75 · Descripción OPCIONAL: si el producto no la tiene, la caja
              ni siquiera aparece (sin título suelto ni contenedor vacío). */}
          {product.description?.trim() ? (
            <div className="mt-8 rounded-brand-lg border-2 border-line bg-surface-1 p-5">
              <h2 className="font-display text-base font-bold italic uppercase text-paper">Descripción</h2>
              <p className="mt-2 text-body-base leading-relaxed text-muted">{product.description}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* RELACIONADOS */}
      <RelatedSection related={related} />

      <SpeedDivider className="mt-14" />
    </div>
  );
}

/** Cantidad ya en carrito para esta variante (validación de tope). */
function useCartStoreLine(productId: string, variantId: string | null): number {
  const { items } = useCart();
  if (!productId) return 0;
  return items.find((i) => i.productId === productId && i.variantId === variantId)?.qty ?? 0;
}

function RelatedSection({ related }: { related: import('../types').Product[] }) {
  if (related.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="rel-title">
      <h2 id="rel-title" className="spot-title mb-6">También en la bahía</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {related.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
    </section>
  );
}