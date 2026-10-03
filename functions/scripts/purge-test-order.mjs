#!/usr/bin/env node
/**
 * SPOT 24 · Purga de ÓRDENES DE PRUEBA — herramienta local del dueño.
 *
 * Borra una orden de prueba y TODOS sus rastros en Firestore:
 *   · orders/{id} + subcolección events/*
 *   · idempotency (docs con campo orderId == id)  → permite reusar la clave
 *   · reservations vinculadas (campo orderId == id y la reservationId de la orden)
 *   · fraudReview (docs con campo orderId == id)
 *   · auditLog (docs con campo targetId == id)
 *   · Repone stock de las variantes afectadas (ver reglas abajo)
 *   · Opcional: --reset-counter (counters/orders_seq → 0) y --ratelimit
 *     (borra counters/ratelimit_*)
 *
 * REGLAS DE REPOSICIÓN DE STOCK (verificadas contra orders.ts/payments.ts):
 *   · Flujo FALLBACK (orden sin reservationId): createOrder descontó `stock`
 *     → se repone stock += qty SOLO si la orden NO está 'cancelado'
 *     (al cancelar/rechazar el backend ya repuso; duplicar inflaría stock).
 *   · Flujo RESERVA (orden con reservationId): el stock real NUNCA se descontó
 *     (solo quedó la retención en `stockReserved`) → se baja stockReserved -= qty.
 *     Si la orden estaba 'cancelado' se advierte: el rechazo del backend pudo
 *     haber sumado stock de más (revisar la variante en el panel).
 *
 * SIMULACIÓN POR DEFECTO: sin --yes solo MUESTRA el plan (valores «actual → nuevo»).
 *
 * USOS (PowerShell, en una terminal PROPIA — NO en la de netlify dev):
 *   node functions\scripts\purge-test-order.mjs                  → lista órdenes + ayuda
 *   node functions\scripts\purge-test-order.mjs --last           → simula purga de la más reciente
 *   node functions\scripts\purge-test-order.mjs --code SP-260929-0001
 *   node functions\scripts\purge-test-order.mjs --id <orderId>
 *   node functions\scripts\purge-test-order.mjs --last --yes     → EJECUTA de verdad
 *
 * OPCIONES:
 *   --yes            Ejecuta de verdad (sin esto todo es simulación)
 *   --keep-stock     No tocar stock/stockReserved de las variantes
 *   --reset-counter  Deja counters/orders_seq en 0 (el próximo código será …-0001)
 *   --ratelimit      Borra los docs temporales counters/ratelimit_*
 *
 * CREDENCIALES: usa FIREBASE_SERVICE_ACCOUNT del .env de la RAÍZ del proyecto
 * (el mismo que usa netlify dev; acepta JSON directo, base64 o JSON multilínea)
 * o GOOGLE_APPLICATION_CREDENTIALS (ruta a un JSON de cuenta de servicio).
 * Depende de firebase-admin ya instalado en functions/node_modules.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url)); // functions/scripts
const FUNCTIONS_DIR = path.resolve(SCRIPT_DIR, '..');            // functions
const PROJECT_ROOT = path.resolve(FUNCTIONS_DIR, '..');          // raíz del repo

/* ───────────────────────── utilidades de salida ───────────────────────── */

const line = (s = '') => console.log(s);
const hr = () => line('─'.repeat(72));
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

const fmtDate = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const STATUS_ES = {
  pendiente: 'pendiente',
  en_verificacion: 'en verificación',
  pagado: 'pagado',
  preparado: 'preparado',
  en_camino: 'en camino',
  entregado: 'entregado',
  cancelado: 'cancelado',
};

/* ───────────────────────── argumentos CLI ───────────────────────── */

const argv = process.argv.slice(2);
const opts = {
  last: false, code: null, id: null,
  yes: false, keepStock: false, resetCounter: false, ratelimit: false,
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--last') opts.last = true;
  else if (a === '--code') opts.code = String(argv[++i] ?? '').trim();
  else if (a === '--id') opts.id = String(argv[++i] ?? '').trim();
  else if (a === '--yes') opts.yes = true;
  else if (a === '--keep-stock') opts.keepStock = true;
  else if (a === '--reset-counter') opts.resetCounter = true;
  else if (a === '--ratelimit') opts.ratelimit = true;
  else if (a === '-h' || a === '--help') opts.help = true;
  else fail(`Argumento no reconocido: ${a} (usa --help)`);
}

