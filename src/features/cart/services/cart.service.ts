/**
 * Módulo carrito · Capa de servicios.
 * Invitado: localStorage. Usuario autenticado: Firestore (carts/{uid}).
 * Fusión automática al iniciar sesión (sección 5.2).
 *
 * Ronda 4 — SANITIZACIÓN antes de escribir en Firestore:
 * Las reglas de seguridad (firestore.rules, match /carts/{uid}) validan CADA
 * ítem con una lista blanca estricta: hasOnly de campos, tipos int para
 * qty/stockAtAdd, y rangos por campo (sku ≥3 si viene, image ≤600, etc.).
 * Los carritos heredados de esquemas anteriores (localStorage o docs remotos
 * viejos) llevan campos fuera de esa lista o valores vacíos → Firestore
 * rechaza la escritura con permission-denied y aparecen los avisos
 * «No se pudo escribir el carrito fusionado» / «Carrito remoto no
 * sincronizado». Ahora TODA escritura pasa por sanitizeForRemote(): solo
 * campos permitidos, tipos correctos y topes exactos; las líneas
 * irrecuperables (sin productId/variantId) se descartan. La lectura también
 * se normaliza, de modo que un doc viejo se repara en el primer guardado.
 * Además, los avisos de consola ahora incluyen el código de Firestore
 * (permission-denied vs unavailable) para diagnosticar en segundos.
 *
 * Ronda 5h — ESCRITURA SIN MERGE + PRECIOS DECIMALES:
 * · setDoc con merge:true arrastraba en request.resource.data los campos
 *   VIEJOS del doc: si un carrito heredado traía CUALQUIER clave fuera de la
 *   lista blanca de las reglas (updatedAtMs, total, lo que sea), el hasOnly
 *   fallaba y TODAS las escrituras quedaban denegadas para siempre. Sin
 *   merge, el doc se sobrescribe completo: el payload es EXACTAMENTE
 *   {items, updatedAt} y un carrito heredado se repara en el primer guardado.
 * · unitPriceUsd pasa de int() (Math.floor: 3.99 → 3) a num(): las reglas
 *   piden `is number`, no int, y al carrito rehidratado desde Firestore se
 *   le estaba mostrando el precio sin centavos.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';
import { mergeCarts, cartLineKey } from '../lib/cartLogic';
import { CART_STORAGE_KEY, type CartItem } from '../types';

/* ── Límites ESPEJO de firestore.rules (match /carts/{uid}) ──────────────
 * Si mañana cambian las reglas, cambia SOLO este bloque. */
const MAX_ITEMS = 50;
const LIM = {
  productId: 120,
  variantId: 140,
  slug: 160,
  name: 160,
  /** Ronda 5e: marca SOLO presentación (localStorage). Las reglas de carts/{uid}
   *  NO la incluyen en su lista blanca (hasOnly): enviarla a Firestore
   *  provocaría permission-denied. sanitizeForRemote() la omite siempre. */
  brand: 60,
  variantName: 100,
  sku: 60,      // reglas: opcional; si viene, tamaño 3–60
  image: 600,
  categoryId: 80,
  qty: { min: 1, max: 20 },
  unitPriceUsd: { min: 0, max: 10_000 },
  stockAtAdd: { min: 0, max: 100_000 },
} as const;

function readGuest(): CartItem[] {
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { items?: CartItem[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

function writeGuest(items: CartItem[]): void {
  try {
    localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ items: items.slice(0, MAX_ITEMS), updatedAt: Date.now() }),
    );
  } catch (e) {
    logger.warn('No se pudo persistir el carrito local', e);
  }
}

/* ── Normalización de líneas ────────────────────────────────────────────
 * str(): recorta a su tope y devuelve '' si no es string → las claves
 * opcionales vacías se OMITEN al escribir (las reglas lo permiten).
 * int(): entero acotado con respaldo; evita doubles (las reglas piden int). */

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function int(v: unknown, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** num(): clamp SIN redondear. Para campos que las reglas validan como
 *  `is number` (unitPriceUsd): 3.99 debe seguir siendo 3.99, no 3. */
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Convierte una línea cruda (posiblemente heredada de un esquema viejo) en un
 * CartItem COMPLETO y válido para la UI. Devuelve null si la línea es
 * irrecuperable (sin productId o sin variantId).
 */
function toCartItem(raw: unknown): CartItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const productId = str(r['productId'], LIM.productId);
  const variantId = str(r['variantId'], LIM.variantId);
  if (!productId || !variantId) return null;
  return {
    productId,
    variantId,
    slug: str(r['slug'], LIM.slug),
    name: str(r['name'], LIM.name),
    ...(str(r['brand'], LIM.brand) ? { brand: str(r['brand'], LIM.brand) } : {}),
    variantName: str(r['variantName'], LIM.variantName),
    sku: str(r['sku'], LIM.sku),
    // Ronda 5h: num() conserva los centavos (las reglas piden number, no int).
    unitPriceUsd: num(r['unitPriceUsd'], LIM.unitPriceUsd.min, LIM.unitPriceUsd.max, 0),
    qty: int(r['qty'], LIM.qty.min, LIM.qty.max, 1),
    image: str(r['image'], LIM.image),
    categoryId: str(r['categoryId'], LIM.categoryId),
    // Respaldo 20: las líneas viejas sin stockAtAdd no deben bloquear la
    // recompra; el stock REAL lo exige el backend con reservas al pagar.
    stockAtAdd: int(r['stockAtAdd'], LIM.stockAtAdd.min, LIM.stockAtAdd.max, 20),
  };
}

