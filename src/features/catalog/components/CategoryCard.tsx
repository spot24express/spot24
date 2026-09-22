import { Link } from 'react-router-dom';
import type { CategoryDef } from '@/shared/constants/categories';

/** Tarjeta de categoría numerada 01–08 (home). */
export function CategoryCard({ category, count }: { category: CategoryDef; count?: number }) {
  return (
    <Link
      to={`/catalogo?cat=${category.id}`}
      className="group relative flex min-h-[120px] flex-col justify-between overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1 p-4 transition-colors hover:border-signal focus-visible:border-signal"
    >
      {/* Número grande estilo pit stop */}
      <span className="pointer-events-none absolute -right-2 -top-4 select-none font-display text-7xl font-black italic text-surface-3 transition-colors group-hover:text-signal/25">
        {category.code}
      </span>
      <div>
        <h3 className="relative font-display text-lg font-extrabold italic uppercase leading-tight text-paper">
          {category.name}
        </h3>
        <p className="mt-1 text-sm text-muted">{category.tagline}</p>
      </div>
      <p className="relative mt-3 spot-label">
        {typeof count === 'number' ? `${count} productos` : 'Ver catálogo'}
      </p>
    </Link>
  );
}
