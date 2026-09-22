/**
 * Módulo carrito · Capa de servicios.
 * Invitado: localStorage. Usuario autenticado: Firestore (carts/{uid}).
 * Fusión automática al iniciar sesión (sección 5.2).
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { logger } from '@/shared/lib/logger';
import { mergeCarts } from '../lib/cartLogic';
import { CART_STORAGE_KEY, type CartItem } from '../types';

function readGuest(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: CartItem[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 50) : [];
  } catch {
    return [];
  }
}

function writeGuest(items: CartItem[]): void {
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ items: items.slice(0, 50), updatedAt: Date.now() }),
    );
  } catch (e) {
    logger.warn('No se pudo persistir el carrito local', e);
  }
}

/** Carrito del usuario en Firestore: carts/{uid} → { items, updatedAt }. */
async function readRemote(uid: string): Promise<CartItem[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDoc(doc(fb.db, 'carts', uid));
  if (!snap.exists()) return [];
  const items = snap.data()['items'];
  return Array.isArray(items) ? (items as CartItem[]).slice(0, 50) : [];
}

async function writeRemote(uid: string, items: CartItem[]): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) return;
  await setDoc(
    doc(fb.db, 'carts', uid),
    { items: items.slice(0, 50), updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* ───────────────────────────── API pública ───────────────────────────── */

export async function loadCart(uid: string | null): Promise<CartItem[]> {
  if (!uid) return readGuest();
  const [remote] = await Promise.all([readRemote(uid)]);
  return remote;
}

export async function saveCart(uid: string | null, items: CartItem[]): Promise<void> {
  writeGuest(items);
  if (uid) {
    try {
      await writeRemote(uid, items);
    } catch (e) {
      // Offline-first: el carrito local queda guardado, el push remoto reintenta al sincronizar.
      logger.warn('Carrito remoto no sincronizado (¿sin conexión?)', e);
    }
  }
}

/**
 * Fusión automática al iniciar sesión:
 * carrito invitado (localStorage) ⊕ carrito remoto (Firestore) → ambos.
 */
export async function mergeOnLogin(uid: string): Promise<CartItem[]> {
  const guest = readGuest();
  if (DEMO_MODE) return guest;
  let remote: CartItem[] = [];
  try {
    remote = await readRemote(uid);
  } catch (e) {
    logger.warn('No se pudo leer el carrito remoto en el login', e);
  }
  const merged = mergeCarts(guest, remote);
  writeGuest(merged);
  try {
    await writeRemote(uid, merged);
  } catch (e) {
    logger.warn('No se pudo escribir el carrito fusionado', e);
  }
  return merged;
}
