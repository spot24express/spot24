#!/usr/bin/env node
/**
 * SPOT 24 · Limpieza de borradores del importador (5.150) — herramienta local del dueño.
 *
 * QUÉ ATACA: productos BORRADOR que hoy tapan la cabeza del catálogo:
 *   active != true  AND  categoryId == ''   (con CUALQUIER precio)
 *
 * ¿POR QUÉ el script del dueño (purgar-altas-import.mjs) dejó estos? Su huella
 * exige basePriceUsd == 0. La importación del 15/11 corrió en dos pasadas:
 * «solo stock» creó los borradores con precio 0 y «solo precios» les cargó
 * precio ENCIMA (mismo código). Resultado: ~446 borradores CON precio que ya
 * no cumplen la huella estricta → no se envejecieron → siguen frescos arriba.
 * Este script cubre la huella AMPLIA (inactivo + sin categoría, sin importar
 * el precio) y además NUNCA toca:
 *   · productos ACTIVOS (la consulta ya lo garantiza),
 *   · productos CON categoría (esos se completan o borran a mano desde el
 *     panel Admin → Productos; p. ej. «NESCAFE BORRAR» tiene categoría),
 *   · nada con vendidosTotal > 0 (protección de ventas, igual que tu script).
 *
 * MODOS (todo es SIMULACIÓN salvo que pases --aplicar):
 *   node functions\scripts\limpiar-borradores-import.mjs                 → lista y cuenta, no toca nada
 *   node functions\scripts\limpiar-borradores-import.mjs --envejecer     → createdAt → 01/01/2020 12:00 (conserva las fichas)
 *   node functions\scripts\limpiar-borradores-import.mjs --envejecer 2020-03-01
 *   node functions\scripts\limpiar-borradores-import.mjs --borrar --todo  → borra ficha + variante (peligroso)
 *   node functions\scripts\limpiar-borradores-import.mjs --borrar --desde 2026-11-15 --hasta 2026-11-16
 *   … y en ambos: --aplicar para ejecutar de verdad.
 *
 * RESPALDO: antes de aplicar guarda un JSON con los documentos afectados
 * (fichas completas y, en modo --borrar, sus variantes) en
 * functions/scripts/respaldo-borradores-<fecha>.json — si algo sale mal, ese
 * archivo permite restaurar.
 *
 * CREDENCIALES: igual que diagnostico-catalogo.mjs — FIREBASE_SERVICE_ACCOUNT
 * del .env de la RAÍZ (JSON directo, base64 o multilínea) o
 * GOOGLE_APPLICATION_CREDENTIALS. Depende de firebase-admin en functions/node_modules.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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

/** Acepta 'YYYY-MM-DD' o 'YYYY-MM-DD HH:mm' (hora local). Devuelve ms o NaN. */
function parseFechaArg(s) {
  const t = String(s ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(t)) return NaN;
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : NaN;
}

/* ─────────────── credenciales (idéntico a diagnostico-catalogo.mjs) ─────────────── */

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

/* ──────────────────────────── argumentos ──────────────────────────── */

const argv = process.argv.slice(2);
const tiene = (f) => argv.includes(f);
const valorDe = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined;
};

const APLICAR = tiene('--aplicar');
const ENVEJECER = tiene('--envejecer');
const BORRAR = tiene('--borrar');
const TODO = tiene('--todo');
const DESDE_RAW = valorDe('--desde');
const HASTA_RAW = valorDe('--hasta');

if (ENVEJECER && BORRAR) fail('Elige UN modo: --envejecer (conserva fichas) o --borrar (elimina). No ambos.');

/* ──────────────────────────── programa principal ──────────────────────────── */

const LOTE = 450;

