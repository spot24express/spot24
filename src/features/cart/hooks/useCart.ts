/** Hooks públicos del módulo carrito (única puerta desde componentes). */
import { useCartStore } from '../store/cart.store';
import { itemCount, subtotalRef } from '../lib/cartLogic';

export function useCart() {
  const items = useCartStore((s) => s.items);
  const hydrated = useCartStore((s) => s.hydrated);
  const addItem = useCartStore((s) => s.addItem);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  return {
    items,
    // 5.144 · ¿Ya se restauró el carrito tras una RECARGA? Al recargar la
    // página el store arranca con items: [] y el carrito real llega ASÍNCRONO
    // (observeAuth → hydrateForUser: localStorage o Firestore). Los efectos
    // del checkout que dependen del carrito (reserva de stock, cotización)
    // deben esperar a este flag ANTES de decidir correr — si no, corren con
    // el carrito vacío, se quedan sin otra corrida y el checkout se cuelga
    // en «Calculando montos exactos…». En navegación normal ya está true
    // (no cambia nada); en recarga es la señal que re-dispara la cotización.
    hydrated,
    addItem,
    setQty,
    removeItem,
    clear,
    count: itemCount(items),
    subtotalRef: subtotalRef(items),
    isEmpty: items.length === 0,
  };
}