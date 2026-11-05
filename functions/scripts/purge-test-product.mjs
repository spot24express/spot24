#!/usr/bin/env node
/**
 * SPOT 24 · Purga de PRODUCTO DE PRUEBA — herramienta local del dueño.
 *
 * Borra un producto y TODOS sus rastros en Firestore:
 *   · products/{id} (la ficha)
 *   · products/{id}/variants/* (TODAS las variantes — Firestore NO borra
 *     subcolecciones en cascada; es la misma limpieza que hace el panel
 *     con adminDeleteProduct, pero con credenciales de servicio, sin
 *     depender de la sesión del navegador ni de las reglas de Firestore)
 *
 * NADA MÁS se toca: stock, contadores de categorías (se calculan con
 * query, no hay campo que reponer) y colecciones de pedidos quedan iguales.
 *
 * SIMULACIÓN POR DEFECTO: sin --yes solo MUESTRA el plan y no borra nada.
 *
 * USOS (PowerShell, en una terminal PROPIA — NO en la de netlify dev):
 *   node functions\scripts\purge-test-product.mjs                  lista productos + ayuda
 *   node functions\scripts\purge-test-product.mjs --last           simula purga del más reciente
 *   node functions\scripts\purge-test-product.mjs --name prueba    busca por nombre (fragmento)
 *   node functions\scripts\purge-test-product.mjs --code <CODIGO>
 *   node functions\scripts\purge-test-product.mjs --id <productId>
 *   node functions\scripts\purge-test-product.mjs --id <productId> --yes   EJECUTA de verdad
 *
 * OPCIONES:
 *   --yes            Ejecuta de verdad (sin esto todo es simulación)
 *   --force          Permite borrar un producto con vendidosTotal > 0 (ventas reales)
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

const fmtUsd = (n) => `$${Number(n ?? 0).toFixed(2)}`;

/* ───────────────────────── argumentos CLI ───────────────────────── */

const argv = process.argv.slice(2);
const opts = {
  last: false, id: null, code: null, name: null,
  yes: false, force: false,
};

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--last') opts.last = true;
  else if (a === '--id') opts.id = String(argv[++i] ?? '').trim();
  else if (a === '--code') opts.code = String(argv[++i] ?? '').trim();
  else if (a === '--name') opts.name = String(argv[++i] ?? '').trim();
  else if (a === '--yes') opts.yes = true;
  else if (a === '--force') opts.force = true;
  else if (a === '-h' || a === '--help') opts.help = true;
  else fail(`Argumento no reconocido: ${a} (usa --help)`);
}

const USAGE = `
USOS:
  node functions\\scripts\\purge-test-product.mjs                  lista productos + ayuda
  node functions\\scripts\\purge-test-product.mjs --last           simula purga del más reciente
  node functions\\scripts\\purge-test-product.mjs --name prueba    busca por fragmento de nombre
  node functions\\scripts\\purge-test-product.mjs --code <CODIGO>
  node functions\\scripts\\purge-test-product.mjs --id <productId>
  node functions\\scripts\\purge-test-product.mjs --id <productId> --yes     EJECUTA de verdad

OPCIONES:
  --yes      ejecuta de verdad (sin esto todo es simulación)
  --force    permite borrar un producto con vendidosTotal > 0
`.trimEnd();

if (opts.help) {
  line('SPOT 24 · Purga de producto de prueba');
  hr();
  line(USAGE);
  process.exit(0);
}

if (!opts.last && !opts.id && !opts.code && !opts.name) opts.list = true;

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

/* ───────────────────────── principal ───────────────────────── */

