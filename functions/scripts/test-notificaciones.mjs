#!/usr/bin/env node
/**
 * SPOT 24 · PRUEBA REAL DEL SISTEMA DE NOTIFICACIONES (globos FCM) — herramienta local del dueño.
 *
 * Qué hace:
 *   1) AUDITORÍA (siempre, inofensiva — solo lecturas):
 *      · Censo global de tokens: collectionGroup('fcmTokens') → cuántos hay, de quién,
 *        qué dispositivo (userAgent), cuándo se registraron.
 *      · Personal (role admin/gerente/delivery/cajero): quién tiene tokens y quién NO
 *        (un staff sin tokens jamás recibirá el aviso de despacho ni el de pagos).
 *      · Cruce con las últimas órdenes: a qué uid quedó cada pedido y si ESE uid
 *        tiene tokens (los globos de estado van SOLO al uid dueño del pedido).
 *   2) ENVÍO REAL (solo con --send): replica la MISMA cadena 5.71/5.73-f y la
 *      MISMA estructura de ORDER_NOTIFICATIONS — doble vía 5.67 (data para el
 *      SW + webpush.notification nativa de respaldo, TTL 86400, tag compartida):
 *      · 1) PERSONAL delivery → «Tómalo desde el panel de despacho.» (CTA;
 *        aud dispatch; al tocarlo abre /admin/despacho; tag spot24-disp-SP-PRUEBA).
 *      · 2) PERSONAL gerente/admin/cajero → «Disponible en el panel de despacho.»
 *        (informativo 5.71 — el cajero se suma; mismo aud dispatch y misma tag).
 *      · 3) PAGOS cajero/gerente/admin → «Pago por verificar» (5.71; aud pagos;
 *        al tocarlo abre /admin/pagos; tag spot24-pagos-SP-PRUEBA).
 *      · 4) CLIENTE → roles gerente/admin (gente del negocio, NUNCA clientes reales):
 *        «Pago confirmado» (status pagado; abre /pedidos;
 *        tag spot24-order-SP-PRUEBA-pagado — 5.73-f: tag por pedido+estado).
 *      · 5) CLIENTE FOCALIZADO (--cliente <prefijo-uid>): globo de estado de
 *        PRUEBA a TODOS los dispositivos de ESE usuario (p. ej. el teléfono
 *        de un cliente del negocio que «no recibe nada»). Reporta POR TOKEN:
 *        ✔ FCM lo aceptó / ✖ código de error → el veredicto exacto por
 *        dispositivo: token vivo o muerto, sin adivinar.
 *   3) PODA (solo con --send --yes): borra los docs de tokens muertos
 *      (registration-token-not-registered / invalid-registration-token) — exactamente
 *      la limpieza que hace el sistema en producción tras cada envío.
 *
 * USOS (PowerShell, en una terminal PROPIA — NO en la de netlify dev):
 *   node functions\scripts\test-notificaciones.mjs               → AUDITORÍA (no envía nada)
 *   node functions\scripts\test-notificaciones.mjs --send        → envía la cadena del personal
 *   node functions\scripts\test-notificaciones.mjs --send --yes  → envía + poda tokens muertos
 *   node functions\scripts\test-notificaciones.mjs --cliente 8C3bgcmXHB --send --solo
 *       → SOLO un globo de PRUEBA a los dispositivos de ese uid (sin ráfaga
 *         al personal) — LA prueba del teléfono de un cliente concreto.
 *   node functions\scripts\test-notificaciones.mjs --cliente 8C3bgcmXHB
 *       → auditoría + ficha de ESE usuario (todos sus tokens y dispositivos)
 *
 * CREDENCIALES: usa FIREBASE_SERVICE_ACCOUNT del .env de la RAÍZ del proyecto
 * (el mismo que usa netlify dev; acepta JSON directo, base64 o JSON multilínea)
 * o GOOGLE_APPLICATION_CREDENTIALS (ruta a un JSON de cuenta de servicio).
 * Depende de firebase-admin ya instalado en functions/node_modules.
 *
 * LECTURAS/ESCRITURAS: la auditoría es read-only. Con --send no se escribe NADA en
 * Firestore salvo la poda de tokens muertos (y solo con --yes). El envío es FCM puro.
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

const fmtAge = (ms) => {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const days = Math.floor((Date.now() - n) / 86400000);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  return `hace ${months} mes${months > 1 ? 'es' : ''}`;
};

const short = (s, n = 40) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** Resumen legible del dispositivo desde el userAgent del registro. */
function deviceLabel(ua) {
  const t = String(ua ?? '');
  if (!t) return '(sin userAgent)';
  const os = /android/i.test(t) ? 'Android' : /iphone|ipad|ios/i.test(t) ? 'iOS' : /windows/i.test(t) ? 'Windows' : /mac os/i.test(t) ? 'macOS' : /cros/i.test(t) ? 'ChromeOS' : /linux/i.test(t) ? 'Linux' : '?';
  const br = /edg\//i.test(t) ? 'Edge' : /opr\//i.test(t) ? 'Opera' : /firefox/i.test(t) ? 'Firefox' : /chrome|crios/i.test(t) ? 'Chrome' : /safari/i.test(t) ? 'Safari' : '?';
  return `${br} · ${os}`;
}

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
const opts = { send: false, yes: false, help: false, cliente: '', solo: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--send') opts.send = true;
  else if (a === '--yes') opts.yes = true;
  else if (a === '--solo') opts.solo = true;
  else if (a === '--cliente') {
    opts.cliente = argv[++i] ?? '';
    if (!opts.cliente) fail('--cliente requiere un prefijo de uid (p. ej. --cliente 8C3bgcmXHB).');
  } else if (a === '-h' || a === '--help') opts.help = true;
  else fail(`Argumento no reconocido: ${a} (usa --help)`);
}

