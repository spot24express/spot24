import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Product } from '../types';
import { trackEvent } from '@/shared/lib/analytics';
import { formatBs, usdToBs } from '@/shared/lib/format';
import { cleanProductName } from '@/shared/lib/display';
import { useBcvRate } from '@/shared/hooks/useBcvRate';
import { getVariants } from '../services/catalog.service';
import { useCart } from '@/features/cart/hooks/useCart';
import { validateAdd } from '@/features/cart/lib/cartLogic';
import { toast } from '@/shared/lib/toast';
import { logger } from '@/shared/lib/logger';

interface ProductCardProps {
  product: Product;
}

/**
 * Tarjeta de producto (estilo referencia Farmatodo adaptado al tema pit stop):
 * imagen arriba con el círculo «+» de agregado rápido y aviso de stock, y en
 * el cuerpo marca (sola, arriba) → nombre sin repetir la marca → precio en Bs.
 * (tasa BCV en vivo).
 * El enlace estirado cubre toda la tarjeta (sin anidar interactivos) y el
 * «+» vive por encima (z-20). Agregado rápido:
 * · producto de UNA variante → agrega directo (consulta puntual de variantes);
 * · producto de VARIAS variantes → lleva a la ficha para elegirla.
 */
export function ProductCard({ product }: ProductCardProps) {
  const rate = useBcvRate();
  const navigate = useNavigate();
  const { addItem, items } = useCart();
  const [adding, setAdding] = useState(false);
  const image = product.images[0] ?? '/img/products/lubricantes.svg';
  const bs = rate ? usdToBs(product.basePriceUsd, rate.rate) : null;

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
      if (ok) toast.success('En el carrito. Para. Resuelve. Sigue.');
    } catch (e) {
      logger.warn('agregado rápido desde tarjeta falló', e);
      toast.error('No pudimos agregar la pieza. Intenta de nuevo.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1 transition-colors hover:border-signal focus-within:border-signal">
      <div className="aspect-square overflow-hidden bg-surface-2">
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {product.stockTotal <= 5 && (
        <span
          className={`absolute bottom-2 left-2 rounded-brand border-2 bg-ink/85 px-2 py-1 text-[11px] font-semibold uppercase tracking-label ${
            product.stockTotal <= 0 ? 'border-line text-muted' : 'border-signal text-signal'
          }`}
        >
          {product.stockTotal <= 0 ? 'Sin stock' : `Últimas ${product.stockTotal}`}
        </span>
      )}

      <button
        type="button"
        aria-label={`Agregar ${product.name} al carrito`}
        disabled={product.stockTotal <= 0 || adding}
        onClick={() => {
          void handleQuickAdd();
        }}
        className="absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-signal font-display text-2xl font-black italic leading-none text-paper transition-transform hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
      >
        +
      </button>

      <Link
        to={`/catalogo/${product.slug}`}
        aria-label={product.name}
        onClick={() => {
          void trackEvent({ name: 'view_item', params: { itemId: product.id, itemCategory: product.categoryId } });
        }}
        className="absolute inset-0 z-10 rounded-brand-lg focus-visible:outline-2 focus-visible:outline-signal"
      />

      <div className="flex flex-1 flex-col gap-1.5 p-4">
        {/* Marca SIEMPRE arriba, sola: si el admin incluyó la marca dentro del
            nombre del producto, cleanProductName la recorta para no repetirla. */}
        <p className="spot-label">{product.brand}</p>
        <h3 className="font-display text-base font-bold italic uppercase leading-tight text-paper line-clamp-2">
          {displayName}
        </h3>
        <p className="font-display text-xl font-extrabold italic leading-tight text-signal">
          {bs !== null ? formatBs(bs) : 'Bs. —'}
        </p>
      </div>
    </article>
  );
}