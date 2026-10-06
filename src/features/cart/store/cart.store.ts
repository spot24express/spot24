/**
 * Módulo carrito · Store zustand con persistencia.
 * El store orquesta: validación de stock al agregar, persistencia dual
 * (localStorage siempre; Firestore si hay sesión) y fusión al login.
 *
 * Ronda 5e — CORRECCIÓN CRÍTICA de identidad de líneas:
 * Cada línea se identifica por productId + variantId (cartLineKey), NUNCA por
 * variantId solo. Las variantes creadas desde /admin se llaman «v1», «v2»…
 * en TODOS los productos: agrupar por variantId hacía que agregar un segundo
 * producto incrementara la cantidad del primero en lugar de crear su línea
 * («no me salen todos los productos en el carrito»). También suma una acción
 * repairSnapshots() para actualizar marca/nombre de líneas viejas con los
 * datos vigentes del producto (auto-reparación al abrir el carrito).
 */
import { create } from 'zustand';
import { toast } from '@/shared/lib/toast';
import { loadCart, saveCart, mergeOnLogin } from '../services/cart.service';
import { validateAdd, clampSetQty, cartLineKey } from '../lib/cartLogic';
import type { CartItem } from '../types';
import { AppError } from '@/shared/lib/errors';
import { trackEvent } from '@/shared/lib/analytics';

/** Corrección de datos de una línea existente (auto-reparación de snapshots). */
export interface SnapshotFix {
  productId: string;
  variantId: string;
  name: string;
  brand: string;
}

interface CartState {
  items: CartItem[];
  uid: string | null;
  hydrated: boolean;
  /** Agrega o incrementa una línea; valida stock y topes. */
  addItem: (item: Omit<CartItem, 'qty'>, qty: number) => boolean;
  setQty: (productId: string, variantId: string, qty: number) => void;
  removeItem: (productId: string, variantId: string) => void;
  clear: () => void;
  /** Actualiza marca/nombre de líneas viejas con datos vigentes del producto. */
  repairSnapshots: (fixes: SnapshotFix[]) => void;
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
    const key = cartLineKey(item.productId, item.variantId);
    const current = items.find((i) => cartLineKey(i.productId, i.variantId) === key);
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
          cartLineKey(i.productId, i.variantId) === key
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

  setQty: (productId, variantId, qty) => {
    const key = cartLineKey(productId, variantId);
    const next = get().items
      .map((i) => (cartLineKey(i.productId, i.variantId) === key ? { ...i, qty: clampSetQty(qty, i.stockAtAdd) } : i))
      .filter((i) => i.qty > 0);
    set({ items: next });
    void persist(get);
  },

  removeItem: (productId, variantId) => {
    const key = cartLineKey(productId, variantId);
    set({ items: get().items.filter((i) => cartLineKey(i.productId, i.variantId) !== key) });
    void persist(get);
  },

  clear: () => {
    set({ items: [] });
    void persist(get);
  },

  repairSnapshots: (fixes) => {
    if (fixes.length === 0) return;
    const byKey = new Map(fixes.map((f) => [cartLineKey(f.productId, f.variantId), f]));
    const next = get().items.map((i) => {
      const fix = byKey.get(cartLineKey(i.productId, i.variantId));
      // Precio y qty NO se tocan: el precio queda congelado al agregar y el
      // total oficial lo calcula el backend al cotizar.
      return fix
        ? { ...i, name: fix.name || i.name, brand: fix.brand || i.brand }
        : i;
    });
    set({ items: next });
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