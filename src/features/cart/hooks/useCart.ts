/** Hooks públicos del módulo carrito (única puerta desde componentes). */
import { useCartStore } from '../store/cart.store';
import { itemCount, subtotalRef, totalWeight } from '../lib/cartLogic';

export function useCart() {
  const items = useCartStore((s) => s.items);
  const addItem = useCartStore((s) => s.addItem);
  const setQty = useCartStore((s) => s.setQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clear = useCartStore((s) => s.clear);
  return {
    items,
    addItem,
    setQty,
    removeItem,
    clear,
    count: itemCount(items),
    subtotalRef: subtotalRef(items),
    weightKg: totalWeight(items),
    isEmpty: items.length === 0,
  };
}
