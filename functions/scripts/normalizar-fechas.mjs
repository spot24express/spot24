#!/usr/bin/env node
/**
 * SPOT 24 · Normalizar fechas del catálogo — herramienta local del dueño (5.97).
 *
 * PROBLEMA: en la colección products conviven DOS formatos de fecha:
 *   · Timestamp de Firestore (panel e importador viejos, serverTimestamp())
 *   · número epoch-ms (convención actual: importador 5.92e+ y panel 5.95+)
 * Firestore ordena por TIPO cuando un campo mezcla valores (números < Timestamps),
 * así que «Recién llegados» y la paginación del catálogo entierran los productos
 * con fecha numérica, y el orderBy('updatedAt') del chequeo PWA (catalog.service)
 * también se cuela. La cura es UNA sola vez: dejar TODO en número.
 *
 * QUÉ HACE: convierte createdAt y updatedAt de los productos que estén como
 * Timestamp al MISMO instante exacto, escrito como número epoch-ms.
 *   · SOLO la colección products (jamás orders, categories, promos, zones,
 *     users ni la subcolección variants).
 *   · SOLO esos dos campos (jamás precio, stock, fotos, nombre ni visibilidad).
 *   · Los campos que ya son número NO se tocan (idempotente: puede correrse
 *     cuantas veces haga falta; solo arregla lo que falte).
 *
 * SIMULACIÓN POR DEFECTO: sin --aplicar no escribe NADA (cuenta y muestra
 * ejemplos «antes → después»).
 *
 * CON --aplicar (o --yes):
 *   1. Respalda TODOS los productos a
 *      respaldos/respaldo-productos-antes-de-normalizar-<fecha>.json en tu PC.
 *   2. Reescribe los campos afectados en lotes de ≤450 (patrón del importador).
 *      Si un doc se borra a mitad de camino y el lote muere con NOT_FOUND
 *      (lección 5.92b), reintenta doc por doc y continúa con el resto.
 *   3. Vuelve a leer TODO y verifica: debe quedar 0 pendientes.
 *
 * USOS (PowerShell, en la raíz del repo):
 *   node functions\scripts\normalizar-fechas.mjs              → simulación
 *   node functions\scripts\normalizar-fechas.mjs --aplicar    → respaldo + aplica
 *   node functions\scripts\normalizar-fechas.mjs --help
 *
 * CREDENCIALES: igual que purge-test-order.mjs — FIREBASE_SERVICE_ACCOUNT del
 * .env de la RAÍZ (JSON directo, base64 o multilínea) o
 * GOOGLE_APPLICATION_CREDENTIALS (ruta a un JSON de cuenta de servicio).
 * Depende de firebase-admin ya instalado en functions/node_modules.
 *
 * NOTA: si creas/importas productos con el código VIEJO aún desplegado en
 * producción (antes del push de 5.75…5.95), esos nuevos nacerán con Timestamp
 * otra vez: corre este script de nuevo y listo (no duplica nada).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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

const p2 = (n) => String(n).padStart(2, '0');
const fmtDate = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  return new Date(n).toLocaleString('es-VE', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};
const stampLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
};

/* ─────────────────── tipos de fecha (gemelo de aMillisDe) ───────────────────
 * Misma lógica que aMillisDe de importInventory.ts y tiempos.ts del frontend:
 * Timestamp de Firestore (toMillis) · {seconds,nanoseconds} pelado · número.
 * Todo lo desconocido → 0 (jamás NaN, jamás inventar datos). */

function aMillisDe(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v && typeof v === 'object') {
    if (typeof v.toMillis === 'function') {
      try {
        const t = v.toMillis();
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    }
    const s = Number(v.seconds);
    if (Number.isFinite(s)) {
      const ns = Number(v.nanoseconds ?? 0);
      return Math.round(s * 1000 + (Number.isFinite(ns) ? ns : 0) / 1e6);
    }
  }
  return 0;
}

/** 'timestamp' (a convertir) · 'numero' (ok) · 'ausente' · 'otro' (sospechoso). */
function tipoDeFecha(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? 'numero' : 'otro';
  if (v && typeof v === 'object') {
    if (typeof v.toMillis === 'function') return 'timestamp';
    if (Number.isFinite(Number(v.seconds))) return 'timestamp';
    return 'otro';
  }
  if (typeof v === 'string') return 'otro';
  return 'ausente';
}

/* ───────────────────────── argumentos CLI ───────────────────────── */

