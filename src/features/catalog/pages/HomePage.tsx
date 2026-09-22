import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { ProductGridSkeleton, Skeleton } from '@/shared/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/shared/components/ui/States';
import { useCategories, useCategoryCount, useProductList } from '../hooks/useCatalog';
import { CategoryCard } from '../components/CategoryCard';
import { ProductCard } from '../components/ProductCard';
import { SearchBar } from '../components/SearchBar';
import { VOICE } from '@/shared/constants/brand';

/** Home: hero de marca + las ocho categorías numeradas 01–08 + destacados. */
export default function HomePage() {
  useDocumentTitle('Tu parada segura. 24/7');
  const { data: categories } = useCategories();
  const { data: page, isError, refetch } = useProductList({}, 8);

  return (
    <div className="spot-container py-8">
      {/* HERO */}
      <section className="rounded-brand-lg border-2 border-line bg-surface-1 px-6 py-10 sm:px-10 sm:py-14">
        <SpeedLines className="mb-6" />
        <h1 className="max-w-2xl font-display text-4xl font-black italic uppercase leading-[1.05] text-paper sm:text-6xl">
          Tu parada segura. <span className="text-signal">24/7.</span>
        </h1>
        <p className="mt-4 max-w-xl text-body-lg text-muted">
          Repuestos, servicios y conveniencia entregados a tu puerta. Pedidos por la app, pago
          venezolano y seguimiento en vivo. <strong className="text-paper">Para. Resuelve. Sigue.</strong>
        </p>
        <div className="mt-8">
          <SearchBar />
        </div>
        <dl className="mt-8 grid grid-cols-3 gap-4 text-center sm:max-w-md">
          <div>
            <dt className="spot-label">Entrega</dt>
            <dd className="font-display text-2xl font-extrabold italic text-signal">45 min</dd>
          </div>
          <div>
            <dt className="spot-label">Cobertura</dt>
            <dd className="font-display text-2xl font-extrabold italic text-paper">5 zonas</dd>
          </div>
          <div>
            <dt className="spot-label">Operación</dt>
            <dd className="font-display text-2xl font-extrabold italic text-paper">24/7</dd>
          </div>
        </dl>
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