const USAGE = `
USOS:
  node functions\\scripts\\purge-test-order.mjs                  lista órdenes + ayuda
  node functions\\scripts\\purge-test-order.mjs --last           simula la purga de la más reciente
  node functions\\scripts\\purge-test-order.mjs --code SP-260929-0001
  node functions\\scripts\\purge-test-order.mjs --id <orderId>
  node functions\\scripts\\purge-test-order.mjs --last --yes     EJECUTA de verdad

OPCIONES:
  --yes            ejecuta de verdad (sin esto todo es simulación)
  --keep-stock     no tocar stock/stockReserved
  --reset-counter  counters/orders_seq → 0
  --ratelimit      borrar counters/ratelimit_*
`.trimEnd();

if (opts.help) {
  line('SPOT 24 · Purga de órdenes de prueba');
  hr();
  line(USAGE);
  process.exit(0);
}

if (!opts.last && !opts.code && !opts.id) opts.list = true;

/* ───────────────────────── parser .env (JSON/base64/multilínea) ───────────────────────── */

function parseEnvFile(p) {
  if (!existsSync(p)) return {};
  const raw = readFileSync(p, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || l.startsWith('#')) continue;
    const eq = l.indexOf('=');
    if (eq <= 0) continue;
    const key = l.slice(0, eq).trim();
    let val = l.slice(eq + 1).trim();
    // JSON multilínea: si abre con { y no cierra en la misma línea, seguir leyendo.
    if (val.startsWith('{')) {
      let acc = val;
      const balance = (s) => (s.match(/{/g) ?? []).length - (s.match(/}/g) ?? []).length;
      while (balance(acc) > 0 && i + 1 < lines.length) {
        i += 1;
        acc += '\n' + lines[i];
      }
      val = acc;
    }
    // Comillas envolventes.
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function parseServiceAccount(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return null;
  // 1) JSON directo.
  try { return JSON.parse(t); } catch { /* sigue */ }
  // 2) Base64 → JSON.
  if (/^[A-Za-z0-9+/=\r\n_-]+$/.test(t) && !t.startsWith('{')) {
    try { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); } catch { /* sigue */ }
  }
  return null;
}

function loadServiceAccount() {
  // 1) Variables ya presentes en el entorno (shell/export).
  const fromEnv = parseServiceAccount(process.env['FIREBASE_SERVICE_ACCOUNT'] ?? '');
  if (fromEnv?.project_id) return { sa: fromEnv, via: 'variable de entorno FIREBASE_SERVICE_ACCOUNT' };

  // 2) .env de la RAÍZ (el mismo que lee netlify dev).
  const envVars = { ...parseEnvFile(path.join(PROJECT_ROOT, '.env')) };
  const fromDotenv = parseServiceAccount(envVars['FIREBASE_SERVICE_ACCOUNT'] ?? '');
  if (fromDotenv?.project_id) return { sa: fromDotenv, via: '.env raíz (FIREBASE_SERVICE_ACCOUNT)' };

  // 3) GOOGLE_APPLICATION_CREDENTIALS (ruta a JSON) en env o .env.
  const gacPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'] || envVars['GOOGLE_APPLICATION_CREDENTIALS'] || '';
  if (gacPath && existsSync(gacPath)) {
    try {
      const sa = JSON.parse(readFileSync(gacPath, 'utf8'));
      if (sa?.project_id) return { sa, via: `GOOGLE_APPLICATION_CREDENTIALS (${gacPath})` };
    } catch { /* sigue */ }
  }
  return null;
}

/* ───────────────────────── inicialización admin ───────────────────────── */

