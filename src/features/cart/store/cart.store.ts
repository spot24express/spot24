/**
 * Módulo carrito · Store zustand con persistencia.
 * El store orquesta: validación de stock al agregar, persistencia dual
 * (localStorage siempre; Firestore si hay sesión) y fusión al login.
 */
import { create } from 'zustand';
import { toast } from '@/shared/lib/toast';
import { loadCart, saveCart, mergeOnLogin } from '../services/cart.service';
import { validateAdd, clampSetQty } from '../lib/cartLogic';
import type { CartItem } from '../types';
import { AppError } from '@/shared/lib/errors';
import { trackEvent } from '@/shared/lib/analytics';

interface CartState {
  items: CartItem[];
  uid: string | null;
  hydrated: boolean;
  /** Agrega o incrementa una línea; valida stock y topes. */
  addItem: (item: Omit<CartItem, 'qty'>, qty: number) => boolean;
  setQty: (variantId: string, qty: number) => void;
  removeItem: (variantId: string) => void;
  clear: () => void;
  /** Al iniciar sesión: fusiona invitado+remoto y fija uid. */
  hydrateForUser: (uid: string | null) => Promise<void>;
  setHydrated: () => void;
}

async function persist(get: () => CartState): Promise<void> {
  await saveCart(get().uid, get().items);
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  uid: null,
  hydrated: false,

  setHydrated: () => set({ hydrated: true }),

  addItem: (item, qty) => {
    const { items } = get();
    const current = items.find((i) => i.variantId === item.variantId);
    const check = validateAdd(item.stockAtAdd, current?.qty ?? 0, qty);
    if (!check.ok) {
      toast.error(
        check.reason === 'sin-stock'
          ? 'No hay suficiente stock para esa cantidad.'
          : 'Ya tienes el máximo disponible de este artículo.',
      );
      return false;
    }
    const next = current
      ? items.map((i) =>
          i.variantId === item.variantId
            ? { ...i, qty: clampSetQty(i.qty + qty, item.stockAtAdd), stockAtAdd: item.stockAtAdd }
            : i,
        )
      : [...items, { ...item, qty: clampSetQty(qty, item.stockAtAdd) }];
    set({ items: next });
    void persist(get);
    void trackEvent({
      name: 'add_to_cart',
      params: { itemId: item.productId, itemCategory: item.categoryId, quantity: qty },
    });
    return true;
  },

  setQty: (variantId, qty) => {
    const next = get().items
      .map((i) => (i.variantId === variantId ? { ...i, qty: clampSetQty(qty, i.stockAtAdd) } : i))
      .filter((i) => i.qty > 0);
    set({ items: next });
    void persist(get);
  },

  removeItem: (variantId) => {
    set({ items: get().items.filter((i) => i.variantId !== variantId) });
    void persist(get);
  },

  clear: () => {
    set({ items: [] });
    void persist(get);
  },

  hydrateForUser: async (uid) => {
    try {
      if (!uid) {
        // Invitado / arranque: recupera el carrito persistido en localStorage.
        const items = await loadCart(null);
        set({ uid: null, items });
        return;
      }
      const merged = await mergeOnLogin(uid);
      set({ uid, items: merged });
      void persist(get);
    } catch (e) {
      throw new AppError('generic', `fallo fusión de carrito: ${String(e)}`);
    }
  },
}));
