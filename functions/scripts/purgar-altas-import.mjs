#!/usr/bin/env node
/**
 * SPOT 24 · Altas de importación — herramienta local del dueño (5.149).
 *
 * Qué son las «altas»: los productos que el importador CREÓ porque el código
 * del reporte no emparejó con nada de la tienda (modo «Solo stock», 5.137).
 * Nacen INACTIVOS, SIN categoría y SIN precio — a medias por diseño: «jamás
 * sale a la venta un producto a medio importar».
 *
 * El problema (15/11): nacen con createdAt FRESCO y se acumulan ARRIBA del
 * orden «más recientes». «Recién llegados» solo escanea 3 tandas de 24
 * buscando activos, así que cientos de altas dejaban la sección vacía
 * («Categoría en preparación») y los productos viejos parecían desaparecidos
 * (NO estaban borrados: siguen en categorías, búsqueda y catálogo).
 *
 * DOS MODOS (nunca se cambia o borra nada sin que el dueño lo vea antes):
 *
 * 1) --envejecer [FECHA]   LA CURA QUE CONSERVA (recomendada, al instante).
 *    Mueve el createdAt de las altas a una fecha vieja (por defecto
 *    2020-01-01): se HUNDEN al final del orden y el home recupera a los
 *    productos viejos EN SEGUIDA (es dato, no código: sin deploy). Las altas
 *    QUEDAN GUARDADAS para completarlas luego desde el panel (categoría,
 *    precio, activar). Con fecha explícita:  --envejecer 2020-06-01
 *
 * 2) --borrar              ELIMINA las altas (ficha + variants). SOLO si un
 *    día decides no conservarlas; exige --desde/--hasta (o --todo).
 *
 * SIMULACIÓN POR DEFECTO: sin --aplicar solo MUESTRA lo que haría.
 *
 * CRITERIO DE BÚSQUEDA (huella exacta del importador):
 *   · active == false   · categoryId == ''   · basePriceUsd == 0
 * Protecciones: jamás toca un producto con vendidosTotal > 0; el listado se
 * revisa ANTES de aplicar; --borrar exige ventana de fechas.
 *
 * USOS (PowerShell, terminal PROPIA — NO en la de netlify dev):
 *   node functions\scripts\purgar-altas-import.mjs
 *        → lista las candidatas (simulación, no cambia nada)
 *   node functions\scripts\purgar-altas-import.mjs --envejecer
 *        → simula hundir las altas a 2020-01-01
 *   node functions\scripts\purgar-altas-import.mjs --envejecer --aplicar
 *        → LO APLICA (altas conservadas, home recuperado)
 *   node functions\scripts\purgar-altas-import.mjs --borrar --desde 2026-11-15 --aplicar
 *        → (opcional, otro día) borra solo las de esa fecha
 *
 * OPCIONES:
 *   --envejecer [FECHA]  Modo conservar: createdAt → FECHA (default 2020-01-01)
 *   --borrar             Modo eliminar (requiere --desde/--hasta o --todo)
 *   --aplicar            Ejecuta de verdad el modo elegido (sin esto, simulación)
 *   --desde FECHA        Solo createdAt ≥ esa fecha (YYYY-MM-DD)
 *   --hasta FECHA        Solo createdAt ≤ esa fecha (YYYY-MM-DD)
 *   --todo               En modo --borrar: ignora la ventana
 *
 * CREDENCIALES: FIREBASE_SERVICE_ACCOUNT del .env de la RAÍZ (JSON directo,
 * base64 o multilínea) o GOOGLE_APPLICATION_CREDENTIALS. Depende de
 * firebase-admin instalado en functions/node_modules.
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

/* ─────────────── credenciales (mismo patrón que purge-test-order) ───────── */

