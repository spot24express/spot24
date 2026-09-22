import { useSearchParams } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton, Skeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { useCategories, useCategoryCount, useProductList } from '../hooks/useCatalog';
import { CategoryCard } from '../components/CategoryCard';
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
  const { data: count } = useCategoryCount(cat ?? undefined);
  const filters = {
    categoryId: cat ?? undefined,
    inStockOnly: inStock,
    maxPriceUsd: maxPrice ?? undefined,
    q,
  };
  const { data, isError, refetch, isFetching, hasNextPage, fetchNextPage } = useProductList(filters, 12);

  const category = categories?.find((c) => c.id === cat);

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
            {category ? `${category.code} · ${category.name}` : q ? `Búsqueda: ${q}` : 'Catálogo'}
          </h1>
          <p className="spot-subtitle mt-1">
            {data && !isFetching
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
            {categories?.map((c) => (
              <CategoryCardItem key={c.id} id={c.id} />
            ))}
          </div>
        </section>
      )}

      <div className="mt-8">
        {isError ? (
          <ErrorState onRetry={() => void refetch()} />
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

      <SpeedDivider className="mt-14" />
    </div>
  );
}

function CategoryCardItem({ id }: { id: string }) {
  const { data: categories } = useCategories();
  const category = categories?.find((c) => c.id === id);
  const { data: count } = useCategoryCount(id);
  if (!category) return <Skeleton className="min-h-[120px]" />;
  return <CategoryCard category={category} count={count} />;
}