async function main() {
  line('SPOT 24 · Limpieza de borradores del importador (inactivo + sin categoría, cualquier precio)');
  line(`Raíz del proyecto: ${PROJECT_ROOT} · generado: ${stampLocal()}`);
  line(ENVEJECER ? 'MODO: ENVEJECER (mueve createdAt — conserva las fichas)'
    : BORRAR ? 'MODO: BORRAR (elimina ficha + variantes — irreversible sin respaldo)'
    : 'MODO: SIMULACIÓN (solo lista; pasa --aplicar para ejecutar)');
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

  /* ── 1 · Selección: borradores = inactive + sin categoría (cualquier precio) ── */
  line('Leyendo productos…');
  const snap = await db.collection('products').get();
  const blancos = [];
  let conPrecio = 0;
  let protegidosVentas = 0;
  snap.forEach((d) => {
    const p = d.data() ?? {};
    if (p.active === true) return;                    // activo: jamás
    if (String(p.categoryId ?? '') !== '') return;    // con categoría: se completa/borra a mano
    if (Number(p.vendidosTotal ?? 0) > 0) {           // con ventas: protegido SIEMPRE
      protegidosVentas += 1;
      return;
    }
    const cre = p.createdAt;
    const creMs = typeof cre === 'number' ? cre : (cre?.toMillis?.() ?? 0);
    if (Number(p.basePriceUsd ?? 0) > 0) conPrecio += 1;
    blancos.push({ id: d.id, ref: d.ref, data: p, creMs });
  });

  line(`Productos leídos: ${snap.size}`);
  line(`Borradores a tratar (inactivo + sin categoría + sin ventas): ${blancos.length}`
    + `  (de ellos ${conPrecio} CON precio — los que tu script estricto no cubrió)`);
  line(`Protegidos por ventas (vendidosTotal > 0, se omiten): ${protegidosVentas}`);
  line('');

  if (!blancos.length) {
    line('Nada que procesar. Los borradores ya están limpios. ✔');
    return;
  }

  /* ── 2 · Vista previa ── */
  const orden = [...blancos].sort((a, b) => b.creMs - a.creMs);
  line('Primeros 25 (más frescos primero):');
  for (const b of orden.slice(0, 25)) {
    const precio = Number(b.data.basePriceUsd ?? 0);
    line(`  · ${String(b.data.code ?? '').padEnd(16)} ${fmtDate(b.creMs)} · $${precio.toFixed(2).padStart(8)} · ${String(b.data.name ?? '').slice(0, 44)}`);
  }
  if (orden.length > 25) line(`  … y ${orden.length - 25} más.`);
  line('');

  /* ── 3 · Resolución de modo ── */
  if (!ENVEJECER && !BORRAR) {
    line('SIMULACIÓN terminada. No se escribió nada.');
    line('Para ejecutar de verdad:');
    line('  · conservar fichas y hundirlas en el tiempo:  --envejecer --aplicar');
    line('  · borrarlas definitivamente (con respaldo):   --borrar --todo --aplicar');
    return;
  }

  if (BORRAR && !TODO) {
    const desdeMs = DESDE_RAW !== undefined ? parseFechaArg(DESDE_RAW) : NaN;
    const hastaMs = HASTA_RAW !== undefined ? parseFechaArg(HASTA_RAW) : NaN;
    if (!Number.isFinite(desdeMs) || !Number.isFinite(hastaMs)) {
      fail('--borrar exige alcance explícito: --todo, o --desde AAAA-MM-DD --hasta AAAA-MM-DD.');
    }
  }

  /* ── 4 · RESPALDO antes de aplicar ── */
  if (APLICAR) {
    line('Guardando respaldo…');
    const respaldo = {
      generado: new Date().toISOString(),
      proyecto: cred.sa.project_id,
      modo: ENVEJECER ? 'envejecer' : 'borrar',
      cantidad: blancos.length,
      productos: blancos.map((b) => ({ id: b.id, data: b.data })),
    };
    if (BORRAR) {
      // Variantes incluidas: sin ellas no se puede restaurar el detalle.
      for (const b of blancos) {
        const vs = await b.ref.collection('variants').get();
        b.variantes = [];
        vs.forEach((v) => b.variantes.push({ id: v.id, data: v.data() }));
      }
      respaldo.conVariantes = blancos.reduce((a, b) => a + (b.variantes?.length ?? 0), 0);
    }
    const archivo = path.join(SCRIPT_DIR, `respaldo-borradores-${stampLocal()}.json`);
    writeFileSync(archivo, JSON.stringify(respaldo, null, 2));
    line(`Respaldo guardado: ${archivo}`);
    line('');
  } else {
    line('(--aplicar no pasado: NO se guarda respaldo ni se escribe nada)');
    line('');
  }

  /* ── 5 · Ejecución en lotes ── */
  const FECHA_ENVEJECER = (() => {
    const v = valorDe('--envejecer'); // puede traer fecha opcional
    if (v && !v.startsWith('-')) {
      const ms = parseFechaArg(v);
      if (!Number.isFinite(ms)) fail(`Fecha inválida para --envejecer: ${v}`);
      return ms;
    }
    return new Date('2020-01-01T12:00:00').getTime(); // misma convención que purgar-altas-import
  })();

  if (ENVEJECER) {
    if (!APLICAR) {
      line(`SIMULACIÓN: ${blancos.length} fichas pasarían a createdAt = ${fmtDate(FECHA_ENVEJECER)}. Nada escrito.`);
      return;
    }
    let hechos = 0;
    for (let i = 0; i < blancos.length; i += LOTE) {
      const tanda = blancos.slice(i, i + LOTE);
      const batch = db.batch();
      for (const b of tanda) {
        batch.update(b.ref, { createdAt: FECHA_ENVEJECER, updatedAt: Date.now() });
      }
      await batch.commit();
      hechos += tanda.length;
      line(`  envejecidas: ${hechos}/${blancos.length}`);
    }
    line('');
    line(`✔ Listo: ${hechos} borradores hundidos a ${fmtDate(FECHA_ENVEJECER)}.`);
    line('  La tienda (con el fix 5.149 desplegado) ya no los ve; el admin los lista al final.');
    return;
  }

  /* modo BORRAR */
  if (!APLICAR) {
    line(`SIMULACIÓN: se BORRARÍAN ${blancos.length} fichas (+ sus variantes). Nada escrito.`);
    line('Ejecutar de verdad: añade --aplicar (junto a --todo o --desde/--hasta).');
    return;
  }
  let borrados = 0;
  for (let i = 0; i < blancos.length; i += 1) {
    const b = blancos[i];
    const vs = await b.ref.collection('variants').get();
    const batch = db.batch();
    let ops = 0;
    vs.forEach((v) => {
      if (ops < LOTE - 1) {
        batch.delete(v.ref);
        ops += 1;
      }
    });
    batch.delete(b.ref);
    ops += 1;
    await batch.commit();
    // Variantes sobrantes (si el subconjunto excedió el lote) — caso raro.
    if (vs.size >= LOTE) {
      const resto = await b.ref.collection('variants').get();
      if (!resto.empty) {
        const b2 = db.batch();
        let n2 = 0;
        resto.forEach((v) => {
          if (n2 < LOTE) { b2.delete(v.ref); n2 += 1; }
        });
        await b2.commit();
      }
    }
    borrados += 1;
    if (borrados % 50 === 0 || borrados === blancos.length) {
      line(`  borradas: ${borrados}/${blancos.length}`);
    }
  }
  line('');
  line(`✔ Listo: ${borrados} borradores eliminados (con variantes).`);
  line('  El respaldo JSON quedó en functions/scripts/ por si necesitas restaurar.');
}

main().catch((e) => fail(`Error inesperado: ${e?.message ?? e}`));
