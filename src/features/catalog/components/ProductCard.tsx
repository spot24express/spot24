import { Link } from 'react-router-dom';
import type { Product } from '../types';
import { PriceTag, StockBadge } from '@/shared/components/ui/PriceTag';
import { categoryById } from '@/shared/constants/categories';
import { trackEvent } from '@/shared/lib/analytics';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const category = categoryById(product.categoryId);
  const image = product.images[0] ?? '/img/products/lubricantes.svg';
  return (
    <Link
      to={`/catalogo/${product.slug}`}
      onClick={() => {
        void trackEvent({ name: 'view_item', params: { itemId: product.id, itemCategory: product.categoryId } });
      }}
      className="group flex flex-col overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1 transition-colors hover:border-signal focus-visible:border-signal"
    >
      <div className="relative aspect-square overflow-hidden bg-surface-2">
        <img
          src={image}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        <span className="absolute left-2 top-2 rounded-brand bg-ink/85 px-2 py-1 font-display text-[11px] font-bold italic tracking-label text-signal">
          {category ? `${category.code} · ${category.name}` : product.brand}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="spot-label">{product.brand}</p>
        <h3 className="font-display text-base font-bold italic uppercase leading-tight text-paper line-clamp-2">
          {product.name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2">
          <PriceTag usd={product.basePriceUsd} size="sm" />
          <StockBadge stock={product.stockTotal} />
        </div>
      </div>
    </Link>
  );
}