if (opts.help) {
  line('SPOT 24 · Prueba real de notificaciones (globos FCM)');
  hr();
  line('  node functions\\scripts\\test-notificaciones.mjs               auditoría (no envía)');
  line('  node functions\\scripts\\test-notificaciones.mjs --send        envía la cadena del personal');
  line('  node functions\\scripts\\test-notificaciones.mjs --send --yes  envía + poda tokens muertos');
  line('  --cliente <prefijo-uid>  auditoría + globo de PRUEBA a ese usuario (con --send)');
  line('  --solo                   con --send + --cliente: SOLO ese usuario (sin ráfaga al personal)');
  process.exit(0);
}

if (opts.yes && !opts.send) {
  fail('--yes solo tiene efecto junto a --send (la auditoría nunca escribe).');
}
if (opts.solo && !opts.send) {
  fail('--solo solo tiene sentido con --send (la auditoría nunca envía nada).');
}
if (opts.solo && !opts.cliente) {
  fail('--solo requiere --cliente <prefijo-uid> (define a quién focalizar).');
}

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

/* ───────────────────────── inicialización admin ───────────────────────── */

async function main() {
  line('SPOT 24 · Prueba real del sistema de notificaciones');
  line(`Raíz del proyecto: ${PROJECT_ROOT}`);
  const modoBase = opts.send ? (opts.yes ? 'ENVÍO REAL + poda de tokens muertos' : 'ENVÍO REAL (sin poda)') : 'AUDITORÍA (solo lecturas)';
  line(`Modo: ${opts.solo ? 'ENVÍO SOLO AL CLIENTE FOCALIZADO (--solo) · ' : ''}${modoBase}${opts.cliente ? ` · FOCO: ${opts.cliente}` : ''}`);

  const cred = loadServiceAccount();
  if (!cred) {
    fail(`No encontré credenciales de servicio.
   Esperaba FIREBASE_SERVICE_ACCOUNT en ${path.join(PROJECT_ROOT, '.env')}
   (JSON directo, base64 o multilínea) o GOOGLE_APPLICATION_CREDENTIALS.`);
  }
  line(`Credenciales: ${cred.via} · proyecto: ${cred.sa.project_id}`);
  hr();

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
  const messaging = admin.messaging();

  /* ── 1) Censo global de tokens (collectionGroup) ── */

  const tokensSnap = await db.collectionGroup('fcmTokens').limit(200).get();
  const tokenDocs = tokensSnap.docs.map((d) => {
    // users/{uid}/fcmTokens/{hash}
    const parts = d.ref.path.split('/');
    return { uid: parts[1] ?? '?', hash: parts[3] ?? d.id, data: d.data(), ref: d.ref };
  });

  const uidsWithTokens = [...new Set(tokenDocs.map((t) => t.uid))];
  const userDocs = new Map();
  for (const uid of uidsWithTokens) {
    const snap = await db.collection('users').doc(uid).get();
    if (snap.exists) userDocs.set(uid, snap.data() ?? {});
  }

  line('');
  line('CENSO DE TOKENS FCM (dispositivos con el toggle activado alguna vez)');
  if (tokenDocs.length === 0) {
    line('  ✖ 0 tokens en TODO el proyecto.');
    line('    Nadie puede recibir globos: ningún dispositivo ha activado');
    line('    «Activar notificaciones» (o el registro falló — p. ej. por la');
    line('    red/DNS que no resuelve googleapis.com). Actívalo en Mi Cuenta.');
  } else {
    for (const t of tokenDocs) {
      const u = userDocs.get(t.uid);
      const role = String(u?.['role'] ?? '(¿usuario borrado?)');
      const name = String(u?.['name'] ?? '').split(/\s+/)[0] || '(sin nombre)';
      line(`  · ${t.uid.slice(0, 10)}…  ${role.padEnd(10)} ${name.padEnd(14)} ${deviceLabel(t.data?.['userAgent']).padEnd(16)} creado ${fmtDate(t.data?.['createdAt'])} (${fmtAge(t.data?.['createdAt'])})`);
    }
  }

  /* ── Foco opcional (--cliente <prefijo-uid>) ──
   * Resuelve el prefijo del censo (el que imprime la auditoría) contra los
   * uids que HOY tienen tokens. Nunca envía nada por sí solo: solo define el
   * foco de la auditoría extendida y (con --send) del grupo 5. */
  let focusUids = [];
  if (opts.cliente) {
    const pref = String(opts.cliente).trim();
    if (pref.length < 6) {
      fail(`--cliente ${pref}: prefijo demasiado corto — pasa al menos 6 caracteres
   (el censo muestra los primeros 10 del uid; cópialos tal cual).`);
    }
    const matches = uidsWithTokens.filter((u) => u.startsWith(pref));
    if (matches.length === 0) {
      line('');
      line(`✖ --cliente ${pref}: ningún usuario con tokens empieza así.`);
      line('  UIDs disponibles (primeros 10 caracteres):');
      for (const u of uidsWithTokens) {
        const n = String(userDocs.get(u)?.['name'] ?? '').split(/\s+/)[0] || '(sin nombre)';
        line(`  · ${u.slice(0, 10)}…  ${n}`);
      }
      process.exit(1);
    }
    if (matches.length > 1) {
      line('');
      line(`✖ --cliente ${pref}: coincide con ${matches.length} usuarios. Pasa más caracteres:`);
      for (const u of matches) {
        const n = String(userDocs.get(u)?.['name'] ?? '').split(/\s+/)[0] || '(sin nombre)';
        line(`  · ${u.slice(0, 10)}…  ${n}`);
      }
      process.exit(1);
    }
    focusUids = matches;
  }

  /* ── 2) Personal: quién tiene tokens y quién no ── */

  const staffSnap = await db.collection('users').where('role', 'in', ['admin', 'gerente', 'delivery', 'cajero']).get();
  const staff = staffSnap.docs.map((d) => ({ uid: d.id, data: d.data() ?? {} }));
  const tokensByUid = new Map();
  for (const t of tokenDocs) {
    if (!tokensByUid.has(t.uid)) tokensByUid.set(t.uid, []);
    tokensByUid.get(t.uid).push(t);
  }

  line('');
  line('PERSONAL (staff) — a quiénes les corresponden los avisos de despacho y pagos');
  if (staff.length === 0) {
    line('  (ningún usuario con role admin/gerente/delivery/cajero)');
  }
  for (const s of staff) {
    const role = String(s.data['role'] ?? '?');
    const name = String(s.data['name'] ?? '').split(/\s+/)[0] || '(sin nombre)';
    const toks = tokensByUid.get(s.uid) ?? [];
    const mark = toks.length > 0 ? '✔' : '✖ SIN TOKENS → no recibirá globos';
    line(`  ${mark.padEnd(34)} ${role.padEnd(10)} ${name.padEnd(14)} tokens: ${toks.length}`);
  }

  /* ── 3) Cruce con las últimas órdenes ── */

  const ordersSnap = await db.collection('orders').orderBy('createdAt', 'desc').limit(10).get();
  line('');
  line('ÚLTIMAS ÓRDENES — los globos de estado van SOLO al uid dueño del pedido');
  if (ordersSnap.empty) line('  (no hay órdenes)');
  for (const d of ordersSnap.docs) {
    const o = d.data();
    const uid = String(o['uid'] ?? '?');
    const toks = tokensByUid.get(uid) ?? [];
    const mark = toks.length > 0 ? `✔ cliente tiene ${toks.length} token(s)` : '✖ cliente SIN tokens → no recibirá globos';
    line(`  ${String(o['code'] ?? '(sin código)').padEnd(18)} ${String(STATUS_ES[o['status']] ?? o['status'] ?? '?').padEnd(16)} ${fmtDate(o['createdAt'])}`);
    line(`    uid ${uid.slice(0, 10)}… → ${mark}`);
  }

  /* ── 3b) Ficha del cliente focalizado (--cliente) ── */

  if (focusUids.length > 0) {
    const uid = focusUids[0];
    const u = userDocs.get(uid) ?? {};
    const toks = tokensByUid.get(uid) ?? [];
    line('');
    line(`FOCO EN CLIENTE — ${String(u['name'] ?? '(sin nombre)')} · role: ${String(u['role'] ?? '?')} · uid: ${uid}`);
    if (toks.length === 0) {
      line('  ✖ SIN tokens registrados — nada que probar en este usuario.');
    }
    for (const t of toks) {
      line(`  · ${deviceLabel(t.data?.['userAgent']).padEnd(16)} creado ${fmtDate(t.data?.['createdAt'])} (${fmtAge(t.data?.['createdAt'])})`);
      line(`    doc: users/${uid}/fcmTokens/${t.hash}`);
    }
    line('  Con --send, ESTE usuario recibe UN globo de estado de PRUEBA en TODOS');
    line('  sus dispositivos y el reporte sale POR TOKEN (✔/✖ + código de error).');
  }

  /* ── 4) Envío real (solo con --send) ── */

  if (!opts.send) {
    hr();
    line('AUDITORÍA terminada — no se envió nada (modo sin --send).');
    line('Para probar la entrega real en tus dispositivos, ejecuta con --send.');
    return;
  }

  const DEAD_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
  ]);

  /* 5.71/5.73-f · Espejo EXACTO de notifications.ts — tag de apilado por
   * familia (idéntico al buildTag del SW) y destino al tocar (idéntico al
   * buildClickUrl del SW). Con la misma tag, la vía SW y la nativa 5.67 se
   * reemplazan entre sí, jamás se duplican.
   * 5.73-f · los globos de estado del cliente apilan por pedido+estado: cada
   * hito es un globo NUEVO que SUENA y PERMANECE en la cortina. */
  const buildTag = (d) => {
    if (d['aud'] === 'dispatch') return `spot24-disp-${d['orderCode'] ?? ''}`;
    if (d['aud'] === 'pagos') return `spot24-pagos-${d['orderCode'] ?? ''}`;
    return `spot24-order-${d['orderCode'] ?? ''}-${d['status'] ?? ''}`;
  };
  const buildClickUrl = (d) => {
    if (d['aud'] === 'dispatch') return '/admin/despacho';
    if (d['aud'] === 'pagos') return '/admin/pagos';
    return '/pedidos';
  };

  const sendGroup = async (label, toks, title, body, data) => {
    line('');
    line(`ENVÍO → ${label} (${toks.length} token(s))`);
    if (toks.length === 0) {
      line('  (sin tokens: nada que enviar — este grupo no recibirá nada)');
      return { ok: 0, dead: [], errs: 0 };
    }
    // Doble vía 5.67 (igual que sendAndCleanup): title/body/clickUrl en data
    // (vía SW, control total) + globo NATIVO de respaldo (icon/badge/tag/
    // renotify) para que suene aunque el SW no despierte.
    const batch = await messaging.sendEachForMulticast({
      tokens: toks.map((t) => String(t.data?.['token'] ?? '')),
      data: { ...data, clickUrl: buildClickUrl(data), title, body },
      webpush: {
        headers: { TTL: '86400', Urgency: 'high' },
        notification: {
          title,
          body,
          icon: '/icons/icon-192.png',
          badge: '/icons/badge-96.png',
          tag: buildTag(data),
          renotify: true,
        },
      },
    });
    let ok = 0;
    let errs = 0;
    const dead = [];
    batch.responses.forEach((r, i) => {
      const t = toks[i];
      const dev = deviceLabel(t.data?.['userAgent']);
      const who = `${t.uid.slice(0, 10)}… (${dev})`;
      if (r.success) {
        ok += 1;
        line(`  ✔ FCM aceptó → ${who}`);
      } else {
        errs += 1;
        const code = String(r.error?.code ?? '?');
        if (DEAD_CODES.has(code)) dead.push(t);
        line(`  ✖ FCM rechazó → ${who} · ${code}`);
      }
    });
    return { ok, dead, errs };
  };

  // 5.71 · La MISMA cadena que producción, en el MISMO orden: primero el CTA
  // del delivery, detrás el informativo del personal (con el cajero), detrás
  // «Pago por verificar» al cajero (con gerencia/admin de respaldo) y al
  // final el globo de cliente. Sin ráfagas: orden predecible.
  const CODE = 'SP-PRUEBA';
  const ZONE = 'Prueba';
  const results = { ok: 0, errs: 0, dead: [] };

  const dispatchData = { aud: 'dispatch', status: 'preparado', orderCode: CODE, zone: ZONE };
  const deliveryToks = staff.filter((s) => String(s.data['role'] ?? '') === 'delivery').flatMap((s) => tokensByUid.get(s.uid) ?? []);
  const staffToks = staff.filter((s) => ['gerente', 'admin', 'cajero'].includes(String(s.data['role'] ?? ''))).flatMap((s) => tokensByUid.get(s.uid) ?? []);
  const pagosToks = staff.filter((s) => ['cajero', 'gerente', 'admin'].includes(String(s.data['role'] ?? ''))).flatMap((s) => tokensByUid.get(s.uid) ?? []);
  const clientToks = staff.filter((s) => ['gerente', 'admin'].includes(String(s.data['role'] ?? ''))).flatMap((s) => tokensByUid.get(s.uid) ?? []);

  // 1) delivery — llamado a la acción (5.28/5.71).  Con --solo se salta:
  // la prueba focalizada NO debe bombardear al personal en cada reintento.
  let rDelivery = { ok: 0, dead: [], errs: 0 };
  let rStaff = { ok: 0, dead: [], errs: 0 };
  let rPagos = { ok: 0, dead: [], errs: 0 };
  let rClient = { ok: 0, dead: [], errs: 0 };
  if (!opts.solo) {
    rDelivery = await sendGroup(
      'PERSONAL · delivery (CTA «Tómalo»)',
      deliveryToks,
      'SPOT 24 · Pedido listo para salir',
      `PRUEBA · ${CODE} · Zona ${ZONE}. Tómalo desde el panel de despacho.`,
      dispatchData,
    );

    // 2) gerente/admin/cajero — informativo de despacho (5.71 suma al cajero).
    rStaff = await sendGroup(
      'PERSONAL · gerente/admin/cajero (informativo de despacho)',
      staffToks,
      'SPOT 24 · Pedido listo para salir',
      `PRUEBA · ${CODE} · Zona ${ZONE}. Disponible en el panel de despacho.`,
      dispatchData,
    );

    // 3) cajero/gerente/admin — «Pago por verificar» (5.71).
    rPagos = await sendGroup(
      'PAGOS · cajero/gerente/admin («Pago por verificar»)',
      pagosToks,
      'SPOT 24 · Pago por verificar',
      `PRUEBA · ${CODE}. Revísalo en el panel de pagos.`,
      { aud: 'pagos', status: 'en_verificacion', orderCode: CODE },
    );

    // 4) cliente (gente del negocio) — globo de estado de pedido.
    rClient = await sendGroup(
      'CLIENTE · estado de pedido (gerente/admin)',
      clientToks,
      'SPOT 24 · Pago confirmado',
      `PRUEBA · Tu pedido entra al pit stop — globo de cliente verificado. (${CODE})`,
      { status: 'pagado', orderCode: CODE },
    );
  }

  // 5) CLIENTE FOCALIZADO (--cliente <prefijo-uid>): el veredicto del
  // teléfono «que no recibe nada». Un globo de estado de PRUEBA a TODOS los
  // dispositivos de ese uid; el reporte por token decide: token vivo o muerto.
  // NUNCA toca a un cliente real sin este flag explícito del dueño.
  let rFocus = null;
  if (focusUids.length > 0) {
    const focusToks = tokenDocs.filter((t) => focusUids.includes(t.uid));
    const etiqueta = focusUids
      .map((u) => {
        const n = String(userDocs.get(u)?.['name'] ?? '').split(/\s+/)[0] || '(sin nombre)';
        return `${n} (${u.slice(0, 10)}…)`;
      })
      .join(', ');
    rFocus = await sendGroup(
      `CLIENTE FOCALIZADO · ${etiqueta} — verificación por dispositivo`,
      focusToks,
      'SPOT 24 · Pago confirmado',
      `PRUEBA de dispositivo · Tu pedido entra al pit stop. (${CODE})`,
      { status: 'pagado', orderCode: CODE },
    );
  }

  for (const r of [rDelivery, rStaff, rPagos, rClient, rFocus]) {
    if (!r) continue;
    results.ok += r.ok;
    results.errs += r.errs;
    results.dead.push(...r.dead);
  }

  /* ── 5) Poda de tokens muertos (igual que hace el sistema tras cada envío) ── */

  hr();
  line(`RESULTADO DEL ENVÍO: ${results.ok} aceptado(s) por FCM · ${results.errs} rechazado(s)${opts.solo ? ' (SOLO cliente focalizado)' : ''}`);
  if (results.dead.length > 0) {
    line('');
    line('TOKENS MUERTOS (el dispositivo ya no los reconoce):');
    for (const t of results.dead) {
      line(`  · users/${t.uid}/fcmTokens/${t.hash} (${deviceLabel(t.data?.['userAgent'])})`);
    }
    if (opts.yes) {
      await Promise.all(results.dead.map((t) => t.ref.delete()));
      line(`  ✔ PODADOS: ${results.dead.length} doc(s) eliminados (limpieza idéntica a producción).`);
    } else {
      line('  Simulación: NO se borró nada. Repite con --send --yes para podarlos.');
    }
  }

  line('');
  line('CÓMO LEER EL RESULTADO');
  line('  · ✔ aceptado por FCM = el globo debe sonar AHORA en ese dispositivo');
  line('    (si estaba apagado/sin señal: FCM lo retiene hasta 24 h por el TTL).');
  line('  · ✔ aceptado PERO no ves el globo → revisa en ese dispositivo:');
  line('      1) permiso de notificaciones del navegador (candado → Permitir),');
  line('      2) que la red resuelva googleapis.com (tu DNS de la oficina falló hoy),');
  line('      3) optimización de batería de Android (excluye Chrome de ahorro extremo).');
  line('  · Los globos de prueba al tocarlos abren: despacho → /admin/despacho,');
  line('    pagos → /admin/pagos, cliente → /pedidos (misma ruta que los reales).');
  line('  · FOCO (--cliente): ✔ aceptó en el teléfono y NO sonó → el token vive y');
  line('    el bloqueo está en el teléfono (notificaciones de Chrome en Ajustes de');
  line('    Android, ahorro de batería, No molestar). ✖ rechazó → token muerto:');
  line('    en ese teléfono, Mi Cuenta → desactivar y reactivar notificaciones.');
  hr();
  line('PRUEBA COMPLETADA.');
}

main().catch((e) => fail(e?.message ?? String(e)));