function parseEnvFile(raw) {
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

/* ─────────────────────────────── argumentos ─────────────────────────────── */

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const args = process.argv.slice(2);
const tiene = (f) => args.includes(f);
const valorDe = (f) => {
  const i = args.indexOf(f);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
};

const BORRAR = tiene('--borrar');
const APLICAR = tiene('--aplicar');
const TODO = tiene('--todo');
const desdeRaw = valorDe('--desde');
const hastaRaw = valorDe('--hasta');

// Modo: --borrar elimina; TODO lo demás es --envejecer (el conservador).
const modoEnvejecer = !BORRAR;
if (BORRAR && tiene('--envejecer')) fail('--envejecer y --borrar son modos excluyentes: elige uno.');

// Fecha destino del envejecimiento: la que siga a --envejecer si es YYYY-MM-DD.
let fechaDestinoRaw = '2020-01-01';
{
  const i = args.indexOf('--envejecer');
  const siguiente = i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
  if (siguiente && RE_FECHA.test(siguiente)) fechaDestinoRaw = siguiente;
}
const fechaDestino = new Date(`${fechaDestinoRaw}T12:00:00`).getTime();
if (!Number.isFinite(fechaDestino)) fail(`Fecha de destino inválida: ${fechaDestinoRaw}`);

const diaInicio = (s) => {
  const t = new Date(`${s}T00:00:00`).getTime();
  return Number.isFinite(t) ? t : null;
};
const diaFin = (s) => {
  const t = new Date(`${s}T23:59:59.999`).getTime();
  return Number.isFinite(t) ? t : null;
};

if (APLICAR && !modoEnvejecer && !TODO && !desdeRaw && !hastaRaw) {
  fail(`--borrar con --aplicar exige una ventana (--desde YYYY-MM-DD, --hasta o ambas) o --todo.
Primero corre el script SIN --aplicar y revisa el listado.`);
}

/* ──────────────────────────────── principal ─────────────────────────────── */

async function main() {
  line('SPOT 24 · Altas de importación (productos a medias del modo «Solo stock»)');
  line(`Raíz del proyecto: ${PROJECT_ROOT}`);
  line(
    modoEnvejecer
      ? `MODO: envejecer (CONSERVAR) → createdAt ${fmtDate(fechaDestino)}${APLICAR ? ' · APLICANDO' : ' · SIMULACIÓN'}`
      : `MODO: borrar${APLICAR ? ' · APLICANDO' : ' · SIMULACIÓN'}`,
  );
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

  // Consulta: la huella exacta del importador (3 igualdades — índices
  // automáticos de un campo, sin índice compuesto).
  const snap = await db
    .collection('products')
    .where('active', '==', false)
    .where('categoryId', '==', '')
    .where('basePriceUsd', '==', 0)
    .get();

  const desde = desdeRaw ? diaInicio(desdeRaw) : null;
  const hasta = hastaRaw ? diaFin(hastaRaw) : null;

  const candidatos = [];
  const fueraDeVentana = [];
  const protegidos = [];
  for (const d of snap.docs) {
    const p = d.data();
    const creado = Number(p.createdAt ?? 0);
    // Envejecer sin ventana explícita toma TODAS las candidatas (el modo
    // conservador no necesita acotar: solo cambia una fecha).
    const enVentana =
      (modoEnvejecer && !desdeRaw && !hastaRaw) ||
      TODO ||
      ((desde === null || creado >= desde) && (hasta === null || creado <= hasta));
    // Protección dura: con ventas jamás se toca (una alta no puede tenerlas,
    // pero un producto a medias creado a mano sí podría).
    if (Number(p.vendidosTotal ?? 0) > 0) {
      protegidos.push(d);
      continue;
    }
    if (enVentana) candidatos.push(d);
    else fueraDeVentana.push(d);
  }

  line(`Candidatas por la huella (inactivo + sin categoría + precio 0): ${snap.size}`);
  line(`· Dentro de la ventana:      ${candidatos.length}`);
  line(`· Fuera de la ventana:       ${fueraDeVentana.length} (no se tocan)`);
  line(`· Protegidas por ventas:     ${protegidos.length} (jamás se tocan)`);
  hr();

  const lista = (d, etiqueta) => {
    const p = d.data();
    line(
      `${etiqueta} ${String(p.code ?? '—').padEnd(16)} ${fmtDate(p.createdAt)} · ${String(p.name ?? '').slice(0, 50)}`,
    );
  };
  for (const d of candidatos.slice(0, 200)) lista(d, '·');
  if (candidatos.length > 200) line(`  … y ${candidatos.length - 200} más.`);
  for (const d of protegidos.slice(0, 20)) lista(d, '!');

  if (!candidatos.length) {
    line('\nNada que hacer con este criterio. ¿Otra fecha? Prueba --desde.');
    return;
  }

  if (!APLICAR) {
    hr();
    line('\nSIMULACIÓN — no se cambió ni borró nada. Revisa el listado de arriba.');
    line('Cuando esté claro, agrega --aplicar a la MISMA línea de comando.');
    return;
  }

  // ── Aplicación real, en lotes ≤ 450 ops. ──
  hr();
  if (modoEnvejecer) {
    line(`\nHundiendo ${candidatos.length} altas a ${fechaDestinoRaw} (createdAt + updatedAt)…`);
    let batch = db.batch();
    let ops = 0;
    let hechas = 0;
    let fallos = 0;
    const commit = async () => {
      if (!ops) return;
      try {
        await batch.commit();
        hechas += ops;
      } catch (e) {
        fallos += ops;
        console.error(`  ✖ Lote falló (${ops} ops): ${e?.message ?? e}`);
      }
      batch = db.batch();
      ops = 0;
    };
    for (const d of candidatos) {
      batch.update(d.ref, { createdAt: fechaDestino, updatedAt: Date.now() });
      ops += 1;
      if (ops >= 450) await commit();
    }
    await commit();
    hr();
    line(`\nListo: ${hechas} altas CONSERVADAS y hundidas a ${fechaDestinoRaw}${fallos ? ` · ${fallos} FALLARON (repite para reintentar)` : ''}.`);
    line('Refresca el home: «Recién llegados» vuelve a mostrar los productos de siempre.');
    line('Las altas siguen guardadas: complétalas desde el panel (categoría, precio, activar).');
    return;
  }

  line(`\nBorrando ${candidatos.length} altas (ficha + subcolección variants)…`);
  let batchB = db.batch();
  let opsB = 0;
  let borradas = 0;
  let fallosB = 0;
  const commitB = async () => {
    if (!opsB) return;
    try {
      await batchB.commit();
      borradas += opsB;
    } catch (e) {
      fallosB += opsB;
      console.error(`  ✖ Lote falló (${opsB} ops): ${e?.message ?? e}`);
    }
    batchB = db.batch();
    opsB = 0;
  };
  for (const d of candidatos) {
    const vars = await d.ref.collection('variants').limit(50).get();
    for (const v of vars.docs) {
      batchB.delete(v.ref);
      opsB += 1;
      if (opsB >= 450) await commitB();
    }
    batchB.delete(d.ref);
    opsB += 1;
    if (opsB >= 450) await commitB();
  }
  await commitB();

  hr();
  line(`\nListo: ${borradas} escrituras de borrado aplicadas${fallosB ? ` · ${fallosB} FALLARON (repite el comando para reintentar)` : ''}.`);
  line('El «Recién llegados» del home recupera a los productos viejos en el próximo refresh.');
}

main().catch((e) => fail(e?.message ?? String(e)));
