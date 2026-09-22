/**
 * SPOT 24 · Pruebas de Firestore Rules con emulador (6.1).
 * Ejecutar:  npm run test:rules
 * Requiere firebase emulators (firebase-tools). Demostración de denegación:
 * · Cliente sin App Check / sin sesión NO puede escribir orders.
 * · El dueño puede leer su orden pero NO modificarla.
 * · carts solo el dueño. rates solo lectura. auditLog inaccesible.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, it } from 'vitest';
import {
  assertFails, assertSucceeds, initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

let testEnv: RulesTestEnvironment;

const rules = readFileSync('firestore.rules', 'utf8');

const ALICE = 'alice-uid';
const BOB = 'bob-uid';
const ADMIN = 'admin-uid';

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'spot24-rules-test',
    firestore: { rules },
  });

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection('products').doc('p1').set({
      name: 'Aceite', brand: 'X', slug: 'aceite-x', categoryId: 'lubricantes',
      basePriceUsd: 10, stockTotal: 5, active: true, createdAt: 1, updatedAt: 1,
      description: 'd', images: [], searchTerms: [], variantCount: 1,
    });
    await db.collection('orders').doc('o1').set({
      uid: ALICE, code: 'SP-000000-0001', status: 'pendiente', createdAt: 1, updatedAt: 1,
    });
    await db.collection('rates').doc('bcv').set({ usdToVes: 36.5, updatedAt: 1 });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

function dbFor(uid: string | null, claims: Record<string, unknown> = {}) {
  return uid
    ? testEnv.authenticatedContext(uid, claims).firestore()
    : testEnv.unauthenticatedContext().firestore();
}

describe('orders: solo Cloud Functions escribe', () => {
  it('cliente sin sesión NO puede crear órdenes', async () => {
    await assertFails(dbFor(null).collection('orders').add({ uid: ALICE, status: 'pendiente' }));
  });

  it('cliente autenticado NO puede crear órdenes directamente', async () => {
    await assertFails(dbFor(ALICE).collection('orders').doc('o2').set({ uid: ALICE, status: 'pagado' }));
  });

  it('cliente autenticado NO puede modificar órdenes (ni su dueño)', async () => {
    await assertFails(dbFor(ALICE).collection('orders').doc('o1').update({ status: 'entregado' }));
    await assertFails(dbFor(ADMIN, { role: 'admin' }).collection('orders').doc('o1').update({ status: 'pagado' }));
  });

  it('el dueño SÍ puede leer su orden; otro usuario no', async () => {
    await assertSucceeds(dbFor(ALICE).collection('orders').doc('o1').get());
    await assertFails(dbFor(BOB).collection('orders').doc('o1').get());
  });

  it('admin SÍ puede leer todas las órdenes', async () => {
    await assertSucceeds(dbFor(ADMIN, { role: 'admin' }).collection('orders').doc('o1').get());
  });

  it('nadie puede escribir en el timeline de eventos', async () => {
    await assertFails(dbFor(ALICE).collection('orders').doc('o1').collection('events').add({ status: 'x' }));
    await assertFails(dbFor(ADMIN, { role: 'admin' }).collection('orders').doc('o1').collection('events').add({ status: 'x' }));
  });
});

describe('products: público lee, admin escribe', () => {
  it('anónimo lee productos', async () => {
    await assertSucceeds(dbFor(null).collection('products').doc('p1').get());
  });

  it('anónimo NO crea productos', async () => {
    await assertFails(dbFor(null).collection('products').doc('p2').set({ name: 'x' }));
  });

  it('admin crea producto válido', async () => {
    await assertSucceeds(
      dbFor(ADMIN, { role: 'admin' }).collection('products').doc('p3').set({
        name: 'Filtro Y', brand: 'B', slug: 'filtro-y', categoryId: 'filtros',
        active: true, basePriceUsd: 5, stockTotal: 3, createdAt: 2, updatedAt: 2,
        description: 'd', images: [], searchTerms: [], variantCount: 1,
      }),
    );
  });

  it('admin NO crea producto inválido (precio negativo)', async () => {
    await assertFails(
      dbFor(ADMIN, { role: 'admin' }).collection('products').doc('p4').set({
        name: 'Z', brand: 'B', slug: 'z', categoryId: 'x', active: true, basePriceUsd: -5,
      }),
    );
  });
});

describe('carts: dueño únicamente y acotado', () => {
  it('el dueño escribe su carrito', async () => {
    await assertSucceeds(
      dbFor(ALICE).collection('carts').doc(ALICE).set({ items: [{ productId: 'p1', variantId: 'v', qty: 1 }] }),
    );
  });

  it('otro usuario NO escribe el carrito ajeno', async () => {
    await assertFails(dbFor(BOB).collection('carts').doc(ALICE).set({ items: [] }));
  });

  it('carrito con más de 50 líneas queda denegado', async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ productId: `p${i}`, variantId: 'v', qty: 1 }));
    await assertFails(dbFor(ALICE).collection('carts').doc(ALICE).set({ items }));
  });
});

describe('rates y colecciones internas: solo lectura o nada', () => {
  it('la tasa BCV es legible pero no escribible por clientes', async () => {
    await assertSucceeds(dbFor(null).collection('rates').doc('bcv').get());
    await assertFails(dbFor(ADMIN, { role: 'admin' }).collection('rates').doc('bcv').set({ usdToVes: 1 }));
  });

  it('auditLog y reservations inaccesibles para todo el cliente', async () => {
    await assertFails(dbFor(ADMIN, { role: 'admin' }).collection('auditLog').add({ action: 'x' }));
    await assertFails(dbFor(ADMIN, { role: 'admin' }).collection('reservations').doc('r1').get());
    await assertFails(dbFor(ALICE).collection('counters').doc('x').get());
  });
});
