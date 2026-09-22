/**
 * SPOT 24 · Clave de idempotencia (5.4/6.8).
 * Estable mientras no cambien (uid, carrito, datos de entrega, método):
 * reintentos del cliente no duplican órdenes. Cambia al pasar 30 min.
 */
import type { CheckoutItem } from '@/features/checkout/types';
import type { ContactData, AddressData } from '@/shared/types';

export interface IdempotencySeed {
  uid: string;
  items: CheckoutItem[];
  contact: ContactData;
  address: AddressData;
  paymentMethod: string;
  now: number;
}

const BUCKET_MS = 30 * 60 * 1000;

export function buildIdempotencyKey(seed: IdempotencySeed): string {
  const bucket = Math.floor(seed.now / BUCKET_MS);
  const raw = JSON.stringify([
    seed.uid,
    seed.items.map((i) => `${i.variantId}:${i.qty}`).sort(),
    seed.contact.name.toLowerCase(),
    seed.contact.phone,
    seed.address.zoneId,
    seed.address.details.trim().toLowerCase(),
    seed.paymentMethod,
    bucket,
  ]);
  return fnv1aHex(raw);
}

/** FNV-1a 32 bits ×2 (64 bits hex) — suficiente y sin dependencias. */
export function fnv1aHex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdeadbeef;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c + i;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}