/**
 * Deja la lista EXACTAMENTE como la aceptan las reglas de /carts/{uid}:
 * · Solo los campos de la lista blanca (hasOnly) y siempre los obligatorios
 *   (hasAll: productId, variantId, qty).
 * · Claves opcionales presentes SOLO cuando tienen valor válido (sku exige
 *   ≥3 caracteres: si queda corto, se omite la clave en lugar de romper).
 *   Ronda 5e: `brand` se omite SIEMPRE (solo vive en localStorage).
 * · Sin duplicados por productId+variantId (variantes «v1» se repiten entre
 *   productos) y tope de 50 líneas.
 */
function sanitizeForRemote(items: CartItem[]): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const raw of items.slice(0, MAX_ITEMS)) {
    const it = toCartItem(raw);
    if (!it || seen.has(cartLineKey(it.productId, it.variantId))) continue;
    seen.add(cartLineKey(it.productId, it.variantId));
    const clean: Record<string, unknown> = {
      productId: it.productId,
      variantId: it.variantId,
      qty: it.qty,
    };
    if (it.slug) clean['slug'] = it.slug;
    if (it.name) clean['name'] = it.name;
    if (it.variantName) clean['variantName'] = it.variantName;
    if (it.sku.length >= 3) clean['sku'] = it.sku;
    if (it.image) clean['image'] = it.image;
    if (it.categoryId) clean['categoryId'] = it.categoryId;
    clean['unitPriceUsd'] = it.unitPriceUsd;
    clean['stockAtAdd'] = it.stockAtAdd;
    out.push(clean);
  }
  return out;
}

/** Código de Firestore del error, para los avisos de consola. */
function codeOf(e: unknown): string {
  return (e as { code?: string })?.code ?? '';
}

/* ───────────────────────────── API pública ───────────────────────────── */

/** Carrito del usuario en Firestore: carts/{uid} → { items, updatedAt }. */
async function readRemote(uid: string): Promise<CartItem[]> {
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDoc(doc(fb.db, 'carts', uid));
  if (!snap.exists()) return [];
  const items = snap.data()['items'];
  if (!Array.isArray(items)) return [];
  // Normaliza aquí: un doc heredado se repara en memoria y en el próximo
  // guardado queda reescrito limpio en Firestore.
  return items
    .slice(0, MAX_ITEMS)
    .map(toCartItem)
    .filter((it): it is CartItem => it !== null);
}

async function writeRemote(uid: string, items: CartItem[]): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) return;
  // Ronda 5h: SIN merge. Con merge:true, request.resource.data (lo que las
  // reglas validan) = doc viejo + cambios; cualquier campo heredado fuera de
  // la lista blanca revienta el hasOnly y deniega TODAS las escrituras de
  // este carrito para siempre. Sobrescribir completo repara el doc viejo en
  // el primer guardado y el payload queda exactamente {items, updatedAt}.
  await setDoc(
    doc(fb.db, 'carts', uid),
    { items: sanitizeForRemote(items), updatedAt: serverTimestamp() },
  );
}

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
      const code = codeOf(e);
      logger.warn('Carrito remoto no sincronizado', { code: code || '(sin code)' });
      if (code.includes('permission-denied')) {
        logger.warn(
          'Firestore rechazó carts/{uid}: publica las reglas del repo en tu proyecto '
          + '(Firebase Console → Firestore Database → Rules → Publicar, o bien '
          + 'firebase deploy --only firestore:rules) y recarga. El payload ya sale limpio.',
        );
      } else if (code.includes('unavailable') || code.includes('failed-precondition')) {
        logger.warn('Firestore inalcanzable (¿sin conexión?): el carrito local está a salvo.');
      }
    }
  }
}

/**
 * Fusión automática al iniciar sesión:
 * carrito invitado (localStorage) ⊕ carrito remoto (Firestore) → ambos.
 */
export async function mergeOnLogin(uid: string): Promise<CartItem[]> {
  const guest = readGuest();
  let remote: CartItem[] = [];
  try {
    remote = await readRemote(uid);
  } catch (e) {
    const code = codeOf(e);
    logger.warn('No se pudo leer el carrito remoto en el login', { code: code || '(sin code)' });
  }
  const merged = mergeCarts(guest, remote);
  writeGuest(merged);
  try {
    await writeRemote(uid, merged);
  } catch (e) {
    const code = codeOf(e);
    logger.warn('No se pudo escribir el carrito fusionado', { code: code || '(sin code)' });
    if (code.includes('permission-denied')) {
      logger.warn(
        'Firestore rechazó la fusión en carts/{uid}. Despliega las reglas del repo: '
        + 'firebase deploy --only firestore:rules',
      );
    }
  }
  return merged;
}