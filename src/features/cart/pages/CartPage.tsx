import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { useCart } from '../hooks/useCart';
import { Button } from '@/shared/components/ui/Button';
import { PriceTag } from '@/shared/components/ui/PriceTag';
import { EmptyState } from '@/shared/components/ui/States';
import { SpeedDivider } from '@/shared/components/brand/Logo';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useBcvRate } from '@/shared/hooks/useBcvRate';
import { formatBs, usdToBs } from '@/shared/lib/format';
import { cleanProductName } from '@/shared/lib/display';
import { VOICE } from '@/shared/constants/brand';
import { clampSetQty, cartLineKey } from '../lib/cartLogic';
import { getProductsByIds } from '@/features/catalog/services/catalog.service';
import { useCartStore, type SnapshotFix } from '../store/cart.store';

/**
 * Carrito persistente con validación de stock y totales referenciales (5.2).
 *
 * Ronda 5e:
 * · La tarjeta muestra MARCA arriba y el nombre sin repetir la marca, igual
 *   que el catálogo (cleanProductName). Aunque el admin guardara el nombre
 *   como «POLARCAR Caroreña Verano», aquí solo se ve «POLAR / Caroreña Verano».
 * · Auto-reparación: las líneas agregadas antes de esta ronda guardaron el
 *   nombre congelado y sin marca. Al abrir el carrito se consulta el producto
 *   vigente (lectura puntual, 1 vez por producto) y la línea se actualiza con
 *   su marca y nombre actuales. Precio y cantidad NUNCA se tocan.
 * · Cada línea se identifica por productId+variantId: las variantes «v1» de
 *   productos distintos ya no se pisan entre sí.
 *
 * Ronda 5.15 — TARJETA SIN DESBORDAMIENTO EN MÓVIL (reporte del dueño):
 * con nombres largos la página se desbordaba horizontalmente. Causa raíz:
 * el nombre con `truncate` es white-space:nowrap y, como los ítems del grid
 * no tenían min-w-0, la pista del grid crecía al ancho completo del texto
 * (medido: 789 px en un viewport de 360 px). Correcciones:
 * · min-w-0 en los DOS ítems del grid (ul y aside) → la pista puede encoger.
 * · Nombre con line-clamp-2 (2 líneas + elipsis) en vez de 1: se ve más
 *   nombre y el texto sí envuelve (min-content = palabra más larga).
 * · Marca/SKU con truncate (una sola línea).
 * · Fila cantidad+precio con flex-wrap y precio ml-auto: si no caben
 *   juntas, el precio pasa a su propia línea alineado a la derecha.
 * · Foto 80 px en móvil (h-20) y 96 px desde sm: tarjeta más equilibrada.
 * · Validado en navegador headless: 360 px y 320 px sin scroll horizontal.
 *
 * Ronda 5.24 — FILA DE CANTIDAD BAJO LA IMAGEN EN MÓVIL (petición del dueño):
 * en teléfono, el escalador −1+ ahora queda DEBAJO de la foto alineado a la
 * izquierda y el precio en ESA MISMA línea alineado a la derecha (patrón
 * MercadoLibre/Farmatodo: la mano no cruza la tarjeta para editar cantidad).
 * En PC (sm+) la tarjeta no cambia: foto izquierda con marca/nombre arriba y
 * la fila cantidad+precio al pie de la columna derecha.
 * Implementación: CSS Grid con posiciones responsivas — sin duplicar el
 * escalador en el DOM (un solo set de botones, mejor para lectores de
 * pantalla y para el Tab del teclado).
 * · Móvil  : grid-cols-[5rem_1fr] → foto (1,1), texto (1,2) y la fila
 *            cantidad+precio ocupa las DOS columnas (col-span-2) debajo.
 * · Desde sm: la foto hace row-span-2 y la fila vuelve a la columna derecha
 *            (col-start-2), con pt-3 igual al diseño anterior.
 */