async function main() {
  line('SPOT 24 · Purga de producto de prueba');
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

  /* ── Selección del producto ── */

  if (opts.list) {
    const snap = await db.collection('products').orderBy('createdAt', 'desc').limit(30).get();
    line(`Productos más recientes (${snap.size}):`);
    line('');
    if (snap.empty) line('  (no hay productos)');
    for (const d of snap.docs) {
      const p = d.data();
      line(
        `  ${String(p['name'] ?? '(sin nombre)').padEnd(34)} ${String(p['code'] ?? '(sin código)').padEnd(14)} ` +
        `${p['active'] ? 'activo   ' : 'INACTIVO '} ${fmtUsd(p['basePriceUsd'])}  vendidos: ${Number(p['vendidosTotal'] ?? 0)}  id: ${d.id}`,
      );
    }
    line('');
    hr();
    line(USAGE);
    return;
  }

  let productSnap;
  if (opts.last) {
    const snap = await db.collection('products').orderBy('createdAt', 'desc').limit(1).get();
    if (snap.empty) fail('No hay ningún producto en Firestore.');
    productSnap = snap.docs[0];
  } else if (opts.id) {
    const snap = await db.collection('products').doc(opts.id).get();
    if (!snap.exists) fail(`No existe el producto ${opts.id}.`);
    productSnap = snap;
  } else if (opts.code) {
    const snap = await db.collection('products').where('code', '==', opts.code.toUpperCase()).limit(2).get();
    if (snap.empty) fail(`No encontré ningún producto con código ${opts.code}.`);
    if (snap.size > 1) fail(`El código ${opts.code} devolvió ${snap.size} productos; usa --id <productId> para elegir.`);
    productSnap = snap.docs[0];
  } else {
    // --name <fragmento>: búsqueda insensible a mayúsculas sobre el nombre.
    const aguja = opts.name.toLowerCase();
    const snap = await db.collection('products').limit(1000).get();
    const hits = snap.docs.filter((d) => String(d.data()?.['name'] ?? '').toLowerCase().includes(aguja));
    if (hits.length === 0) fail(`Ningún producto contiene «${opts.name}» en el nombre.`);
    if (hits.length > 1) {
      line(`«${opts.name}» coincidió con ${hits.length} productos; elige el id exacto:`);
      for (const d of hits) {
        line(`  ${String(d.data()['name']).padEnd(34)} id: ${d.id}`);
      }
      process.exit(1);
    }
    productSnap = hits[0];
  }

  const productId = productSnap.id;
  const product = productSnap.data() ?? {};

  /* ── Variantes (subcolección) ── */

  const varsSnap = await db.collection('products').doc(productId).collection('variants').get();

  /* ── Guardia: producto con ventas reales ── */

  const vendidos = Number(product['vendidosTotal'] ?? 0);
  if (vendidos > 0 && !opts.force) {
    fail(`Este producto tiene vendidosTotal = ${vendidos} (ventas registradas).
   Si de verdad quieres borrarlo, repite el comando con --force.`);
  }

  /* ── Mostrar el plan ── */

  line('PRODUCTO SELECCIONADO');
  line(`  nombre:     ${String(product['name'] ?? '(sin nombre)')}`);
  line(`  código:     ${String(product['code'] ?? '(sin código)')}`);
  line(`  id:         ${productId}`);
  line(`  categoría:  ${String(product['categoryId'] ?? '?')}`);
  line(`  precio:     ${fmtUsd(product['basePriceUsd'])}  · activo: ${product['active'] ? 'sí' : 'no'}`);
  line(`  vendidos:   ${vendidos}  · creado: ${fmtDate(product['createdAt'])}`);
  line('');
  line('SE BORRARÁ');
  line(`  products/${productId} (la ficha)`);
  line(`  products/${productId}/variants/* (${varsSnap.size} variante(s)):`);
  for (const v of varsSnap.docs) {
    const vd = v.data();
    line(
      `    · ${String(vd['sku'] ?? v.id).padEnd(22)} ${String(vd['name'] ?? '').padEnd(26)} ` +
      `${fmtUsd(vd['priceUsd'])}  stock: ${Number(vd['stock'] ?? 0)}  reservado: ${Number(vd['stockReserved'] ?? 0)}`,
    );
  }
  line('');
  line('NO se tocará nada más (pedidos, categorías, contadores, promos).');
  line('');

  if (!opts.yes) {
    hr();
    line('SIMULACIÓN terminada. No se borró nada.');
    line('Para ejecutar de verdad, repite el comando agregando  --yes');
    return;
  }

  /* ── Ejecución: UN lote atómico (variantes + ficha) ── */

  const batch = db.batch();
  for (const v of varsSnap.docs) batch.delete(v.ref);
  batch.delete(db.collection('products').doc(productId));
  await batch.commit();
  line('Lote aplicado: variantes + ficha borradas en una sola transacción.');

  /* ── Verificación posterior ── */

  const check = await db.collection('products').doc(productId).get();
  line(check.exists ? '✖ Verificación: la ficha TODAVÍA existe (raro; revisa en el panel).' : '✔ Verificación: la ficha ya no existe.');
  const quedan = await db.collection('products').count().get();
  line(`Productos restantes en el catálogo: ${quedan.data().count}`);
  hr();
  line('LISTO. Producto eliminado por completo.');
}

main().catch((e) => {
  console.error('\n✖ Error inesperado:');
  console.error(e);
  process.exit(1);
});