async function main() {
  line('SPOT 24 · Purga de órdenes de prueba');
  line(`Raíz del proyecto: ${PROJECT_ROOT}`);

  const cred = loadServiceAccount();
  if (!cred) {
    fail(`No encontré credenciales de servicio.
   Esperaba FIREBASE_SERVICE_ACCOUNT en ${path.join(PROJECT_ROOT, '.env')}
   (JSON directo, base64 o multilínea) o GOOGLE_APPLICATION_CREDENTIALS.`);
  }
  line(`Credenciales: ${cred.via} · proyecto: ${cred.sa.project_id}`);

  let admin;
  try {
    const require = createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
    admin = require('firebase-admin');
  } catch {
    fail(`No pude cargar firebase-admin desde functions/node_modules.
   Instálalo una vez:  npm --prefix functions install`);
  }
  const MODE = opts.yes ? 'EJECUTAR DE VERDAD' : 'SIMULACIÓN (dry-run)';
  line(`Modo: ${MODE}`);
  hr();

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred.sa) });
  }
  const db = admin.firestore();

  /* ── Selección de la orden ── */

  if (opts.list) {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(10).get();
    line(`Órdenes más recientes (${snap.size}):`);
    line('');
    if (snap.empty) line('  (no hay órdenes)');
    for (const d of snap.docs) {
      const o = d.data();
      line(
        `  ${String(o['code'] ?? '(sin código)').padEnd(18)} ${String(STATUS_ES[o['status']] ?? o['status'] ?? '?').padEnd(16)} ` +
        `${fmtDate(o['createdAt'])}  total USD: ${Number(o['totals']?.['totalUsd'] ?? 0).toFixed(2)}  id: ${d.id}`,
      );
    }
    line('');
    hr();
    line(USAGE);
    return;
  }

  let orderSnap;
  if (opts.last) {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) fail('No hay ninguna orden en Firestore.');
    orderSnap = snap.docs[0];
  } else if (opts.code) {
    const snap = await db.collection('orders').where('code', '==', opts.code).limit(2).get();
    if (snap.empty) fail(`No encontré ninguna orden con código ${opts.code}.`);
    if (snap.size > 1) fail(`El código ${opts.code} devolvió ${snap.size} órdenes; usa --id <orderId> para elegir.`);
    orderSnap = snap.docs[0];
  } else {
    const snap = await db.collection('orders').doc(opts.id).get();
    if (!snap.exists) fail(`No existe la orden ${opts.id}.`);
    orderSnap = snap;
  }

  const orderId = orderSnap.id;
  const order = orderSnap.data() ?? {};

  /* ── Documentos vinculados ── */

  const eventsSnap = await db.collection('orders').doc(orderId).collection('events').get();
  const idemSnap = await db.collection('idempotency').where('orderId', '==', orderId).get();
  const resSnap = await db.collection('reservations').where('orderId', '==', orderId).get();
  const linked = new Map(resSnap.docs.map((d) => [d.id, d]));
  if (order['reservationId']) {
    const direct = await db.collection('reservations').doc(String(order['reservationId'])).get();
    if (direct.exists) linked.set(direct.id, direct);
  }
  const fraudSnap = await db.collection('fraudReview').where('orderId', '==', orderId).get();
  const auditSnap = await db.collection('auditLog').where('targetId', '==', orderId).get();

  /* ── Plan de stock ── */

  const isReservationFlow = Boolean(order['reservationId']) || linked.size > 0;
  const cancelled = String(order['status']) === 'cancelado';
  const linesSrc = Array.isArray(order['lines']) && order['lines'].length > 0
    ? order['lines']
    : [...linked.values()].flatMap((d) => (Array.isArray(d.data()?.['items']) ? d.data()['items'] : []));

  const stockPlan = [];
  if (!opts.keepStock) {
    const seen = new Set();
    for (const l of linesSrc) {
      const pid = String(l?.['productId'] ?? '');
      const vid = String(l?.['variantId'] ?? '');
      const qty = Math.floor(Number(l?.['qty'] ?? 0));
      if (!pid || !vid || !(qty > 0)) continue;
      const key = `${pid}/${vid}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const vref = db.doc(`products/${pid}/variants/${vid}`);
      const vsnap = await vref.get();
      const stock = Number(vsnap.data()?.['stock'] ?? 0);
      const reserved = Number(vsnap.data()?.['stockReserved'] ?? 0);

      let newStock = stock;
      let newReserved = reserved;
      let note = '';
      if (isReservationFlow) {
        // El stock real nunca se descontó en este flujo: solo la retención.
        newReserved = Math.max(0, reserved - qty);
        if (cancelled) {
          note = 'orden cancelada: el rechazo del backend pudo haber sumado stock de más (revisar en el panel)';
        }
      } else {
        // Fallback: createOrder descontó stock; cancelar/rechazar ya repuso.
        newStock = cancelled ? stock : stock + qty;
        note = cancelled ? 'ya repuesta por el backend al cancelar' : 'se repone';
      }
      stockPlan.push({ ref: vref, path: `products/${key}`, name: String(l?.['name'] ?? ''), stock, reserved, newStock, newReserved, note });
    }
  }

  /* ── Mostrar el plan ── */

  line('ORDEN SELECCIONADA');
  line(`  código:   ${String(order['code'] ?? '(sin código)')}`);
  line(`  id:       ${orderId}`);
  line(`  estado:   ${String(STATUS_ES[order['status']] ?? order['status'] ?? '?')}`);
  line(`  creada:   ${fmtDate(order['createdAt'])}`);
  line(`  uid:      ${String(order['uid'] ?? '?')}`);
  line(`  flujo:    ${isReservationFlow ? 'con reserva' : 'fallback (sin reserva)'}`);
  line('');
  line('SE BORRARÁ');
  line(`  orders/${orderId} + events/* (${eventsSnap.size} eventos)`);
  line(`  idempotency: ${idemSnap.size} doc(s)`);
  line(`  reservations: ${linked.size} doc(s)`);
  line(`  fraudReview: ${fraudSnap.size} doc(s)`);
  line(`  auditLog: ${auditSnap.size} doc(s)`);
  line('');
  if (opts.keepStock) {
    line('STOCK: --keep-stock → no se tocará ninguna variante.');
  } else if (stockPlan.length === 0) {
    line('STOCK: la orden no tiene líneas con producto/variante → nada que reponer.');
  } else {
    line(`STOCK (${isReservationFlow ? 'flujo reserva: baja stockReserved' : 'flujo fallback: repone stock'})${cancelled ? ' · orden cancelada → sin cambios de stock' : ''}`);
    for (const p of stockPlan) {
      const label = p.name ? `${p.path} (${p.name})` : p.path;
      const change = isReservationFlow
        ? `stockReserved ${p.reserved} → ${p.newReserved}`
        : `stock ${p.stock} → ${p.newStock}`;
      line(`  ${label}`);
      line(`    ${change}${p.note ? `  · ${p.note}` : ''}`);
    }
  }
  if (opts.resetCounter) line('\nEXTRA: counters/orders_seq.count → 0');
  if (opts.ratelimit) {
    const countersSnap = await db.collection('counters').get();
    const rl = countersSnap.docs.filter((d) => d.id.startsWith('ratelimit_'));
    line(`\nEXTRA: borrar ${rl.length} doc(s) counters/ratelimit_*`);
  }

  hr();

  if (!opts.yes) {
    line('SIMULACIÓN terminada — NO se borró nada.');
    line('Si el plan es correcto, ejecuta de verdad añadiendo --yes al mismo comando.');
    return;
  }

  /* ── Ejecutar ── */

  let batch = db.batch();
  let ops = 0;
  const commits = [];
  const push = (fn) => {
    fn(batch);
    ops += 1;
    if (ops >= 450) {
      commits.push(batch.commit());
      batch = db.batch();
      ops = 0;
    }
  };

  for (const d of eventsSnap.docs) push((b) => b.delete(d.ref));
  for (const d of idemSnap.docs) push((b) => b.delete(d.ref));
  for (const d of linked.values()) push((b) => b.delete(d.ref));
  for (const d of fraudSnap.docs) push((b) => b.delete(d.ref));
  for (const d of auditSnap.docs) push((b) => b.delete(d.ref));
  push((b) => b.delete(db.collection('orders').doc(orderId)));

  for (const p of stockPlan) {
    const data = isReservationFlow
      ? { stockReserved: p.newReserved }
      : { stock: p.newStock };
    push((b) => b.update(p.ref, data));
  }

  if (opts.resetCounter) {
    push((b) => b.set(db.collection('counters').doc('orders_seq'), { count: 0 }, { merge: true }));
  }

  if (opts.ratelimit) {
    const countersSnap = await db.collection('counters').get();
    for (const d of countersSnap.docs) {
      if (d.id.startsWith('ratelimit_')) push((b) => b.delete(d.ref));
    }
  }

  if (ops > 0) commits.push(batch.commit());
  await Promise.all(commits);

  line('✔ PURGA COMPLETADA');
  line(`  orders/${orderId} y sus rastros fueron eliminados.`);
  if (stockPlan.length > 0 && !opts.keepStock) {
    line('  Stock de variantes actualizado según el plan mostrado.');
  }
  line('  La próxima compra de prueba puede repetir el flujo completo.');
}

main().catch((e) => fail(e?.message ?? String(e)));