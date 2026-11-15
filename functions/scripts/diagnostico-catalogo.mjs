#!/usr/bin/env node
/**
 * SPOT 24 · Diagnóstico del catálogo — herramienta local del dueño (5.150).
 * 100% SOLO LECTURA: este script NO ESCRIBE NADA en ningún modo (no tiene
 * --aplicar). Sirve para VER, desde tu terminal, exactamente lo que la tienda
 * ve en producción y responder tres preguntas del 15/11:
 *
 *   1. ¿Cuáles son los productos que se SUMARON con el importador?
 *      → huella del importador (inactivo + sin categoría + precio 0) y los
 *        registros de auditoría de cada importación (auditLog).
 *   2. ¿Por qué «Recién llegados» muestra 1 solo producto?
 *      → simulación de la cabeza del orden createdAt desc CON LOS TIPOS
 *        REALES (Firestore ordena Timestamps por ENCIMA de números: si tus
 *        productos viejos tienen fecha-Timestamp, van PRIMERO aunque la fecha
 *        sea vieja; las altas envejecidas a 2020 quedan debajo de todos).
 *   3. ¿Qué verá «Recién llegados» y «Ver todo» con cada versión?
 *      → cuenta de activos en las primeras 72 docs crudas (código de hoy sin
 *        deploy) y el top-8 de activos (con el fix 5.149 desplegado).
 *
 * USO (PowerShell, terminal PROPIA — NO en la de netlify dev):
 *   node functions\scripts\diagnostico-catalogo.mjs
 *
 * Al final imprime un bloque «RESUMEN PARA EL ASISTENTE»: cópialo tal cual
 * y pégalo en el chat — con eso se decide la cura exacta sin tocar nada.
 *
 * CREDENCIALES: igual que normalizar-fechas.mjs — FIREBASE_SERVICE_ACCOUNT
 * del .env de la RAÍZ (JSON directo, base64 o multilínea) o
 * GOOGLE_APPLICATION_CREDENTIALS. Depende de firebase-admin en
 * functions/node_modules.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const FUNCTIONS_DIR = path.resolve(SCRIPT_DIR, '..');
const PROJECT_ROOT = path.resolve(FUNCTIONS_DIR, '..');

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
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}_${p2(d.getHours())}${p2(d.getMinutes())}`;
};

/* ─────────────── tipos de fecha (gemelo de aMillisDe / tiempos.ts) ─────────────── */

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

/** 'numero' · 'timestamp' · 'ausente' · 'otro' (gemelo de tipoDeFecha del 5.97). */
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

/* ─────────────── credenciales (idéntico a normalizar-fechas.mjs) ─────────────── */

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
  if (fromEnv?.project_id) return { sa: fromEnv, via: 'variable de entorno FIREBASE_SERVICE_ACCOUNT' };

  const envVars = { ...parseEnvFile(path.join(PROJECT_ROOT, '.env')) };
  const fromDotenv = parseServiceAccount(envVars['FIREBASE_SERVICE_ACCOUNT'] ?? '');
  if (fromDotenv?.project_id) return { sa: fromDotenv, via: '.env raíz (FIREBASE_SERVICE_ACCOUNT)' };

  const gacPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'] || envVars['GOOGLE_APPLICATION_CREDENTIALS'] || '';
  if (gacPath && existsSync(gacPath)) {
    try {
      const sa = JSON.parse(readFileSync(gacPath, 'utf8'));
      if (sa?.project_id) return { sa, via: `GOOGLE_APPLICATION_CREDENTIALS (${gacPath})` };
    } catch { /* sigue */ }
  }
  return null;
}

/* ──────────────────────────── programa principal ──────────────────────────── */

const HUELLA_EDAD = new Date('2021-01-01T00:00:00').getTime(); // envejecidas = createdAt < 2021
const TANDA_HOME = 72; // lo que «Recién llegados» escanea hoy: 3 tandas de 24

