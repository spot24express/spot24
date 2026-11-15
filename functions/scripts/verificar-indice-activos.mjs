#!/usr/bin/env node
/**
 * SPOT 24 · Chequeo PREVENTIVO del índice «solo activos» (5.150) — SOLO LECTURA.
 *
 * El fix 5.149 añade `active == true` a las consultas del catálogo. Eso exige
 * que el índice compuesto de products (active + createdAt desc) EXISTA en el
 * proyecto de Firestore. El archivo firestore.indexes.json lo declara, pero
 * si el deploy de índices nunca corrió, el catálogo devolvería
 * FAILED_PRECONDITION tras el push — el único riesgo real de esta ronda.
 *
 * Este script corre las DOS consultas exactas de la tienda ANTES del push:
 *   1. Home / Ver todo:  where('active','==',true) + orderBy('createdAt','desc')
 *   2. Categorías:       where('categoryId','==',X) + where('active','==',true)
 *                        + orderBy('createdAt','desc')
 * Si el índice existe → «ÍNDICE OK». Si falta → imprime el ENLACE de Firebase
 * para crearlo con un clic (tarda ~1-2 min con 1030 docs) y qué hacer.
 *
 * USO (PowerShell, terminal propia — NO en la de netlify dev):
 *   node functions\scripts\verificar-indice-activos.mjs
 *
 * No escribe nada: dos lecturas de 1 documento cada una.
 * Credenciales: igual que diagnostico-catalogo.mjs (.env raíz / GAC).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = path.resolve(FUNCTIONS_DIR, '..');

const line = (s = '') => console.log(s);
const fail = (msg) => {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
};

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
    if (val.startsWith('{')) {
      let acc = val;
      const balance = (s) => (s.match(/{/g) ?? []).length - (s.match(/}/g) ?? []).length;
      while (balance(acc) > 0 && i + 1 < lines.length) {
        i += 1;
        acc += '\n' + lines[i];
      }
      val = acc;
    }
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
  try { return JSON.parse(t); } catch { /* sigue */ }
  if (/^[A-Za-z0-9+/=\r\n_-]+$/.test(t) && !t.startsWith('{')) {
    try { return JSON.parse(Buffer.from(t, 'base64').toString('utf8')); } catch { /* sigue */ }
  }
  return null;
}

function loadServiceAccount() {
  const fromEnv = parseServiceAccount(process.env['FIREBASE_SERVICE_ACCOUNT'] ?? '');
  if (fromEnv?.project_id) return fromEnv;
  const envVars = { ...parseEnvFile(path.join(PROJECT_ROOT, '.env')) };
  const fromDotenv = parseServiceAccount(envVars['FIREBASE_SERVICE_ACCOUNT'] ?? '');
  if (fromDotenv?.project_id) return fromDotenv;
  const gacPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'] || envVars['GOOGLE_APPLICATION_CREDENTIALS'] || '';
  if (gacPath && existsSync(gacPath)) {
    try {
      const sa = JSON.parse(readFileSync(gacPath, 'utf8'));
      if (sa?.project_id) return sa;
    } catch { /* sigue */ }
  }
  return null;
}

/** Extrae el enlace de creación del índice del mensaje de FAILED_PRECONDITION. */
function urlDeIndice(e) {
  const m = String(e?.message ?? '').match(/https:\/\/console\.firebase\.google\.com[^\s"']*/);
  return m ? m[0] : null;
}

async function main() {
  line('SPOT 24 · Chequeo PREVENTIVO del índice «solo activos» (SOLO LECTURA)');
  line('Raíz: ' + PROJECT_ROOT);
  const sa = loadServiceAccount();
  if (!sa) fail('Sin credenciales: FIREBASE_SERVICE_ACCOUNT en .env raíz o GOOGLE_APPLICATION_CREDENTIALS.');

  const require = createRequire(path.join(FUNCTIONS_DIR, 'package.json'));
  let admin;
  try {
    admin = require('firebase-admin');
  } catch {
    fail('No pude cargar firebase-admin. Instálalo una vez:  npm --prefix functions install');
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  line('Credenciales OK · proyecto: ' + sa.project_id);
  line('');
  let todoOk = true;

  /* 1 · La consulta del catálogo (Home / Ver todo): active + orderBy createdAt */
  line('1) Catálogo sin categoría:  active==true + orderBy(createdAt desc) …');
  try {
    const s = await db.collection('products')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    const n = s.size;
    line(`   ✔ ÍNDICE OK (trajo ${n} doc — el más reciente activo).`);
  } catch (e) {
    todoOk = false;
    line(`   ✖ FALTA ÍNDICE (${String(e?.code ?? '')}).`);
    const url = urlDeIndice(e);
    if (url) {
      line('   Ábrelo y crea el índice con un clic (tarda ~1-2 min):');
      line(`   ${url}`);
      line('   Vuelve a correr este script hasta que diga ÍNDICE OK.');
    } else {
      line(`   Detalle: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
  line('');

  /* 2 · La consulta por categoría: categoryId + active + orderBy createdAt */
  line('2) Página de categoría:  categoryId==X + active==true + orderBy(createdAt desc) …');
  try {
    const s = await db.collection('products')
      .where('categoryId', '==', '__chequeo_indice__')
      .where('active', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    line(`   ✔ ÍNDICE OK (0 resultados esperados — la consulta valida el índice igual).`);
  } catch (e) {
    todoOk = false;
    line(`   ✖ FALTA ÍNDICE (${String(e?.code ?? '')}).`);
    const url = urlDeIndice(e);
    if (url) {
      line('   Ábrelo y crea el índice con un clic:');
      line(`   ${url}`);
    } else {
      line(`   Detalle: ${String(e?.message ?? e).slice(0, 200)}`);
    }
  }
  line('');
  line('─'.repeat(72));
  if (todoOk) {
    line('✔ TODO OK: los dos índices que la 5.149 necesita ya existen.');
    line('  Puedes hacer push con tranquilidad — el catálogo no fallará por índices.');
  } else {
    line('⚠ Crea el/los índice(s) con los enlaces de arriba, espera a que queden');
    line('  «Enabled» en la consola, y vuelve a correr este script hasta TODO OK.');
    line('  Luego haz push. (El índice se puede crear ANTES de desplegar código:');
    line('  no afecta a la tienda actual.)');
  }
  line('No se escribió nada: dos lecturas de 1 doc.');
}

main().catch((e) => fail(`Error inesperado: ${e?.message ?? e}`));
