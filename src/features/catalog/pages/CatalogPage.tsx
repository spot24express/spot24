import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { useCategories, useCategoryCount, useProductList } from '../hooks/useCatalog';
import { branchRootId, hasSubcategories, isTopLevel, subcategoriesOf } from '@/shared/lib/categoryTree';
import { CategoryCard, SubcategoryCard } from '../components/CategoryCard';
import { ProductCard } from '../components/ProductCard';
import { SearchBar, FilterBar } from '../components/SearchBar';
import { VOICE } from '@/shared/constants/brand';

/** Listado con paginación por cursor, filtros y búsqueda (5.1). */
export default function CatalogPage() {
  useDocumentTitle('Catálogo');
  const [params, setParams] = useSearchParams();
  const cat = params.get('cat');
  const q = params.get('q') ?? undefined;
  const inStock = params.get('stock') === '1';
  const maxPrice = params.get('max') ? Number(params.get('max')) : null;

  const { data: categories } = useCategories();
  // Ronda 5.78c (pedido del dueño): CADA categoría muestra SOLO sus productos
  // directos. Un producto movido a una subcategoría sale ÚNICAMENTE dentro de
  // esa subcategoría — la principal ya NO lo repite (desde 5.76 la principal
  // sumaba también lo de sus hijas y el dueño lo vio como producto doble).
  // Ronda 5.81 (estilo Farmatodo): si la categoría activa TIENE subcategorías,
  // muestra SOLO las tarjetas de subcategorías — ni productos ni vacío. Solo
  // una categoría SIN subcategorías muestra sus productos directamente.
  const catHasSubcats = Boolean(cat && categories && hasSubcategories(categories, cat));
  const { data: count } = useCategoryCount(catHasSubcats ? undefined : (cat ?? undefined));
  const filters = {
    categoryId: cat ?? undefined,
    inStockOnly: inStock,
    maxPriceUsd: maxPrice ?? undefined,
    q,
  };
  const { data, isError, error, refetch, isFetching, hasNextPage, fetchNextPage } = useProductList(
    filters,
    12,
    !catHasSubcats, // bahía con subcategorías: ni consulta de productos (cero lecturas en vano)
  );

  const category = categories?.find((c) => c.id === cat);

  // Ronda 5.77 · TARJETAS DE SUBCATEGORÍAS (ejemplo Farmatodo, estilo pit-stop):
  // si la categoría activa —o la rama, si hay una subcategoría elegida— tiene
  // hijas, se ven como tarjetas ANTES de los productos, sin contador (5.78).
  // Así el cliente las descubre sin leer chips.
  const activeRootId = cat && categories ? branchRootId(categories, cat) : '';
  const branchRoot = categories?.find((c) => c.id === activeRootId);
  const subcats = activeRootId && categories ? subcategoriesOf(categories, activeRootId) : [];

  const patch = (p: { categoryId?: string | null; inStockOnly?: boolean; maxPrice?: number | null }) => {
    const next = new URLSearchParams(params);
    if (p.categoryId !== undefined) {
      if (p.categoryId) next.set('cat', p.categoryId);
      else next.delete('cat');
    }
    if (p.inStockOnly !== undefined) {
      if (p.inStockOnly) next.set('stock', '1');
      else next.delete('stock');
    }
    if (p.maxPrice !== undefined) {
      if (p.maxPrice) next.set('max', String(p.maxPrice));
      else next.delete('max');
    }
    setParams(next, { replace: true });
  };

  const items = data?.pages.flatMap((pg) => pg.items) ?? [];

  // Sin filtros: muestra también la grilla de categorías arriba.
  const showCategoryGrid = !cat && !q && !inStock && !maxPrice;

  return (
    <div className="spot-container py-8">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="spot-title">
            {category
              ? `${category.code ? `${category.code} · ` : ''}${category.name}`
              : q
                ? `Búsqueda: ${q}`
                : 'Catálogo'}
          </h1>
          <p className="spot-subtitle mt-1">
            {catHasSubcats
              ? 'Elige una subcategoría: verás solo los productos que están dentro de ella.'
              : data && !isFetching
                ? `${items.length}${hasNextPage ? '+' : ''} productos${typeof count === 'number' && cat ? ` · ${count} en la categoría` : ''}`
                : 'Cargando pit stop…'}
          </p>
        </div>
        <SearchBar compact />
      </div>

      <FilterBar
        activeCategory={cat}
        inStockOnly={inStock}
        maxPrice={maxPrice}
        onChange={(p) => patch(p)}
      />

      {showCategoryGrid && (
        <section className="mt-8" aria-label="Categorías">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {/* Solo principales: las subcategorías viven dentro de su bahía (tarjetas 5.77) */}
            {categories?.filter(isTopLevel).map((c) => (
              <CategoryCard key={c.id} category={c} />
            ))}
          </div>
        </section>
      )}

      {/* Ronda 5.77 · Subcategorías de la categoría activa. 5.81: si hay
          subcategorías, ESTA es toda la vista (estilo Farmatodo): los
          productos de la bahía quedan reservados a categorías sin hijas. */}
      {subcats.length > 0 && (
        <section className="mt-8" aria-label="Subcategorías">
          <p className="spot-label mb-3">
            Subcategorías{branchRoot ? ` · ${branchRoot.code ? `${branchRoot.code} ` : ''}${branchRoot.name}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {subcats.map((s) => (
              <SubcategoryCard key={s.id} category={s} active={s.id === cat} />
            ))}
          </div>
        </section>
      )}

      {/* 5.81 · sección de productos: SOLO cuando la categoría activa no tiene
          subcategorías (o no hay categoría: búsqueda/lista general). */}
      {!catHasSubcats && (
        <div className="mt-8">
          {isError ? (
            <>
              <ErrorState onRetry={() => void refetch()} />
              {/* Ronda 5.20: detalle técnico visible. Si el catálogo falla, este texto
                  dice exactamente qué consulta falló (índice faltante, permisos, etc.).
                  El error de Firestore incluye el enlace para crear el índice que falta. */}
              <p className="mt-4 break-all rounded-brand border-2 border-line bg-surface-1 p-3 text-xs text-muted">
                Detalle técnico: {error instanceof Error ? error.message : String(error ?? 'desconocido')}
              </p>
            </>
          ) : data ? (
            items.length ? (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
                {hasNextPage && (
                  <div className="mt-8 flex justify-center">
                    <Button
                      variant="secondary"
                      loading={isFetching}
                      onClick={() => void fetchNextPage()}
                    >
                      Cargar más
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <EmptyState
                title="Nada por aquí"
                message={q ? VOICE.emptySearch : VOICE.emptyCatalog}
                action={{
                  label: 'Ver todo el catálogo',
                  onClick: () => {
                    setParams(new URLSearchParams(), { replace: true });
                  },
                }}
              />
            )
          ) : (
            <ProductGridSkeleton />
          )}
        </div>
      )}

      <SpeedDivider className="mt-14" />
    </div>
  );
}