import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { trackEvent } from '@/shared/lib/analytics';
import { formatBs, usdToBs } from '@/shared/lib/format';
import { cleanProductName, etiquetaStock } from '@/shared/lib/display';
import { alFallarFoto } from '@/shared/lib/imgFallback';
import { useBcvRate } from '@/shared/hooks/useBcvRate';
import { getVariants } from '../services/catalog.service';
import { useCart } from '@/features/cart/hooks/useCart';
import { validateAdd, singleLineForProduct } from '@/features/cart/lib/cartLogic';
import { MAX_QTY_PER_LINE } from '@/features/cart/types';
import { toast } from '@/shared/lib/toast';
import { logger } from '@/shared/lib/logger';
import { BotonCompartir } from '@/shared/components/ui/BotonCompartir';
import { TITULAR } from '@/features/legal/datos';

/** Estrella rellena (14 px) para el rating de la tarjeta. */
export function StarIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9L12 2.6z" />
    </svg>
  );
}

/** 5.98 (punto G) · Fila de rating: solo con reseñas visibles (ratingCount > 0).
 *  Promedio a 1 decimal + cantidad, como en las apps de referencia. */
export function RatingLine({ avg, count, compact = false }: { avg: number; count: number; compact?: boolean }) {
  if (!count || count <= 0 || avg <= 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${compact ? 'text-[11px]' : 'text-xs'} font-semibold text-signal`}>
      <StarIcon />
      {avg.toFixed(1)}
      <span className="text-muted">({count})</span>
    </span>
  );
}

interface ProductCardProps {
  product: Product;
}

/**
 * Tarjeta de producto (estilo de app de farmacia de referencia, adaptado al tema pit stop):
 * imagen arriba con el agregado rápido y aviso de stock, y en el cuerpo marca
 * (sola, arriba) → nombre sin repetir la marca → precio en Bs. (tasa BCV en vivo).
 * · 5.83 · la tarjeta muestra SOLO la imagen de PORTADA (la primera), como
 *   en las apps de farmacia: el carrusel deslizable con puntos vive DENTRO de la ficha del
 *   producto, no aquí (corrección del dueño sobre la entrega de 5.82).
 * · Agregado rápido (5.85 · comportamiento EXACTO de la app de referencia de farmacia, 32 px):
 *   · producto SIN línea en carrito → círculo «+» (el símbolo ocupa el 80 %
 *     del círculo): producto de UNA variante agrega directo y se abre la
 *     cápsula; de VARIAS → lleva a la ficha para elegirla.
 *   · producto CON una sola línea en carrito → círculo con el NÚMERO (al
 *     80 %). Al tocarlo se abre la cápsula «− qty +»; cada ajuste la deja
 *     abierta y al soltar (1.8 s) se RETRAE sola y queda el número en el
 *     círculo, como en la app de referencia. «−» a 0 quita la línea; «+» respeta stock y
 *     tope. Con varias líneas (variantes elegidas en la ficha) vuelve el
 *     «+» → ficha.
 *   · 5.85 · todo un paso más pequeño (36 → 32 px) y el chip «Últimas N» /
 *     «Agotado» pasó a ABAJO-izquierda con más transparencia (85 → 50 %).
 *   · 5.92f (pedido del dueño): el chip de producto sin existencias dice
 *     «Agotado» (antes «Sin stock»). Mismo criterio en la ficha (StockBadge
 *     y botón del carrito) para que la tienda hable un solo idioma.
 *   · 5.104 (pedido del dueño): con UNA sola pieza el chip dice
 *     «Última disponible» (antes «Últimas 1»); texto compartido con la
 *     ficha vía etiquetaStock() (display.ts).
 */

/** Tiempo que la cápsula queda abierta tras el último toque (como en la app de referencia). */
const STEPPER_COLLAPSE_MS = 1800;

export function ProductCard({ product }: ProductCardProps) {
  const rate = useBcvRate();
  const navigate = useNavigate();
  const { addItem, setQty, removeItem, items } = useCart();
  const [adding, setAdding] = useState(false);
  // 5.85 · la cápsula «− qty +» abierta o retraída al círculo con el número.
  // Al agregar (quick-add) o tocar el círculo se abre; cada ajuste cambia qty
  // y re-arma el retiro; 1.8 s después del último toque se retrae sola. Si la
  // línea desaparece (0 unidades o varias variantes), colapsa al instante.
  const [expanded, setExpanded] = useState(false);
  // 5.83 · la tarjeta muestra SOLO la portada: fotos reales (≤6) o el
  // respaldo por categoría. La primera SIEMPRE es la portada (la que viaja
  // al carrito). El carrusel con las demás fotos vive en la ficha.
  const gallery = product.images.filter(Boolean).slice(0, 6);
  const image = gallery.length > 0 ? gallery[0]! : '/img/products/lubricantes.svg';
  const bs = rate ? usdToBs(product.basePriceUsd, rate.rate) : null;

  const goToProduct = (): void => {
    void trackEvent({ name: 'view_item', params: { itemId: product.id, itemCategory: product.categoryId } });
  };

  // 5.81 · línea única de este producto en el carrito (null si 0 o 2+).
  const line = singleLineForProduct(items, product.id);
  const maxQty = Math.min(line?.stockAtAdd ?? 0, MAX_QTY_PER_LINE);
  const atCap = Boolean(line && line.qty >= maxQty);

  // 5.85 · retiro automático de la cápsula (patrón de la app de referencia): abrir/ajustar re-arma
  // el temporizador; al vencer, la cápsula se retrae y queda el número en el
  // círculo. La línea que desaparece la colapsa al instante.
  const lineKey = line ? `${line.productId}:${line.variantId}` : '';
  useEffect(() => {
    if (!expanded) return;
    if (!line) {
      setExpanded(false);
      return;
    }
    const t = window.setTimeout(() => setExpanded(false), STEPPER_COLLAPSE_MS);
    return () => window.clearTimeout(t);
  }, [expanded, line, lineKey, line?.qty]);

  // Nombre visible SIN repetir la marca (regla compartida con el carrito):
  // «POLARCAR Caroreña Verano» con marca POLAR → tarjeta: POLAR / Caroreña Verano.
  const displayName = cleanProductName(product.name, product.brand);

  const handleQuickAdd = async (): Promise<void> => {
    if (adding || product.stockTotal <= 0) return;
    setAdding(true);
    try {
      if (product.variantCount > 1) {
        navigate(`/catalogo/${product.slug}`); // elegir variante en la ficha
        return;
      }
      const variants = await getVariants(product.id);
      const v =
        variants.find((x) => x.active && x.stock > 0) ?? variants.find((x) => x.active);
      if (!v) {
        toast.error('Sin variantes disponibles por ahora.');
        return;
      }
      const currentQty =
        items.find((i) => i.productId === product.id && i.variantId === v.id)?.qty ?? 0;
      if (!validateAdd(v.stock, currentQty, 1).ok) {
        toast.info('Ya tienes el tope disponible de esta pieza en el carrito.');
        return;
      }
      const ok = addItem(
        {
          productId: product.id,
          variantId: v.id,
          slug: product.slug,
          name: displayName, // sin la marca repetida: el carrito queda limpio
          brand: product.brand, // ronda 5e: la marca viaja con la línea
          variantName: v.name,
          sku: v.sku,
          unitPriceUsd: v.priceUsd,
          image,
          categoryId: product.categoryId,
          stockAtAdd: v.stock,
        },
        1,
      );
      if (ok) {
        setExpanded(true); // 5.85 · como en la app de referencia: la cápsula se abre al agregar
        toast.success('En el carrito. Para. Resuelve. Sigue.');
      }
    } catch (e) {
      logger.warn('agregado rápido desde tarjeta falló', e);
      toast.error('No pudimos agregar la pieza. Intenta de nuevo.');
    } finally {
      setAdding(false);
    }
  };

  return (
    // 5.108b (pedido del dueño) · h-full: dentro de los carruseles el envoltorio
    // estira a la tarjeta más alta de la hilera y esta la ocupa completa —
    // TODAS las tarjetas de la hilera quedan con la misma altura.
    <article className="group relative flex h-full flex-col overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1 transition-colors hover:border-signal focus-within:border-signal">
      {/* 5.83 · SOLO la PORTADA en la tarjeta (como en la app de referencia): el carrusel
          con todas las fotos vive en la ficha del producto. Tocar la foto
          abre la ficha. Con una sola foto, misma tarjeta de siempre. */}
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        <div className="relative h-full w-full">
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={alFallarFoto}
          />
          <Link
            to={`/catalogo/${product.slug}`}
            aria-label={product.name}
            onClick={goToProduct}
            className="absolute inset-0"
          />
        </div>
        {product.stockTotal <= 5 && (
          <span
            className={`absolute bottom-2 left-2 z-10 rounded-brand border-2 bg-ink/50 px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${
              product.stockTotal <= 0 ? 'border-line text-muted' : 'border-signal text-signal'
            }`}
          >
            {/* 5.104 · texto unificado con la ficha: 1 pieza → «Última disponible» */}
            {etiquetaStock(product.stockTotal)}
          </span>
        )}
        {/* 5.108 (pedido del dueño) · COMPARTIR desde la tarjeta: píldora
            discreta arriba-izquierda (la opuesta al «+» que vive arriba-
            derecha; el chip de stock usa abajo-izquierda). Abre el panel
            nativo del teléfono y, en PC, copia el enlace de la ficha. */}
        <BotonCompartir
          titulo={product.name}
          texto={`Mira esta pieza en SPOT 24: ${displayName}`}
          url={`${TITULAR.sitio}catalogo/${product.slug}`}
          tipo="producto"
          itemId={product.id}
          ariaLabel={`Compartir ${product.name}`}
          iconSize={16}
          className="absolute left-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border-2 border-line bg-ink/50 text-paper backdrop-blur transition-colors hover:border-signal hover:text-signal"
        />
      </div>

      {/* 5.85 · stepper de la app de referencia que se RETRAE: círculo «+» → cápsula «− qty +»
          → al soltar (1.8 s) se retrae sola y queda el NÚMERO en el círculo;
          tocar el círculo vuelve a abrir la cápsula. Todo a 32 px (antes 36 px)
          y el símbolo/número ocupa el 80 % del círculo. «−» a 0 quita la línea;
          «+» se desactiva en el tope (stock al agregar, tope por línea). */}
      {line ? (
        expanded ? (
          <div className="absolute right-2 top-2 z-20 flex h-8 items-center overflow-hidden rounded-full bg-signal font-display text-paper">
            <button
              type="button"
              aria-label={`Quitar una unidad de ${product.name}`}
              disabled={adding}
              onClick={() =>
                line.qty <= 1
                  ? removeItem(line.productId, line.variantId)
                  : setQty(line.productId, line.variantId, line.qty - 1)
              }
              className="flex h-full w-7 items-center justify-center text-lg font-black leading-none transition-colors hover:bg-black/20 disabled:opacity-50"
            >
              −
            </button>
            <span aria-live="polite" className="min-w-5 text-center text-sm font-black italic leading-none">
              {line.qty}
            </span>
            <button
              type="button"
              aria-label={`Agregar una unidad de ${product.name}`}
              disabled={adding || atCap}
              onClick={() => setQty(line.productId, line.variantId, line.qty + 1)}
              className="flex h-full w-7 items-center justify-center text-lg font-black leading-none transition-colors hover:bg-black/20 disabled:opacity-50"
            >
              +
            </button>
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Cambiar la cantidad de ${product.name} en el carrito`}
            onClick={() => setExpanded(true)}
            className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-signal font-display font-black italic leading-none text-paper transition-transform hover:scale-110"
          >
            <span
              aria-live="polite"
              className={line.qty >= 10 ? 'text-[19px]' : 'text-[25.6px]'}
            >
              {line.qty}
            </span>
          </button>
        )
      ) : (
        <button
          type="button"
          aria-label={`Agregar ${product.name} al carrito`}
          disabled={product.stockTotal <= 0 || adding}
          onClick={() => {
            void handleQuickAdd();
          }}
          className="absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-signal font-display text-paper transition-transform hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        >
          {/* 5.85 · «+» dibujado a 25.6 px = el 80 % del círculo de 32 px */}
          <svg width="25.6" height="25.6" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M12 4.6v14.8M4.6 12h14.8"
              stroke="currentColor"
              strokeWidth="2.9"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        </button>
      )}

      <Link
        to={`/catalogo/${product.slug}`}
        aria-label={product.name}
        onClick={goToProduct}
        className="flex flex-1 flex-col gap-1.5 p-4"
      >
        {/* Marca SIEMPRE arriba, sola: si el admin incluyó la marca dentro del
            nombre del producto, cleanProductName la recorta para no repetirla. */}
        <p className="spot-label">{product.brand}</p>
        {/* 5.108b · min-h-10 reserva SIEMPRE el alto de 2 líneas (2 × 20 px):
            nombre de 1 línea deja el espacio en blanco y la tarjeta no se
            encoge (lo visto en Recién llegados). line-clamp-2 sigue cortando
            los nombres que excedan 2 líneas. */}
        <h3 className="min-h-10 font-display text-base font-bold italic uppercase leading-tight text-paper line-clamp-2">
          {displayName}
        </h3>
        {/* 5.98 · Solo con reseñas visibles: la tarjeta de siempre, con una fila
            fina de rating encima del precio cuando ya hay opiniones. */}
        <RatingLine avg={product.ratingAvg ?? 0} count={product.ratingCount ?? 0} compact />
        {/* 5.108b · mt-auto fija el precio ABAJO en todas las tarjetas: aunque
            una tenga rating y la otra no, los precios quedan alineados. */}
        <p className="mt-auto font-display text-xl font-extrabold italic leading-tight text-signal">
          {bs !== null ? formatBs(bs) : 'Bs. —'}
        </p>
      </Link>
    </article>
  );
}