const USAGE = `
USOS:
  node functions\\scripts\\normalizar-fechas.mjs              simulación (no escribe)
  node functions\\scripts\\normalizar-fechas.mjs --aplicar    respaldo + ejecuta

OPCIONES:
  --aplicar        ejecuta de verdad (respaldo primero); sin esto todo es simulación
  --yes            alias de --aplicar
  -h / --help      esta ayuda

QUÉ TOCA: solo products.createdAt y products.updatedAt cuando estén como
Timestamp de Firestore → los reescribe como número epoch-ms (MISMA fecha).
No toca precios, stock, fotos, nombres, visibilidad, órdenes ni variantes.
`.trimEnd();

const argv = process.argv.slice(2);
const opts = { aplicar: false, help: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--aplicar' || a === '--yes') opts.aplicar = true;
  else if (a === '-h' || a === '--help') opts.help = true;
  else fail(`Argumento no reconocido: ${a} (usa --help)`);
}

if (opts.help) {
  line('SPOT 24 · Normalizar fechas del catálogo');
  hr();
  line(USAGE);
  process.exit(0);
}

/* ─────────────── parser .env (idéntico a purge-test-order.mjs) ─────────────── */

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

/* ───────────────────────── programa principal ───────────────────────── */

const CAMPOS = ['createdAt', 'updatedAt'];
const OPS_POR_LOTE = 450; // Firestore admite 500 por lote (margen, patrón importador)

