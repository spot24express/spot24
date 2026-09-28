import { Link } from 'react-router-dom';
import type { CategoryDef } from '@/shared/constants/categories';

/**
 * Tarjeta de categoría: número de bahía estilo pit stop sobre foto de fondo.
 * Sin imagen definida conserva el estilo limpio de siempre.
 */
export function CategoryCard({ category }: { category: CategoryDef }) {
  const bg = category.imageUrl?.trim();
  return (
    <Link
      to={`/catalogo?cat=${category.id}`}
      className="group relative flex min-h-[140px] flex-col justify-end overflow-hidden rounded-brand-lg border-2 border-line bg-surface-1 p-4 transition-colors hover:border-signal focus-visible:border-signal"
    >
      {/* Foto de fondo con velo oscuro para mantener la legibilidad */}
      {bg && (
        <>
          <img
            src={bg}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30"
          />
        </>
      )}

      {/* Número grande estilo pit stop */}
      <span className="pointer-events-none absolute -right-2 -top-4 select-none font-display text-7xl font-black italic text-surface-3 transition-colors group-hover:text-signal/25">
        {category.code}
      </span>

      <div className="relative">
        <h3 className="font-display text-lg font-extrabold italic uppercase leading-tight text-paper">
          {category.name}
        </h3>
        <p className={`mt-1 text-sm ${bg ? 'text-paper/80' : 'text-muted'}`}>{category.tagline}</p>
      </div>
    </Link>
  );
}