export default function CartPage() {
  useDocumentTitle('Mi carrito');
  const navigate = useNavigate();
  const { items, setQty, removeItem, count, subtotalRef, isEmpty } = useCart();
  const repairSnapshots = useCartStore((s) => s.repairSnapshots);
  const { user } = useAuth();
  const rate = useBcvRate();
  // Ronda 3: el cliente SOLO ve bolívares; el subtotal USD es interno.
  const subtotalBs = rate ? usdToBs(subtotalRef, rate.rate) : null;

  // ── Auto-reparación de líneas viejas (sin marca congelada) ──────────────
  const attempted = useRef<Set<string>>(new Set());
  const repairing = useRef(false);
  useEffect(() => {
    if (repairing.current) return;
    const pending = items.filter((i) => !i.brand && !attempted.current.has(i.productId));
    if (pending.length === 0) return;
    const ids = [...new Set(pending.map((i) => i.productId))];
    ids.forEach((id) => attempted.current.add(id));
    repairing.current = true;
    void getProductsByIds(ids)
      .then((products) => {
        const fixes: SnapshotFix[] = [];
        for (const line of pending) {
          const p = products.find((x) => x.id === line.productId);
          // Solo repara si la marca VIGENTE difiere del snapshot: así no se
          // reescribe el carrito en cada visita sin necesidad.
          if (p && (p.brand !== line.brand || p.name !== line.name)) {
            fixes.push({ productId: line.productId, variantId: line.variantId, name: p.name, brand: p.brand });
          }
        }
        if (fixes.length > 0) repairSnapshots(fixes);
      })
      .catch(() => undefined) // sin catálogo disponible: la línea queda como está
      .finally(() => {
        repairing.current = false;
      });
  }, [items, repairSnapshots]);

  if (isEmpty) {
    return (
      <div className="spot-container py-16">
        <EmptyState
          title="Carrito vacío"
          message={VOICE.emptyCart}
          action={{ label: 'Ir al catálogo', onClick: () => navigate('/catalogo') }}
        />
      </div>
    );
  }

  return (
    <div className="spot-container py-8">
      <h1 className="spot-title">Mi carrito</h1>
      <p className="spot-subtitle mt-1">
        {count} {count === 1 ? 'artículo' : 'artículos'}
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        {/* LÍNEAS — min-w-0: ítem del grid; sin él la pista crece al ancho del
            nombre completo (nowrap) y desborda la pantalla en móvil. */}
        <ul className="min-w-0 space-y-4" aria-label="Artículos del carrito">
          {items.map((item) => {
            // Marca arriba, nombre sin repetirla: misma presentación que la
            // tarjeta del catálogo. Ítems viejos: la reparación trae la marca.
            const displayName = cleanProductName(item.name, item.brand ?? '');
            return (
              <li
                key={cartLineKey(item.productId, item.variantId)}
                className="grid grid-cols-[5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 rounded-brand-lg border-2 border-line bg-surface-1 p-3 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-x-4 sm:gap-y-0 sm:p-4"
              >
                <img
                  src={item.image}
                  alt={displayName}
                  className="h-20 w-20 rounded-brand border border-line object-cover sm:row-span-2 sm:h-24 sm:w-24"
                  loading="lazy"
                />
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="min-w-0">
                      {/* Marca SIEMPRE arriba, sola (respaldo: sku del ítem). */}
                      <p className="spot-label truncate">{item.brand || item.sku}</p>
                      <h2 className="line-clamp-2 font-display text-base font-bold italic uppercase text-paper">
                        {displayName}
                      </h2>
                      {/* La variante (ej. «Estándar») ya no se muestra al cliente:
                          la eligió en la ficha y solo agrega ruido visual. */}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(item.productId, item.variantId)}
                      aria-label={`Quitar ${displayName}`}
                      className="shrink-0 rounded-brand p-2 text-muted hover:bg-surface-2 hover:text-signal"
                    >
                      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path d="M4 5h12M8 5V3h4v2M6.5 5l.8 11h5.4l.8-11" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Ronda 5.24: cantidad + precio en su PROPIA fila. En móvil
                    cruza las dos columnas (queda bajo la foto: escalador a la
                    izquierda, precio a la derecha). Desde sm vuelve a la
                    columna derecha (col-start-2) con pt-3, como el diseño
                    anterior que en PC se ve perfecto. */}
                <div className="col-span-2 flex items-end justify-between gap-x-3 sm:col-span-1 sm:col-start-2 sm:pt-3">
                  <div className="flex items-center rounded-brand border-2 border-line">
                    <button
                      type="button"
                      aria-label="Disminuir"
                      className="min-h-[40px] w-10 font-display font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                      disabled={item.qty <= 1}
                      onClick={() => setQty(item.productId, item.variantId, item.qty - 1)}
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-display font-bold italic text-paper">{item.qty}</span>
                    <button
                      type="button"
                      aria-label="Aumentar"
                      className="min-h-[40px] w-10 font-display font-bold text-paper hover:bg-surface-2 disabled:opacity-30"
                      disabled={item.qty >= Math.min(item.stockAtAdd, 20)}
                      onClick={() => setQty(item.productId, item.variantId, clampSetQty(item.qty + 1, item.stockAtAdd))}
                    >
                      +
                    </button>
                  </div>
                  <div className="ml-auto">
                    <PriceTag usd={item.unitPriceUsd * item.qty} size="sm" />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {/* RESUMEN */}
        <aside className="h-fit min-w-0 rounded-brand-lg border-2 border-line bg-surface-1 p-6 lg:sticky lg:top-24">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">Resumen</h2>
          <dl className="mt-4 space-y-2 text-body-base">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="font-display text-lg font-extrabold italic text-signal">
                {subtotalBs !== null ? formatBs(subtotalBs) : 'Bs. —'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Envío</dt>
              <dd className="text-muted">por zona · retiro gratis</dd>
            </div>
          </dl>
          <SpeedDivider className="my-4" />

          {/* Cómo funciona el pedido: confianza ANTES de pagar (patrón Farmatodo) */}
          <div className="rounded-brand border-2 border-dashed border-line bg-ink p-4">
            <p className="spot-label mb-2">¿Cómo funciona tu pedido?</p>
            <ol className="space-y-2 text-sm text-paper">
              <li className="flex gap-2">
                <span className="font-display font-bold italic text-signal">1.</span>
                Pides aquí y reservamos tu stock 2 horas.
              </li>
              <li className="flex gap-2">
                <span className="font-display font-bold italic text-signal">2.</span>
                El servidor calcula el monto exacto en bolívares.
              </li>
              <li className="flex gap-2">
                <span className="font-display font-bold italic text-signal">3.</span>
                Pagas por Pago Móvil y subes tu comprobante.
              </li>
            </ol>
          </div>

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