async function main() {
  line('SPOT 24 · Diagnóstico del catálogo (SOLO LECTURA — no escribe nada)');
  line(`Raíz del proyecto: ${PROJECT_ROOT} · generado: ${stampLocal()}`);
  hr();

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
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(cred.sa) });
  }
  const db = admin.firestore();

  /* ── 1 · Lectura completa de products ── */
  const snap = await db.collection('products').get();
  const prods = [];
  snap.forEach((d) => {
    const p = d.data() ?? {};
    prods.push({
      id: d.id,
      code: String(p.code ?? ''),
      name: String(p.name ?? ''),
      active: p.active === true,
      categoryId: String(p.categoryId ?? ''),
      basePriceUsd: Number(p.basePriceUsd ?? 0),
      vendidosTotal: Number(p.vendidosTotal ?? 0),
      creTipo: tipoDeFecha(p.createdAt),
      creMs: aMillisDe(p.createdAt),
      updTipo: tipoDeFecha(p.updatedAt),
      huella: p.active !== true && String(p.categoryId ?? '') === '' && Number(p.basePriceUsd ?? 0) === 0,
    });
  });

  const activos = prods.filter((p) => p.active);
  const inactivos = prods.filter((p) => !p.active);
  const huella = prods.filter((p) => p.huella);
  const huellaVieja = huella.filter((p) => p.creMs > 0 && p.creMs < HUELLA_EDAD);
  const huellaFresca = huella.filter((p) => !(p.creMs > 0 && p.creMs < HUELLA_EDAD));

  line(`Productos leídos: ${prods.length} · activos: ${activos.length} · inactivos: ${inactivos.length}`);
  line('');
  line('TIPOS DE createdAt (el orden de Firestore es por TIPO: Timestamp SIEMPRE arriba del número):');
  const tipos = ['timestamp', 'numero', 'otro', 'ausente'];
  for (const t of tipos) {
    const conT = prods.filter((p) => p.creTipo === t);
    if (!conT.length) continue;
    const act = conT.filter((p) => p.active).length;
    line(`  · createdAt ${t.padEnd(9)}: ${conT.length} (activos: ${act})`);
  }
  const conUpdTs = prods.filter((p) => p.updTipo === 'timestamp').length;
  line(`  · updatedAt en Timestamp: ${conUpdTs} (solo afecta al vigía «pulso», no al orden)`);
  line('');

  /* ── 2 · Huella del importador (altas) ── */
  line('HUELLA DEL IMPORTADOR (inactivo + sin categoría + precio 0):');
  line(`  · total: ${huella.length} · ya envejecidas (createdAt < 2021): ${huellaVieja.length} · frescas: ${huellaFresca.length}`);
  if (huella.length) {
    const fechas = huella.map((p) => p.creMs).filter((n) => n > 0);
    if (fechas.length) {
      line(`  · rango de fechas: ${fmtDate(Math.min(...fechas))} → ${fmtDate(Math.max(...fechas))}`);
    }
    line('  · primeras 15:');
    for (const p of huella.slice(0, 15)) {
      line(`    - ${p.code.padEnd(16)} ${fmtDate(p.creMs)} · ${p.name.slice(0, 48)}`);
    }
    if (huella.length > 15) line(`    … y ${huella.length - 15} más.`);
  }
  line('');

  /* ── 3 · Auditoría: cuándo corrió cada importación ── */
  line('IMPORTACIONES REGISTRADAS (auditLog · las 8 más recientes):');
  try {
    const auds = await db
      .collection('auditLog')
      .where('action', '==', 'importar_inventario')
      .orderBy('at', 'desc')
      .limit(8)
      .get();
    if (auds.empty) line('  · (sin registros de importación)');
    auds.forEach((d) => {
      const a = d.data();
      line(`  · ${fmtDate(a.at)} · ${String(a.note ?? '')}`);
    });
  } catch (e) {
    line(`  · (no pude leer auditLog: ${String(e?.message ?? e).slice(0, 80)})`);
  }
  line('');

  /* ── 4 · La CABEZA del orden que usa la tienda (createdAt desc, crudo) ── */
  const enved = [...prods].sort((a, b) => b.creMs - a.creMs);
  line('CABEZA DEL CATÁLOGO (primeros 30 en el orden de la tienda · createdAt desc CRUDO,'
    + ' como se ve HOY sin deploy):');
  line('  T = fecha Timestamp (VA PRIMERO aunque sea vieja) · N = número · * = huella del importador');
  for (const p of enved.slice(0, 30)) {
    const marca = p.huella ? '*' : ' ';
    const tipo = p.creTipo === 'timestamp' ? 'T' : p.creTipo === 'numero' ? 'N' : '?';
    const cat = p.categoryId === '' ? 'sin-cat' : p.categoryId.slice(0, 12);
    line(
      `  ${marca}${tipo} ${fmtDate(p.creMs)} · ${p.active ? 'ACTIVO ' : 'inact. '} · ${cat.padEnd(12)} `
      + `$${p.basePriceUsd.toFixed(2).padStart(8)} · vend:${String(p.vendidosTotal).padEnd(4)} `
      + `${p.code.padEnd(14)} ${p.name.slice(0, 40)}`,
    );
  }
  line('');

  /* ── 5 · Simulación «Recién llegados» HOY (código sin deploy: filtro en cliente) ── */
  const primeros72 = enved.slice(0, TANDA_HOME);
  const activosEn72 = primeros72.filter((p) => p.active);
  line('SIMULACIÓN «RECIÉN LLEGADOS» CON EL CÓDIGO ACTUAL (sin 5.149):');
  line(`  · de los primeros ${TANDA_HOME} docs crudos, ACTIVOS: ${activosEn72.length}`
    + `${activosEn72.length === 0 ? '  ← sección vacía («Catálogo en preparación»)' : ''}`);
  const top8 = activosEn72.slice(0, 8);
  for (const p of top8) {
    line(`    · ${p.code.padEnd(16)} ${fmtDate(p.creMs)} · ${p.name.slice(0, 48)}`);
  }
  line('');

  /* ── 6 · Simulación con el fix 5.149 desplegado (solo activos en la consulta) ── */
  const soloActivos = activos.filter((p) => p.creMs > 0).sort((a, b) => b.creMs - a.creMs);
  line('SIMULACIÓN CON EL FIX 5.149 DESPLEGADO (la consulta pide SOLO activos):');
  line(`  · activos totales: ${activos.length} · los primeros 8 serían:`);
  for (const p of soloActivos.slice(0, 8)) {
    line(`    · ${p.code.padEnd(16)} ${fmtDate(p.creMs)} · ${p.name.slice(0, 48)}`);
  }
  line('');

  /* ── 7 · Bloqueadores de cabeza: inactivos con TIMESTAMP (no los cubre la huella) ── */
  const bloqueadores = prods.filter((p) => !p.active && p.creTipo === 'timestamp');
  line('BLOQUEADORES DE CABEZA (inactivos con fecha-Timestamp — van PRIMERO aunque viejos):');
  line(`  · total: ${bloqueadores.length}`);
  for (const p of bloqueadores.slice(0, 12)) {
    const cat = p.categoryId === '' ? 'sin-cat' : p.categoryId.slice(0, 12);
    line(`    · ${p.code.padEnd(16)} ${fmtDate(p.creMs)} · cat:${cat.padEnd(12)} $${p.basePriceUsd.toFixed(2)} · ${p.name.slice(0, 40)}`);
  }
  line('');

  /* ── 8 · Resumen para pegar en el chat ── */
  hr();
  line('RESUMEN PARA EL ASISTENTE (copia desde aquí):');
  line(JSON.stringify({
    productos: prods.length,
    activos: activos.length,
    inactivos: inactivos.length,
    createdAtTimestamp: prods.filter((p) => p.creTipo === 'timestamp').length,
    createdAtNumero: prods.filter((p) => p.creTipo === 'numero').length,
    huellaTotal: huella.length,
    huellaEnvejecida: huellaVieja.length,
    huellaFresca: huellaFresca.length,
    activosEnPrimeras72: activosEn72.length,
    bloqueadoresInactivosTimestamp: bloqueadores.length,
  }, null, 2));
  hr();
  line('SOLO LECTURA completada. No se escribió ni borró nada.');
}

main().catch((e) => fail(`Error inesperado: ${e?.message ?? e}`));