async function main() {
  line('SPOT 24 · Normalizar fechas del catálogo (colección products)');
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
  line(`Modo: ${opts.aplicar ? 'APLICAR CAMBIOS REALES (--aplicar)' : 'SIMULACIÓN (dry-run · NO escribe nada)'}`);
  hr();

  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred.sa) });
  }
  const db = admin.firestore();

  /* ── 1 · Lectura completa de products y plan de cambios ── */

  const snap = await db.collection('products').get();
  const stats = {
    createdAt: { ts: 0, num: 0, ausente: 0, otro: 0 },
    updatedAt: { ts: 0, num: 0, ausente: 0, otro: 0 },
  };
  const sospechosos = []; // números que PARECEN estar en segundos (solo aviso)
  const ejemplos = [];    // hasta 8 ejemplos antes → después
  const plan = [];        // { ref, cambios, name, code }

  snap.forEach((doc) => {
    const data = doc.data() ?? {};
    const cambios = {};
    for (const campo of CAMPOS) {
      const v = data[campo];
      const t = tipoDeFecha(v);
      const st = stats[campo];
      if (t === 'timestamp') {
        const ms = aMillisDe(v);
        if (ms > 0) {
          cambios[campo] = ms;
          st.ts += 1;
          if (ejemplos.length < 8) {
            ejemplos.push({ campo, name: String(data['name'] ?? '(sin nombre)'), code: String(data['code'] ?? ''), antes: v, despues: ms });
          }
        } else {
          st.otro += 1; // Timestamp ilegible: no se toca (jamás inventar)
        }
      } else if (t === 'numero') {
        st.num += 1;
        const n = Number(v);
        if (n >= 1e9 && n < 1e12) {
          sospechosos.push({ campo, name: String(data['name'] ?? '(sin nombre)'), valor: n });
        }
      } else if (t === 'ausente') {
        st.ausente += 1;
      } else {
        st.otro += 1;
      }
    }
    if (Object.keys(cambios).length) {
      plan.push({ ref: doc.ref, cambios, name: String(data['name'] ?? '(sin nombre)'), code: String(data['code'] ?? '') });
    }
  });

  line(`Productos leídos: ${snap.size}`);
  line('');
  line(`createdAt: ${stats.createdAt.ts} en Timestamp (a convertir) · ${stats.createdAt.num} ya en número (ok) · ${stats.createdAt.ausente} sin fecha · ${stats.createdAt.otro} raro (no se toca)`);
  line(`updatedAt: ${stats.updatedAt.ts} en Timestamp (a convertir) · ${stats.updatedAt.num} ya en número (ok) · ${stats.updatedAt.ausente} sin fecha · ${stats.updatedAt.otro} raro (no se toca)`);
  line('');

  if (!plan.length) {
    line('✔ Nada que corregir: todas las fechas ya están en número. No se escribió nada.');
    return;
  }

  if (ejemplos.length) {
    line('Ejemplos antes → después (la fecha es LA MISMA, solo cambia el formato interno):');
    for (const e of ejemplos) {
      const antesMs = aMillisDe(e.antes);
      line(`  · [${e.campo}] ${e.name.slice(0, 44)}${e.code ? ` (${e.code})` : ''}`);
      line(`      ${fmtDate(antesMs)}  →  ${e.despues}  (${fmtDate(e.despues)})`);
    }
    line('');
  }

  if (sospechosos.length) {
    line(`⚠ AVISO: ${sospechosos.length} producto(s) tienen fecha NUMÉRICA que parece estar en SEGUNDS`);
    line('  (no se tocan; si el catálogo se ve con fechas de 1970, avísame):');
    for (const s of sospechosos.slice(0, 10)) {
      line(`  · [${s.campo}] ${s.name.slice(0, 50)} → ${s.valor}`);
    }
    line('');
  }

  if (!opts.aplicar) {
    hr();
    line(`SIMULACIÓN terminada: se convertirían ${plan.length} producto(s) · 0 escrituras hechas.`);
    line('');
    line('Si todo cuadra, aplica con:');
    line('  node functions\\scripts\\normalizar-fechas.mjs --aplicar');
    line('');
    line('Con --aplicar PRIMERO se guarda un respaldo JSON de tus productos en tu PC');
    line('(carpeta respaldos\\ de la raíz del proyecto) y recién entonces se escribe.');
    return;
  }

  /* ── 2 · Respaldo completo ANTES de escribir ── */

  const respaldoDir = path.join(PROJECT_ROOT, 'respaldos');
  if (!existsSync(respaldoDir)) mkdirSync(respaldoDir, { recursive: true });
  const respaldoPath = path.join(respaldoDir, `respaldo-productos-antes-de-normalizar-${stampLocal()}.json`);
  const volcado = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  writeFileSync(respaldoPath, JSON.stringify(volcado, null, 2), 'utf8');
  const kb = Math.max(1, Math.round(readFileSync(respaldoPath).length / 1024));
  line(`Respaldo guardado: ${respaldoPath} (${snap.size} productos · ${kb} KB)`);
  hr();
  line(`EJECUTANDO CAMBIOS REALES sobre ${plan.length} producto(s)…`);
  line('');

  /* ── 3 · Escrituras en lotes ≤450 (con reintento doc por doc, lección 5.92b) ── */

  let hechos = 0;
  let omitidos = 0;
  for (let i = 0; i < plan.length; i += OPS_POR_LOTE) {
    const tanda = plan.slice(i, i + OPS_POR_LOTE);
    const numLote = Math.floor(i / OPS_POR_LOTE) + 1;
    const batch = db.batch();
    tanda.forEach((it) => batch.update(it.ref, it.cambios));
    try {
      await batch.commit();
      hechos += tanda.length;
      line(`  lote ${numLote}: ✓ (${hechos}/${plan.length} productos)`);
    } catch (e) {
      // Un doc borrado a mitad de camino mata el lote COMPLETO con
      // NOT_FOUND «No document to update»: reintento doc por doc.
      line(`  lote ${numLote}: el lote completo falló (${String(e?.code ?? e?.message ?? e).slice(0, 60)}) → reintento doc por doc…`);
      for (const it of tanda) {
        try {
          const b = db.batch();
          b.update(it.ref, it.cambios);
          await b.commit();
          hechos += 1;
        } catch (e2) {
          omitidos += 1;
          line(`    · omitido ${it.name.slice(0, 40)} (${String(e2?.code ?? e2?.message ?? e2).slice(0, 50)})`);
        }
      }
    }
  }
  line('');
  hr();

  /* ── 4 · Verificación final: releer TODO y contar pendientes ── */

  const snap2 = await db.collection('products').get();
  let restantesCre = 0;
  let restantesUpd = 0;
  snap2.forEach((d) => {
    const data = d.data() ?? {};
    if (tipoDeFecha(data['createdAt']) === 'timestamp') restantesCre += 1;
    if (tipoDeFecha(data['updatedAt']) === 'timestamp') restantesUpd += 1;
  });

  line('VERIFICACIÓN FINAL:');
  line(`  productos leídos: ${snap2.size}`);
  line(`  createdAt en Timestamp restantes: ${restantesCre}`);
  line(`  updatedAt en Timestamp restantes: ${restantesUpd}`);
  line(`  escrituras aplicadas: ${hechos}${omitidos ? ` · omitidas: ${omitidos}` : ''}`);
  line('');
  if (!restantesCre && !restantesUpd) {
    line('✔ LISTO: el catálogo quedó con TODAS las fechas en número epoch-ms.');
    line('  «Recién llegados» y el catálogo ahora ordenan por fecha REAL.');
    line('  Este script es idempotente: si vuelves a importar con el código viejo');
    line('  de producción antes del push, córrelo otra vez y solo tocará lo nuevo.');
  } else {
    line(`⚠ Quedaron ${restantesCre + restantesUpd} campo(s) sin convertir (borrados a mitad de`);
    line('  camino o Timestamp ilegible). Corre de nuevo el script para reintentarlos.');
  }
}

main().catch((e) => {
  fail(`Error inesperado: ${e?.message ?? e}`);
});
