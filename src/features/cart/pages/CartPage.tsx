import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { useCart } from '../hooks/useCart';
import { Button } from '@/shared/components/ui/Button';
import { PriceTag } from '@/shared/components/ui/PriceTag';
import { EmptyState } from '@/shared/components/ui/States';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { VOICE } from '@/shared/constants/brand';
import { formatWeight } from '@/shared/lib/format';
import { clampSetQty } from '../lib/cartLogic';

/** Carrito persistente con validación de stock y totales referenciales (5.2). */
export default function CartPage() {
  useDocumentTitle('Mi carrito');
  const { items, setQty, removeItem, count, subtotalRef, weightKg, isEmpty } = useCart();
  const { user } = useAuth();

  if (isEmpty) {
    return (
      <div className="spot-container py-16">
        <EmptyState
          title="Carrito vacío"
          message={VOICE.emptyCart}
          action={{ label: 'Ir al catálogo', onClick: () => window.location.assign('/catalogo') }}
        />
      </div>
    );
  }

  return (
    <div className="spot-container py-8">
      <h1 className="spot-title">Mi carrito</h1>
      <p className="spot-subtitle mt-1">
        {count} {count === 1 ? 'artículo' : 'artículos'} · {formatWeight(weightKg)}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* LÍNEAS */}
        <ul className="space-y-4" aria-label="Artículos del carrito">
          {items.map((item) => (
            <li
              key={item.variantId}
              className="flex gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4"
            >
              <img
                src={item.image}
                alt={item.name}
                className="h-24 w-24 shrink-0 rounded-brand border border-line object-cover"
                loading="lazy"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="spot-label">{item.sku}</p>
                    <h2 className="truncate font-display text-base font-bold italic uppercase text-paper">
                      {item.name}
                    </h2>
                    <p className="text-sm text-muted">{item.variantName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.variantId)}
                    aria-label={`Quitar ${item.name}`}
                    className="rounded-brand p-2 text-muted hover:bg-surface-2 hover:text-signal"
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                      <path d="M4 5h12M8 5V3h4v2M6.5 5l.8 11h5.4l.8-11" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>

                <div className="mt-auto flex items-end justify-between gap-3 pt-3">
                  <div className="flex items-center rounded-brand border-2 border-line">
                    <button
                      type="button"
                      aria-label="Disminuir"
                      className="min-h-[40px] w-10 font-display font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                      disabled={item.qty <= 1}
                      onClick={() => setQty(item.variantId, item.qty - 1)}
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-display font-bold italic text-paper">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Aumentar"
                      className="min-h-[40px] w-10 font-display font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                      disabled={item.qty >= Math.min(item.stockAtAdd, 20)}
                      onClick={() => setQty(item.variantId, clampSetQty(item.qty + 1, item.stockAtAdd))}
                    >
                      +
                    </button>
                  </div>
                  <PriceTag usd={item.unitPriceUsd * item.qty} size="sm" />
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* RESUMEN */}
        <aside className="h-fit rounded-brand-lg border-2 border-line bg-surface-1 p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">Resumen</h2>
          <dl className="mt-4 space-y-2 text-body-base">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal referencial</dt>
              <dd className="font-semibold text-paper">${subtotalRef.toFixed(2)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Envío</dt>
              <dd className="text-muted">se calcula por zona</dd>
            </div>
          </dl>
          <SpeedDivider className="my-4" />
          <p className="text-sm text-muted">
            El total final en USD y su equivalencia en bolívares (tasa BCV) los calcula el
            servidor al confirmar. Nada se cobra sin tu comprobante.
          </p>
          <div className="mt-5 space-y-3">
            {user ? (
              <Link to="/checkout" className="block">
                <Button size="lg" fullWidth>
                  Continuar al pago
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/cuenta/login?from=/checkout" className="block">
                  <Button size="lg" fullWidth>
                    Entrar y pagar
                  </Button>
                </Link>
                <p className="text-center text-sm text-muted">
                  Tu carrito se fusiona solo al iniciar sesión.
                </p>
              </>
            )}
            <Link to="/catalogo" className="block">
              <Button variant="ghost" fullWidth>
                Seguir comprando
              </Button>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
