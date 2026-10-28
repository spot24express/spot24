import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useProductList, normalizeSearchTerm } from '../hooks/useCatalog';
import { VOICE } from '@/shared/constants/brand';
import { Chip } from '@/shared/components/ui/Badge';

/**
 * Búsqueda con debounce (300 ms) y sugerencias en línea (5.1).
 * Navega a /catalogo?q=... ; las sugerencias salen del listado filtrado.
 */
export function SearchBar({ compact = false }: { compact?: boolean }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [term, setTerm] = useState(params.get('q') ?? '');
  const debounced = useDebounce(term, 300);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const q = normalizeSearchTerm(debounced);
  const { data, isFetching } = useProductList(
    { q: q.length >= 3 ? q : undefined },
    5,
  );
  const suggestions = q.length >= 3 ? (data?.pages[0]?.items ?? []) : [];

  useEffect(() => {
    const onClickAway = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const submit = () => {
    if (q.length < 2) return;
    setOpen(false);
    navigate(`/catalogo?q=${encodeURIComponent(q)}`);
  };

  return (
    <div ref={boxRef} className={`relative ${compact ? '' : 'w-full max-w-xl'}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="spot-search" className="sr-only">
          Buscar productos
        </label>
        <div className="flex overflow-hidden rounded-brand border-2 border-line bg-surface-1 focus-within:border-signal">
          <input
            id="spot-search"
            type="search"
            value={term}
            placeholder="Buscar: aceite 5W-30, filtro Corolla, batería…"
            onChange={(e) => {
              setTerm(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="min-h-[48px] w-full bg-transparent px-4 text-paper text-body-base placeholder:text-muted/60 focus:outline-none"
            maxLength={80}
          />
          <button
            type="submit"
            aria-label="Buscar"
            className="flex min-h-[48px] min-w-[52px] items-center justify-center bg-signal text-paper hover:bg-[#d80801]"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.8-3.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </form>

      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Sugerencias"
          className="absolute z-40 mt-2 w-full overflow-hidden rounded-brand border-2 border-line bg-ink shadow-none"
        >
          {suggestions.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  setOpen(false);
                  navigate(`/catalogo/${p.slug}`);
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-surface-2"
              >
                <span className="truncate text-paper">
                  {p.name} <span className="text-muted">· {p.brand}</span>
                </span>
                <span className="shrink-0 font-display text-sm font-bold italic text-signal">
                  desde ${p.basePriceUsd.toFixed(2)}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={submit}
              className="w-full px-4 py-2.5 text-left spot-label hover:bg-surface-2"
            >
              Ver todos los resultados de "{term}"
            </button>
          </li>
        </ul>
      )}
      {open && q.length >= 3 && suggestions.length === 0 && !isFetching && (
        <p className="absolute z-40 mt-2 w-full rounded-brand border-2 border-line bg-ink px-4 py-3 text-sm text-muted">
          {VOICE.emptySearch}
        </p>
      )}
    </div>
  );
}

/**
 * Barra de filtros 5.111 (estilo de la app de farmacia de referencia, decisión del dueño): UNA sola fila
 * con lo esencial — «Ordenar» por precio + «Ver todo» — y los dos filtros que
 * el dueño pidió CONSERVAR: «Solo disponibles» y «Precio máx.».
 * La fila de chips de categorías se RETIRÓ: navegar por categorías se hace con
 * sus TARJETAS (la grilla de bahías al entrar al catálogo y las tarjetas de
 * subcategorías dentro de cada bahía, rondas 5.77/5.81) — igual que la app de
 * referencia: categorías → subcategorías → productos, sin duplicar navegación.
 * «Ver todo» solo se muestra con algo activo y limpia TODO (categoría,
 * búsqueda, filtros y orden) de un toque.
 * Ronda 5.111: el orden es de CLIENTE (lib/orden.ts): recalcula sobre lo
 * cargado, sin tocar la consulta ni los índices de Firestore.
 */
export function FilterBar({
  inStockOnly,
  maxPrice,
  orden,
  mostrarVerTodo,
  onChange,
  onReset,
}: {
  inStockOnly: boolean;
  maxPrice: number | null;
  orden: 'asc' | 'desc' | null;
  mostrarVerTodo: boolean;
  onChange: (patch: {
    inStockOnly?: boolean;
    maxPrice?: number | null;
    orden?: 'asc' | 'desc' | null;
  }) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3" role="group" aria-label="Filtros del catálogo">
      <label className="flex items-center gap-2 spot-label" htmlFor="orden-filter">
        Ordenar
        <select
          id="orden-filter"
          value={orden ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ orden: v === 'asc' || v === 'desc' ? v : null });
          }}
          className="rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none"
        >
          <option value="">Recientes</option>
          <option value="asc">Menor precio</option>
          <option value="desc">Mayor precio</option>
        </select>
      </label>
      <Chip active={inStockOnly} onClick={() => onChange({ inStockOnly: !inStockOnly })}>
        Solo disponibles
      </Chip>
      <label className="flex items-center gap-2 spot-label" htmlFor="price-filter">
        Precio máx.
        <input
          id="price-filter"
          type="number"
          inputMode="decimal"
          min={0}
          step={5}
          placeholder="USD"
          value={maxPrice ?? ''}
          onChange={(e) => {
            const v = e.target.value === '' ? null : Number(e.target.value);
            onChange({ maxPrice: v !== null && Number.isFinite(v) && v > 0 ? v : null });
          }}
          className="w-24 rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none"
        />
      </label>
      {mostrarVerTodo && (
        <Chip active={false} onClick={onReset}>
          Ver todo
        </Chip>
      )}
    </div>
  );
}