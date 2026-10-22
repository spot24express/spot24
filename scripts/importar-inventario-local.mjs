// scripts/importar-inventario-local-entry.ts
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import admin7 from "firebase-admin";

// spot24/functions/src/importInventory.ts
import admin5 from "firebase-admin";
import { HttpsError as HttpsError5, onCall as onCall2 } from "firebase-functions/v2/https";

// spot24/functions/src/lib/extraerPdf.ts
import { HttpsError } from "firebase-functions/v2/https";
var MAX_PDF_BYTES = 4 * 1024 * 1024;
var MAX_PAGINAS = 400;
async function cargarWorkerPdfjs() {
  const g = globalThis;
  if (g["pdfjsWorker"]) return;
  const mod = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
  const handler = mod?.WorkerMessageHandler ?? mod?.default?.WorkerMessageHandler;
  if (handler) g["pdfjsWorker"] = { WorkerMessageHandler: handler };
}
function causaDe(e) {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return msg.replace(/\s+/g, " ").trim().slice(0, 160) || "desconocida";
}
function mensajePaqueteAusente(e) {
  const codigo = e?.code ?? "";
  const texto = e instanceof Error ? e.message : String(e);
  if (codigo === "ERR_MODULE_NOT_FOUND" || /Cannot find package/i.test(texto)) {
    return `Falta el paquete del lector de PDF en tu instalaci\xF3n local (${causaDe(e)}). En la terminal, detente en la carpeta del proyecto (la que contiene package.json, NO dentro de functions/) y ejecuta: npm install. Despu\xE9s reinicia netlify dev.`;
  }
  return null;
}
async function extraerItemsPdf(base64) {
  let bytes;
  try {
    bytes = Buffer.from(base64, "base64");
  } catch {
    throw new HttpsError("invalid-argument", "El PDF lleg\xF3 corrupto (base64 inv\xE1lido).");
  }
  if (bytes.length < 100) {
    throw new HttpsError("invalid-argument", "El PDF lleg\xF3 vac\xEDo o incompleto.");
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new HttpsError(
      "invalid-argument",
      "El PDF pesa m\xE1s de 4 MB. Exporta el reporte con menos p\xE1ginas o compr\xEDmelo."
    );
  }
  let paginas;
  let docAbierto = null;
  try {
    await cargarWorkerPdfjs();
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false }).promise;
    docAbierto = doc;
    if (doc.numPages > MAX_PAGINAS) {
      throw new HttpsError("invalid-argument", "El PDF tiene m\xE1s de 400 p\xE1ginas.");
    }
    paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      let limpios;
      try {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        const items = tc.items;
        limpios = [];
        for (const it of items) {
          const s = String(it.str ?? "");
          if (!s.trim()) continue;
          limpios.push({
            s,
            x: Math.round((it.transform?.[4] ?? 0) * 10) / 10,
            y: Math.round((it.transform?.[5] ?? 0) * 10) / 10,
            w: Math.round((it.width ?? 0) * 10) / 10
          });
        }
      } catch (e) {
        throw new Error(`fall\xF3 la lectura de la p\xE1gina ${p} de ${doc.numPages} (${causaDe(e)})`);
      }
      paginas.push(limpios);
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error("[fn-importInventory] pdfjs no pudo leer el PDF:", e);
    const paquete = mensajePaqueteAusente(e);
    if (paquete) throw new HttpsError("invalid-argument", paquete);
    const nombre = e?.name ?? "";
    if (nombre === "PasswordException") {
      throw new HttpsError(
        "invalid-argument",
        "El PDF est\xE1 protegido con contrase\xF1a: exporta el reporte del sistema SIN protecci\xF3n e int\xE9ntalo de nuevo."
      );
    }
    if (nombre === "InvalidPDFException") {
      throw new HttpsError(
        "invalid-argument",
        `El PDF lleg\xF3 corrupto o incompleto (${causaDe(e)}): vuelve a exportar el reporte y s\xFAbelo de nuevo.`
      );
    }
    throw new HttpsError(
      "invalid-argument",
      `No se pudo leer el PDF (motivo t\xE9cnico: ${causaDe(e)}). Verifica que sea el reporte \xABInventario disponible\xBB de tu sistema.`
    );
  } finally {
    try {
      await docAbierto?.destroy();
    } catch {
    }
  }
  return paginas;
}

// spot24/functions/src/lib/ctx.ts
import admin from "firebase-admin";
import { HttpsError as HttpsError2 } from "firebase-functions/v2/https";
var adminApp = null;
function getAdminApp() {
  if (adminApp) return adminApp;
  const existing = admin.apps.length > 0 ? admin.app() : null;
  if (existing) {
    adminApp = existing;
    return adminApp;
  }
  const raw = process.env["FIREBASE_SERVICE_ACCOUNT"];
  if (!raw) {
    if (process.env["NETLIFY"] === "true") {
      throw new HttpsError2(
        "failed-precondition",
        "FIREBASE_SERVICE_ACCOUNT no configurada: Netlify \u2192 Site configuration \u2192 Environment variables \u2192 a\xF1ade el JSON completo de la clave privada de la cuenta de servicio (o su base64) \u2192 guarda y redeploy."
      );
    }
    const cfRuntime = Boolean(
      process.env["K_SERVICE"] || process.env["FUNCTION_TARGET"] || process.env["FUNCTION_NAME"]
    );
    if (!cfRuntime) {
      throw new HttpsError2(
        "failed-precondition",
        "FIREBASE_SERVICE_ACCOUNT no configurada en tu PC: copia .env.example como .env en la ra\xEDz del repo, pega ah\xED el JSON completo de la clave privada de la cuenta de servicio (los mismos valores que tienes en el panel de Netlify) y reinicia netlify dev."
      );
    }
    adminApp = admin.initializeApp();
    return adminApp;
  }
  const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  let sa;
  try {
    sa = JSON.parse(json);
  } catch {
    throw new HttpsError2(
      "failed-precondition",
      "FIREBASE_SERVICE_ACCOUNT est\xE1 mal formada: pega el JSON COMPLETO de la clave privada (o su base64), sin cortes ni saltos a\xF1adidos. Guarda y redeploy."
    );
  }
  adminApp = admin.initializeApp({ credential: admin.credential.cert(sa) });
  return adminApp;
}

// spot24/functions/src/lib/inventarioPdf.ts
var ANCLAS = [
  "Codigo",
  "Descripcion",
  "Existencia",
  "Pedidos",
  "Disponible",
  "Costo",
  "Costo Total"
];
var TOL_Y = 3;
var MAX_NOMBRE = 120;
var MAX_CODIGO = 40;
function filasDeItems(items) {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos = [];
  for (const it of orden) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo[0].y - it.y) <= TOL_Y) ultimo.push(it);
    else grupos.push([it]);
  }
  return grupos.map((g) => [...g].sort((a, b) => a.x - b.x));
}
function limitesDeCabecera(fila) {
  const xs = ANCLAS.map(() => void 0);
  for (const it of fila) {
    const i = ANCLAS.findIndex((a) => it.s === a);
    if (i >= 0 && xs[i] === void 0) xs[i] = it.x;
  }
  if (xs.some((v) => v === void 0)) return null;
  const limites = [];
  for (let i = 0; i < ANCLAS.length - 1; i++) {
    const a = xs[i];
    const b = xs[i + 1];
    limites.push((a + b) / 2);
  }
  limites.push(Number.POSITIVE_INFINITY);
  return limites;
}
function colDe(x, limites) {
  for (let i = 0; i < limites.length; i++) {
    if (x < limites[i]) return i;
  }
  return limites.length - 1;
}
function numeroVe(s) {
  const t = s.trim().replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  const tieneC = t.includes(",");
  const tieneD = t.includes(".");
  let out = t;
  if (tieneC && tieneD) {
    const dec = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
    out = dec === "," ? t.replace(/\./g, "").replace(/,/g, ".") : t.replace(/,/g, "");
  } else if (tieneC && /,\d{2}$/.test(t)) {
    out = t.replace(/,/g, ".");
  } else if (tieneC) {
    out = t.replace(/,/g, "");
  }
  const n = Number(out);
  return Number.isFinite(n) ? n : NaN;
}
var RE_CODIGO = /^[0-9][A-Z0-9./-]{1,}$/;
var RE_NUM_LIMPIO = /^\d[\d.,]*$/;
function parseInventario(paginas) {
  const filas = [];
  const porCodigo = /* @__PURE__ */ new Map();
  const problemas = [];
  let limites = null;
  let ultimo = -1;
  const celda = (items) => items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
  for (const items of paginas) {
    for (const fila of filasDeItems(items)) {
      const cab = limitesDeCabecera(fila);
      if (cab) {
        limites = cab;
        continue;
      }
      if (!limites) continue;
      const celdas = Array.from({ length: ANCLAS.length }, () => []);
      for (const it of fila) celdas[colDe(it.x, limites)].push(it);
      const codigo = celdas[0].length ? celda(celdas[0]).toUpperCase() : "";
      const desc = celdas[1].length ? celda(celdas[1]) : "";
      const existTxt = celdas[2].filter((i) => RE_NUM_LIMPIO.test(i.s.trim()));
      const costoTxt = celdas[5].filter((i) => RE_NUM_LIMPIO.test(i.s.trim()));
      if (codigo) {
        if (!RE_CODIGO.test(codigo)) continue;
        if (porCodigo.has(codigo)) {
          const existencia2 = existTxt[0] !== void 0 ? numeroVe(existTxt[0].s) : NaN;
          const costo2 = costoTxt[0] !== void 0 ? numeroVe(costoTxt[0].s) : NaN;
          const previa = porCodigo.get(codigo);
          if (!Number.isFinite(existencia2) || !Number.isFinite(costo2)) {
            problemas.push(`${codigo}: valores ilegibles, se conserva la primera aparici\xF3n.`);
            continue;
          }
          previa.descripcion = desc.slice(0, MAX_NOMBRE);
          previa.existencia = Math.max(0, Math.round(existencia2));
          previa.costo = Math.round(costo2 * 100) / 100;
          ultimo = filas.indexOf(previa);
          continue;
        }
        if (desc.length < 3) {
          problemas.push(`${codigo}: sin descripci\xF3n legible, se omiti\xF3.`);
          continue;
        }
        const existencia = existTxt[0] !== void 0 ? numeroVe(existTxt[0].s) : NaN;
        const costo = costoTxt[0] !== void 0 ? numeroVe(costoTxt[0].s) : NaN;
        if (!Number.isFinite(existencia) || !Number.isFinite(costo)) {
          problemas.push(`${codigo}: existencia o costo ilegibles, se omiti\xF3.`);
          continue;
        }
        const nueva = {
          codigo: codigo.slice(0, MAX_CODIGO),
          descripcion: desc.slice(0, MAX_NOMBRE),
          existencia: Math.max(0, Math.round(existencia)),
          costo: Math.round(costo * 100) / 100
        };
        filas.push(nueva);
        porCodigo.set(codigo, nueva);
        ultimo = filas.length - 1;
        continue;
      }
      if (ultimo >= 0 && desc && !desc.startsWith("Completa") && !desc.startsWith("REPORTE")) {
        const actual = filas[ultimo];
        if (actual.descripcion.length < MAX_NOMBRE) {
          actual.descripcion = `${actual.descripcion} ${desc}`.slice(0, MAX_NOMBRE).replace(/\s+/g, " ").trim();
        }
      }
    }
  }
  return { filas, problemas };
}
var ANCLAS_LISTA = [
  { re: /^C[oó]digo$/i, maxLen: 20 },
  { re: /^Descripci[oó]n$/i, maxLen: 20 },
  { re: /Existencia/i, maxLen: 40 },
  { re: /Precio USD sin/i, maxLen: 20 },
  { re: /Precio USD con/i, maxLen: 20 }
];
var RE_CODIGO_LISTA = /^[A-Z0-9][A-Z0-9./-]{1,}$/;
function primerNumero(t) {
  const m = t.match(/(\d[\d.,]*)/);
  return m ? numeroVe(m[1]) : NaN;
}
function parseListaLimpia(paginas) {
  const filas = [];
  const problemas = [];
  const porCodigo = /* @__PURE__ */ new Map();
  let limites = null;
  let ultimo = -1;
  const celda = (items) => items.map((i) => i.s).join(" ").replace(/\s+/g, " ").trim();
  for (const items of paginas) {
    const filasPagina = filasDeItems(items);
    const esCabecera = /* @__PURE__ */ new Set();
    for (let fi = 0; fi < filasPagina.length; fi++) {
      const fila = filasPagina[fi];
      if (!fila.some((i) => /^C[oó]digo$/i.test(i.s) && i.s.length <= 20)) continue;
      if (!fila.some((i) => /^Descripci[oó]n$/i.test(i.s) && i.s.length <= 20)) continue;
      const yAncla = fila[0].y;
      const zona = [...fila];
      filasPagina.forEach((f, idx) => {
        if (idx !== fi && Math.abs(f[0].y - yAncla) <= 10) {
          zona.push(...f);
          esCabecera.add(idx);
        }
      });
      const xs = ANCLAS_LISTA.map(() => void 0);
      for (const it of zona) {
        ANCLAS_LISTA.forEach((ancla, i) => {
          if (xs[i] === void 0 && ancla.re.test(it.s) && it.s.length <= ancla.maxLen) {
            xs[i] = { inicio: it.x, fin: it.x + (it.w > 0 ? it.w : it.s.length * 5.5) };
          }
        });
      }
      if (xs.some((v) => v === void 0)) continue;
      limites = [];
      for (let i = 0; i < xs.length - 1; i++) {
        limites.push((xs[i].fin + xs[i + 1].inicio) / 2);
      }
      limites.push(Number.POSITIVE_INFINITY);
      esCabecera.add(fi);
    }
    if (!limites) continue;
    for (let fi = 0; fi < filasPagina.length; fi++) {
      if (esCabecera.has(fi)) continue;
      const fila = filasPagina[fi];
      const celdas = Array.from({ length: ANCLAS_LISTA.length }, () => []);
      for (const it of fila) {
        let col = ANCLAS_LISTA.length - 1;
        for (let i = 0; i < limites.length; i++) {
          if (it.x < limites[i]) {
            col = i;
            break;
          }
        }
        celdas[col].push(it);
      }
      const codigo = celda(celdas[0]).replace(/\s+/g, "").toUpperCase();
      const desc = celda(celdas[1]);
      if (!codigo) {
        if (ultimo >= 0 && desc && !desc.startsWith("Precios en USD")) {
          const actual = filas[ultimo];
          if (actual.descripcion.length < MAX_NOMBRE) {
            actual.descripcion = `${actual.descripcion} ${desc}`.slice(0, MAX_NOMBRE).replace(/\s+/g, " ").trim();
          }
        }
        continue;
      }
      if (codigo.length > MAX_CODIGO || !RE_CODIGO_LISTA.test(codigo)) continue;
      const existencia = primerNumero(celda(celdas[2]));
      const precioSin = primerNumero(celda(celdas[3]));
      if (!Number.isFinite(existencia) || !Number.isFinite(precioSin)) {
        problemas.push(`${codigo}: existencia o precio sin impuesto ilegibles, se omiti\xF3.`);
        ultimo = -1;
        continue;
      }
      if (desc.length < 3) {
        problemas.push(`${codigo}: sin descripci\xF3n legible, se omiti\xF3.`);
        ultimo = -1;
        continue;
      }
      let codigoFinal = codigo.slice(0, MAX_CODIGO);
      if (porCodigo.has(codigoFinal)) {
        let n = 2;
        codigoFinal = `${codigo.slice(0, MAX_CODIGO - 2)}-2`;
        while (porCodigo.has(codigoFinal)) {
          n += 1;
          codigoFinal = `${codigo.slice(0, MAX_CODIGO - 1 - String(n).length)}-${n}`;
        }
        problemas.push(`${codigo}: c\xF3digo repetido en la lista, esta fila qued\xF3 con el c\xF3digo ${codigoFinal}.`);
      }
      const nueva = {
        codigo: codigoFinal,
        descripcion: desc.slice(0, MAX_NOMBRE),
        existencia: Math.max(0, Math.round(existencia)),
        costo: Math.round(precioSin * 100) / 100
      };
      filas.push(nueva);
      porCodigo.set(codigoFinal, nueva);
      ultimo = filas.length - 1;
    }
  }
  return { filas, problemas };
}
function parseInventarioAuto(paginas) {
  const pos = parseInventario(paginas);
  if (pos.filas.length) return { ...pos, formato: "pos" };
  const lista = parseListaLimpia(paginas);
  if (lista.filas.length) return { ...lista, formato: "lista-limpia" };
  return { ...pos, formato: "pos" };
}

// spot24/functions/src/payments.ts
import admin4 from "firebase-admin";
import { HttpsError as HttpsError4, onCall } from "firebase-functions/v2/https";

// spot24/functions/src/domain/order-state.ts
var STATUS_TRANSITIONS = {
  pendiente: ["en_verificacion", "cancelado"],
  en_verificacion: ["pagado", "cancelado"],
  pagado: ["preparado", "cancelado"],
  preparado: ["en_camino", "cancelado"],
  en_camino: ["entregado"],
  entregado: [],
  cancelado: []
};
function canTransition(from, to) {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// spot24/functions/src/lib/fraud.ts
import admin2 from "firebase-admin";
var db = () => admin2.firestore();
async function isDuplicateReference(refHash, excludeOrderId) {
  const snap = await db().collection("orders").where("payment.refHash", "==", refHash).limit(3).get();
  return snap.docs.some((d) => d.id !== excludeOrderId && d.data()["status"] !== "cancelado");
}

// spot24/functions/src/lib/notifications.ts
import admin3 from "firebase-admin";
var db2 = () => admin3.firestore();
var MESSAGES = {
  pendiente: { title: "SPOT 24 \xB7 Pedido registrado", body: "Sube tu comprobante para seguir. Para. Resuelve. Sigue." },
  en_verificacion: { title: "SPOT 24 \xB7 Verificando pago", body: "Tu pago est\xE1 en revisi\xF3n. Te avisamos al confirmar." },
  pagado: { title: "SPOT 24 \xB7 Pago confirmado", body: "Tu pedido entra al pit stop. Preparado en breve." },
  preparado: { title: "SPOT 24 \xB7 Pedido preparado", body: "Empacado y listo. Sale de la bah\xEDa pronto." },
  en_camino: { title: "SPOT 24 \xB7 En camino", body: "Tu pedido va en ruta. S\xEDguelo en vivo desde la app." },
  entregado: { title: "SPOT 24 \xB7 Entregado", body: "Entregado. Abierto cuando importa." },
  cancelado: { title: "SPOT 24 \xB7 Pedido cancelado", body: "Tu pedido fue cancelado. Cuando quieras, aqu\xED estamos." }
};
var DISPATCH_TITLE = "SPOT 24 \xB7 Pedido listo para salir";
var PAYMENT_TITLE = "SPOT 24 \xB7 Pago por verificar";
var NOTIF_ICON = "/icons/icon-192.png";
var NOTIF_BADGE = "/icons/badge-96.png";
function buildTag(d) {
  if (d["aud"] === "dispatch") return `spot24-disp-${d["orderCode"] ?? ""}`;
  if (d["aud"] === "pagos") return `spot24-pagos-${d["orderCode"] ?? ""}`;
  if (d["aud"] === "stock") return `spot24-stock-${d["productId"] ?? ""}-${d["variantId"] ?? ""}`;
  return `spot24-order-${d["orderCode"] ?? ""}-${d["status"] ?? ""}`;
}
function buildClickUrl(d) {
  if (d["aud"] === "dispatch") return "/admin/despacho";
  if (d["aud"] === "pagos") return "/admin/pagos";
  if (d["aud"] === "stock") return "/carrito";
  return "/pedidos";
}
async function firstDisplayName(uid) {
  try {
    const snap = await db2().collection("users").doc(uid).get();
    const raw = String(snap.data()?.["name"] ?? "").trim();
    if (!raw) return "";
    const first = raw.split(/\s+/)[0];
    return first ? first.slice(0, 24) : "";
  } catch {
    return "";
  }
}
var NOTIFS_TOPE_POR_USUARIO = 30;
async function guardarNotifEnHistorial(uid, code, status, title, body) {
  try {
    const col = db2().collection(`users/${uid}/notifs`);
    await col.add({
      code: code.slice(0, 40),
      status,
      title,
      body,
      createdAtMs: Date.now()
    });
    const viejas = await col.orderBy("createdAtMs", "desc").offset(NOTIFS_TOPE_POR_USUARIO).limit(10).get();
    await Promise.all(viejas.docs.map((d) => d.ref.delete()));
  } catch (e) {
    console.warn("[notificaciones] historial in-app fallido (best-effort)", e);
  }
}
async function tokenRefsForRoles(roles) {
  const refs = [];
  try {
    const users = await db2().collection("users").where("role", "in", [...roles]).get();
    await Promise.all(
      users.docs.map(async (u) => {
        const toks = await u.ref.collection("fcmTokens").limit(20).get();
        toks.docs.forEach((t) => {
          const token = String(t.data()["token"] ?? "");
          if (token) refs.push({ token, ref: t.ref });
        });
      })
    );
  } catch (e) {
    console.warn("[notificaciones] fallo consultando tokens del personal (aviso omitido)", e);
    return [];
  }
  return refs;
}
async function sendAndCleanup(refs, title, body, data) {
  if (refs.length === 0) return;
  try {
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging();
    const fullData = { ...data, clickUrl: buildClickUrl(data) };
    const batch = await messaging.sendEachForMulticast({
      tokens: refs.map((r) => r.token),
      // 5.42/5.67 · title/body viajan en `data` (vía SW, control total) Y en
      // el bloque nativo de respaldo (vía Chrome cuando el SW no despierta).
      // Icon y badge idénticos en ambas vías; tag idéntica → se reemplazan.
      data: { ...fullData, title, body },
      webpush: {
        // 5.73-j · TTL 24 h + URGENCIA HIGH (RFC 8030): sin Urgency, Android
        // difiere el globo en Doze (pantalla apagada) hasta despertar el
        // equipo. high despierta el dispositivo: llega y suena SIEMPRE.
        headers: { TTL: "86400", Urgency: "high" },
        notification: {
          title,
          body,
          icon: NOTIF_ICON,
          badge: NOTIF_BADGE,
          tag: buildTag(data),
          renotify: true
        }
      }
    });
    const removals = [];
    batch.responses.forEach((r, i) => {
      const failed = r.success === false && (r.error?.code === "messaging/registration-token-not-registered" || r.error?.code === "messaging/invalid-registration-token");
      if (failed && refs[i]) {
        removals.push(refs[i].ref.delete());
      }
    });
    await Promise.all(removals);
  } catch (e) {
    console.warn("[notificaciones] env\xEDo FCM fallido (best-effort)", e);
  }
}
var ORDER_NOTIFICATIONS = {
  /** Envía a todos los tokens registrados del usuario (fan-out acotado a 20). */
  async send(uid, orderCode, status) {
    const msg = MESSAGES[status];
    if (!msg) return;
    try {
      const firstName = await firstDisplayName(uid);
      const base = firstName ? `${firstName}, ${msg.body.charAt(0).toLowerCase()}${msg.body.slice(1)}` : msg.body;
      const body = orderCode ? `${base} (${orderCode})` : base;
      await guardarNotifEnHistorial(uid, orderCode, status, msg.title, body);
      const tokensSnap = await db2().collection(`users/${uid}/fcmTokens`).limit(20).get();
      if (tokensSnap.empty) return;
      const refs = tokensSnap.docs.map((d) => ({ token: String(d.data()["token"] ?? ""), ref: d.ref })).filter((r) => r.token);
      if (refs.length === 0) return;
      await sendAndCleanup(refs, msg.title, body, {
        status,
        orderCode: orderCode.slice(0, 40)
      });
    } catch (e) {
      console.warn("[notificaciones] push de estado fallido (best-effort)", e);
    }
  },
  /** 5.28 · Aviso de despacho: un pedido con envío quedó PREPARADO.
   *  · delivery → «Tómalo desde el panel de despacho.» (llamado a la acción)
   *  · gerente/admin/cajero (5.71) → «Disponible en el panel de despacho.»
   *    (informativo; tomarlo es EXCLUSIVO del delivery, reasignar de
   *    gerencia/admin)
   *  El cuerpo lleva código + zona para decidir sin abrir la app.
   *  5.71 · EN CADENA: primero el CTA del delivery (debe enterarse YA) y
   *  detrás el informativo del personal — sin ráfagas de lecturas
   *  concurrentes → orden de llegada predecible. */
  async sendDispatchAlert(orderCode, zoneName) {
    const code = orderCode.slice(0, 40);
    const zone = zoneName.trim().slice(0, 40);
    const lead = zone ? `${code} \xB7 Zona ${zone}. ` : `${code} \xB7 `;
    try {
      const data = { aud: "dispatch", status: "preparado", orderCode: code, zone };
      const delivery = await tokenRefsForRoles(["delivery"]);
      await sendAndCleanup(delivery, DISPATCH_TITLE, `${lead}T\xF3malo desde el panel de despacho.`, data);
      const staff = await tokenRefsForRoles(["gerente", "admin", "cajero"]);
      await sendAndCleanup(staff, DISPATCH_TITLE, `${lead}Disponible en el panel de despacho.`, data);
    } catch (e) {
      console.warn("[notificaciones] push de personal fallido (best-effort)", e);
    }
  },
  /** 5.71 · «Pago por verificar»: un pedido entró a la cola de verificación.
   *  VA AL CAJERO (con gerencia/admin como respaldo): es el rol que aprueba
   *  o rechaza el pago en /admin/pagos. El cuerpo lleva el código para
   *  cotejar la referencia sin abrir la app; el detalle (comprobante, monto,
   *  datos del pagador) vive en el panel. */
  async sendPaymentReviewAlert(orderCode) {
    const code = orderCode.slice(0, 40);
    try {
      const staff = await tokenRefsForRoles(["cajero", "gerente", "admin"]);
      await sendAndCleanup(staff, PAYMENT_TITLE, `${code}. Rev\xEDsalo en el panel de pagos.`, {
        aud: "pagos",
        status: "en_verificacion",
        orderCode: code
      });
    } catch (e) {
      console.warn("[notificaciones] push de personal fallido (best-effort)", e);
    }
  }
};

// spot24/functions/src/lib/crypto.ts
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { HttpsError as HttpsError3 } from "firebase-functions/v2/https";
function hashReference(method, reference) {
  return createHash("sha256").update(`${method.toLowerCase()}|${reference.trim()}`).digest("hex");
}

// spot24/functions/src/payments.ts
var db3 = () => admin4.firestore(getAdminApp());
function requireStaff(ctx, roles) {
  if (!ctx.auth) throw new HttpsError4("unauthenticated", "Sesi\xF3n requerida.");
  const role = String(ctx.auth.token["role"] ?? "");
  if (!roles.includes(role)) {
    throw new HttpsError4("permission-denied", "No tienes permiso para esta acci\xF3n.");
  }
  return { uid: ctx.auth.uid, role };
}
function sanitizeStr(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
async function writeAudit(entry) {
  await db3().collection("auditLog").add({
    ...entry,
    note: entry.note ? entry.note.slice(0, 200) : "",
    at: Date.now()
    // Nunca PII: solo UIDs e IDs internos.
  });
}
async function coreVerifyPayment(ctx) {
  const staff = requireStaff(ctx, ["admin", "gerente", "cajero"]);
  const orderId = sanitizeStr(ctx.data?.["orderId"], 120);
  const approve = ctx.data?.["approve"] === true;
  const note = sanitizeStr(ctx.data?.["note"], 300);
  if (!orderId) throw new HttpsError4("invalid-argument", "orderId requerido.");
  const ref = db3().collection("orders").doc(orderId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError4("not-found", "Orden no encontrada.");
  const order = snap.data();
  const status = String(order["status"]);
  if (approve && status === "pagado") {
    return { ok: true, alreadyApplied: true };
  }
  if (!approve && status === "cancelado" && String(order["payment"]?.["status"] ?? "") === "rechazado") {
    return { ok: true, alreadyApplied: true };
  }
  if (!["pendiente", "en_verificacion"].includes(status)) {
    throw new HttpsError4("failed-precondition", "La orden no est\xE1 en verificaci\xF3n de pago.");
  }
  if (approve && order["payment"]?.["hasReceipt"] !== true) {
    throw new HttpsError4(
      "failed-precondition",
      "El cliente a\xFAn no subi\xF3 el comprobante de pago: no se puede aprobar sin pago registrado."
    );
  }
  if (approve) {
    const refHash = order["payment"]?.["refHash"] ?? null;
    if (refHash) {
      const dup = await isDuplicateReference(String(refHash), orderId);
      if (dup) {
        await db3().collection("fraudReview").add({
          orderId,
          reason: "referencia_duplicada",
          refHash,
          at: Date.now()
        });
        throw new HttpsError4("failed-precondition", "Referencia duplicada: va a la cola de revisi\xF3n.");
      }
    }
    await ref.update({
      status: "pagado",
      "payment.status": "pagado",
      "payment.verifiedAt": Date.now(),
      "payment.verifiedBy": staff.uid,
      updatedAt: Date.now(),
      riskFlags: []
    });
    await ref.collection("events").add({
      status: "pagado",
      at: Date.now(),
      by: staff.role,
      note: note || "Pago verificado."
    });
    await ORDER_NOTIFICATIONS.send(String(order["uid"]), String(order["code"]), "pagado");
  } else {
    await db3().runTransaction(async (tx) => {
      const lines = order["lines"] ?? [];
      const restock = [];
      for (const line of lines) {
        const vref = db3().doc(`products/${line.productId}/variants/${line.variantId}`);
        const vsnap = await tx.get(vref);
        if (vsnap.exists) {
          restock.push({ ref: vref, newStock: Number(vsnap.data()?.["stock"] ?? 0) + line.qty, qty: line.qty });
        }
      }
      const parentBumps = /* @__PURE__ */ new Map();
      for (const p of restock) {
        const pid = p.ref.parent.parent?.id ?? "";
        if (!pid) continue;
        const cur = parentBumps.get(pid);
        if (cur) {
          cur.qty += p.qty;
        } else {
          const pRef = db3().doc(`products/${pid}`);
          const psnap = await tx.get(pRef);
          parentBumps.set(pid, { ref: pRef, qty: p.qty, exists: psnap.exists });
        }
      }
      tx.update(ref, {
        status: "cancelado",
        "payment.status": "rechazado",
        "payment.verifiedAt": Date.now(),
        "payment.verifiedBy": staff.uid,
        updatedAt: Date.now()
      });
      tx.set(ref.collection("events").doc(), {
        status: "cancelado",
        at: Date.now(),
        by: staff.role,
        note: note || "Pago rechazado."
      });
      for (const p of restock) {
        tx.update(p.ref, { stock: p.newStock });
      }
      for (const b of parentBumps.values()) {
        if (!b.exists) continue;
        tx.update(b.ref, {
          stockTotal: admin4.firestore.FieldValue.increment(b.qty),
          updatedAt: Date.now()
        });
      }
    });
    await ORDER_NOTIFICATIONS.send(String(order["uid"]), String(order["code"]), "cancelado");
  }
  await writeAudit({
    action: approve ? "verificar_pago_aprobado" : "verificar_pago_rechazado",
    adminUid: staff.uid,
    targetId: orderId,
    note
  });
  return { ok: true };
}
var fnVerifyPayment = onCall(
  { region: "us-central1", consumeAppCheckToken: true, cors: true, maxInstances: 20 },
  (req) => coreVerifyPayment(req)
);

// spot24/functions/src/importInventory.ts
var db4 = () => admin5.firestore(getAdminApp());
var MAX_FILAS = 2e3;
var OPS_POR_LOTE = 450;
var EN_CONSULTA = 30;
function sanitizeStr2(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
function redondearPrecio(n) {
  return Math.max(0, Math.round(n * 100) / 100);
}
function slugDe(nombre) {
  return nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `producto-${Date.now().toString(36)}`;
}
function searchTermsDe(nombre, marca) {
  const words = `${nombre} ${marca}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
  return [...new Set(words)].slice(0, 20);
}
function filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos) {
  let omitidas = 0;
  productoPorCode.forEach((pid, code) => {
    if (!pidsVivos.has(pid)) {
      productoPorCode.delete(code);
      omitidas += 1;
    }
  });
  productoPorSku.forEach((pid, sku) => {
    if (!pidsVivos.has(pid)) {
      productoPorSku.delete(sku);
      omitidas += 1;
    }
  });
  return omitidas;
}
async function porLotesIn(coleccion, campo, valores) {
  const docs = [];
  for (let i = 0; i < valores.length; i += EN_CONSULTA) {
    const tanda = valores.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    const snap = await coleccion.where(campo, "in", tanda).get();
    docs.push(...snap.docs);
  }
  return docs;
}
async function coreImportInventory(ctx) {
  if (!ctx.auth) throw new HttpsError5("unauthenticated", "Sesi\xF3n requerida.");
  const role = ctx.auth.token["role"];
  if (role !== "admin" && role !== "gerente") {
    throw new HttpsError5("permission-denied", "Solo administraci\xF3n o gerencia.");
  }
  const adminUid = ctx.auth.uid;
  const pdfBase64 = typeof ctx.data?.["pdfBase64"] === "string" ? ctx.data["pdfBase64"] : "";
  const categoryId = sanitizeStr2(ctx.data?.["categoryId"], 120);
  if (!pdfBase64) throw new HttpsError5("invalid-argument", "Falta el archivo PDF.");
  if (!categoryId) throw new HttpsError5("invalid-argument", "Elige la categor\xEDa donde caer\xE1n los productos nuevos.");
  const catSnap = await db4().collection("categories").doc(categoryId).get();
  if (!catSnap.exists) {
    throw new HttpsError5("invalid-argument", "La categor\xEDa elegida no existe. Recarga el panel.");
  }
  const parseo = parseInventarioAuto(await extraerItemsPdf(pdfBase64));
  if (!parseo.filas.length) {
    throw new HttpsError5(
      "invalid-argument",
      "No se reconoci\xF3 ning\xFAn producto. Verifica que el PDF sea el reporte \xABInventario disponible\xBB de tu sistema o una lista con columnas C\xF3digo / Descripci\xF3n / Existencia / Precio sin impuesto."
    );
  }
  if (parseo.filas.length > MAX_FILAS) {
    throw new HttpsError5("invalid-argument", `El reporte trae ${parseo.filas.length} filas (tope ${MAX_FILAS}). Div\xEDdelo.`);
  }
  const filas = parseo.filas;
  const codigos = [...new Set(filas.map((f) => f.codigo))];
  const productoPorCode = /* @__PURE__ */ new Map();
  const docs = codigos.length ? await porLotesIn(db4().collection("products"), "code", codigos) : [];
  docs.forEach((d) => {
    const code = String(d.data()["code"] ?? "").toUpperCase();
    if (code) productoPorCode.set(code, d.id);
  });
  const skuSinProducto = codigos.filter((c) => !productoPorCode.has(c));
  const productoPorSku = /* @__PURE__ */ new Map();
  if (skuSinProducto.length) {
    const buscar = new Set(skuSinProducto.map((c) => c.slice(0, 40).toUpperCase()));
    const variantes = await db4().collectionGroup("variants").get();
    variantes.forEach((d) => {
      const sku = String(d.data()["sku"] ?? "").toUpperCase();
      const pid = d.ref.parent?.parent?.id;
      if (sku && pid && buscar.has(sku) && !productoPorCode.has(sku)) {
        productoPorSku.set(sku, pid);
      }
    });
  }
  const pidsCandidatos = [
    .../* @__PURE__ */ new Set([...productoPorCode.values(), ...productoPorSku.values()])
  ];
  const pidsVivos = /* @__PURE__ */ new Set();
  for (let i = 0; i < pidsCandidatos.length; i += EN_CONSULTA) {
    const tanda = pidsCandidatos.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    const vivos = await db4().collection("products").where(admin5.firestore.FieldPath.documentId(), "in", tanda).get();
    vivos.forEach((d) => pidsVivos.add(d.id));
  }
  const omitidasHuerfanas = filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos);
  const ahora = Date.now();
  const lote = [];
  let loteActual = db4().batch();
  let ops = 0;
  const nuevoLoteSiHagaFalta = () => {
    if (ops >= OPS_POR_LOTE) {
      lote.push(loteActual);
      loteActual = db4().batch();
      ops = 0;
    }
  };
  const enLote = (fn) => {
    nuevoLoteSiHagaFalta();
    fn(loteActual);
    ops += 1;
  };
  let creados = 0;
  let actualizados = 0;
  const slugsBase = [...new Set(filas.map((f) => slugDe(f.descripcion)))];
  const slugsUsados = /* @__PURE__ */ new Set();
  if (slugsBase.length) {
    const docsSlug = await porLotesIn(db4().collection("products"), "slug", slugsBase.slice(0, 300));
    docsSlug.forEach((d) => slugsUsados.add(String(d.data()["slug"] ?? "")));
  }
  const cambiosPorProducto = /* @__PURE__ */ new Map();
  for (const fila of filas) {
    const porCode = productoPorCode.get(fila.codigo);
    const pid = porCode ?? productoPorSku.get(fila.codigo);
    if (!pid) continue;
    const cambios = cambiosPorProducto.get(pid) ?? /* @__PURE__ */ new Map();
    cambios.set(fila.codigo, { stock: fila.existencia, priceUsd: redondearPrecio(fila.costo) });
    cambiosPorProducto.set(pid, cambios);
    actualizados += 1;
  }
  for (const [pid, plan] of cambiosPorProducto) {
    const pref = db4().doc(`products/${pid}`);
    const varsSnap = await pref.collection("variants").get();
    const variantes = /* @__PURE__ */ new Map();
    varsSnap.docs.forEach((d) => {
      const data = d.data();
      variantes.set(d.id, {
        sku: String(data["sku"] ?? "").toUpperCase(),
        stock: Number(data["stock"] ?? 0),
        priceUsd: Number(data["priceUsd"] ?? 0),
        activa: data["active"] !== false
      });
    });
    const estadoFinal = /* @__PURE__ */ new Map();
    variantes.forEach((v, vid) => estadoFinal.set(vid, { sku: v.sku, stock: v.stock, priceUsd: v.priceUsd, activa: v.activa }));
    const aplicado = /* @__PURE__ */ new Map();
    for (const [skuObjetivo, cambio] of plan) {
      let vid = [...estadoFinal.entries()].find(([, v]) => v.activa && v.sku === skuObjetivo)?.[0];
      if (!vid) vid = estadoFinal.keys().next().value;
      if (!vid) {
        vid = `${pid}-v1`;
        estadoFinal.set(vid, { sku: skuObjetivo, stock: cambio.stock, priceUsd: cambio.priceUsd, activa: true });
      }
      estadoFinal.set(vid, { ...estadoFinal.get(vid), stock: cambio.stock, priceUsd: cambio.priceUsd });
      aplicado.set(vid, cambio);
    }
    const stockTotal = [...estadoFinal.values()].reduce((a, v) => a + Math.max(0, Math.round(v.stock)), 0);
    const precios = [...estadoFinal.values()].map((v) => v.priceUsd).filter((p) => Number.isFinite(p) && p >= 0);
    const basePriceUsd = precios.length ? redondearPrecio(Math.min(...precios)) : 0;
    const vidsExistentes = new Set(varsSnap.docs.map((d) => d.id));
    for (const [vid, cambio] of aplicado) {
      const vref = pref.collection("variants").doc(vid);
      if (vidsExistentes.has(vid)) {
        enLote((b) => b.update(vref, {
          stock: Math.max(0, Math.round(cambio.stock)),
          priceUsd: redondearPrecio(cambio.priceUsd)
        }));
      } else {
        enLote((b) => b.set(vref, {
          name: "Est\xE1ndar",
          sku: (estadoFinal.get(vid)?.sku ?? "").slice(0, 40),
          stock: Math.max(0, Math.round(cambio.stock)),
          priceUsd: redondearPrecio(cambio.priceUsd),
          active: true
        }));
      }
    }
    enLote((b) => b.update(pref, {
      stockTotal,
      basePriceUsd,
      updatedAt: ahora
    }));
  }
  for (const fila of filas) {
    if (productoPorCode.has(fila.codigo) || productoPorSku.has(fila.codigo)) continue;
    const pref = db4().collection("products").doc();
    let slug = slugDe(fila.descripcion);
    if (slugsUsados.has(slug)) slug = `${slug}-${fila.codigo.toLowerCase()}`;
    if (slugsUsados.has(slug)) slug = `${slug}-${pref.id.slice(0, 6)}`;
    slugsUsados.add(slug);
    const nombre = fila.descripcion.slice(0, 120);
    enLote((b) => b.set(pref, {
      slug,
      code: fila.codigo,
      name: nombre,
      brand: "",
      description: "",
      categoryId,
      basePriceUsd: redondearPrecio(fila.costo),
      images: [`/img/products/${categoryId}.svg`],
      searchTerms: searchTermsDe(nombre, ""),
      stockTotal: fila.existencia,
      variantCount: 1,
      active: true,
      createdAt: admin5.firestore.FieldValue.serverTimestamp(),
      updatedAt: ahora
    }));
    enLote((b) => b.set(pref.collection("variants").doc(`${pref.id}-v1`), {
      name: "Est\xE1ndar",
      sku: fila.codigo.slice(0, 40),
      priceUsd: redondearPrecio(fila.costo),
      stock: fila.existencia,
      active: true
    }));
    creados += 1;
  }
  lote.push(loteActual);
  for (const b of lote) await b.commit();
  const notaHuerfanas = omitidasHuerfanas ? ` \xB7 ${omitidasHuerfanas} referencia${omitidasHuerfanas === 1 ? "" : "s"} hu\xE9rfana${omitidasHuerfanas === 1 ? "" : "s"} omitida${omitidasHuerfanas === 1 ? "" : "s"}` : "";
  await writeAudit({
    action: "importar_inventario",
    adminUid,
    targetId: categoryId,
    note: `${parseo.formato} \xB7 ${parseo.filas.length} filas \xB7 +${creados} nuevos \xB7 ~${actualizados} actualizados${notaHuerfanas}`
  });
  return {
    filas: parseo.filas.length,
    creados,
    actualizados,
    formato: parseo.formato,
    problemas: parseo.problemas.slice(0, 20),
    omitidasHuerfanas
  };
}
var fnImportInventory = onCall2(
  { region: "us-central1", consumeAppCheckToken: true, cors: true, maxInstances: 5 },
  (req) => coreImportInventory(req)
);

// spot24/functions/src/backups.ts
import admin6 from "firebase-admin";
import { HttpsError as HttpsError6 } from "firebase-functions/v2/https";
var db5 = () => admin6.firestore(getAdminApp());
var BACKUP_FORMAT = "spot24-catalog-backup";
var BACKUP_VERSION = 1;
var MAX_CATEGORIAS = 200;
var MAX_PRODUCTOS = 1e3;
var MAX_VARIANTES_POR_PRODUCTO = 100;
var MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
var CHUNK_BYTES = 512 * 1024;
function sanitizeStr3(v, max) {
  if (typeof v !== "string") return "";
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
function normalizeTs(v) {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (v && typeof v === "object") {
    const t = v;
    if (typeof t.toMillis === "function") return t.toMillis.call(t);
    if (typeof t.seconds === "number") return Math.round(t.seconds * 1e3);
  }
  return 0;
}
function numSeguro(v, max = 1e6) {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, max);
}
function urlFoto(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return /^https:\/\//.test(s) || /^\/img\//.test(s) ? s.slice(0, 500) : "";
}
function validateBackupFile(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, motivo: "El archivo no contiene una copia v\xE1lida." };
  const f = raw;
  if (f["format"] !== BACKUP_FORMAT) {
    return { ok: false, motivo: `Este archivo no es una copia de SPOT 24 (formato ${BACKUP_FORMAT}).` };
  }
  if (f["version"] !== BACKUP_VERSION) {
    return { ok: false, motivo: `La copia usa una versi\xF3n distinta (${String(f["version"])}); actualiza la app.` };
  }
  const cat = f["catalog"];
  if (!cat || typeof cat !== "object") {
    return { ok: false, motivo: "La copia est\xE1 incompleta: no trae el cat\xE1logo." };
  }
  const rawCats = cat["categories"];
  const rawProds = cat["products"];
  if (!Array.isArray(rawCats) || !Array.isArray(rawProds)) {
    return { ok: false, motivo: "La copia est\xE1 incompleta: faltan las categor\xEDas o los productos." };
  }
  if (rawCats.length > MAX_CATEGORIAS) {
    return { ok: false, motivo: `La copia trae ${rawCats.length} categor\xEDas (tope ${MAX_CATEGORIAS}).` };
  }
  if (rawProds.length > MAX_PRODUCTOS) {
    return { ok: false, motivo: `La copia trae ${rawProds.length} productos (tope ${MAX_PRODUCTOS}). Div\xEDdela o pide ampliar el tope.` };
  }
  const idsCategoria = /* @__PURE__ */ new Set();
  const categorias = [];
  for (const c of rawCats) {
    if (!c || typeof c !== "object") return { ok: false, motivo: "Hay una categor\xEDa da\xF1ada dentro de la copia." };
    const o = c;
    const id = sanitizeStr3(o["id"], 120);
    const name = sanitizeStr3(o["name"], 60);
    if (!id || !name) {
      return { ok: false, motivo: "Hay una categor\xEDa sin identificador o sin nombre dentro de la copia." };
    }
    if (idsCategoria.has(id)) return { ok: false, motivo: `La copia trae categor\xEDas repetidas (${id}).` };
    idsCategoria.add(id);
    categorias.push({
      id,
      name,
      tagline: sanitizeStr3(o["tagline"], 80),
      imageUrl: urlFoto(o["imageUrl"]),
      active: o["active"] !== false,
      parentId: sanitizeStr3(o["parentId"], 120),
      createdAt: normalizeTs(o["createdAt"]),
      updatedAt: normalizeTs(o["updatedAt"])
    });
  }
  const idsProducto = /* @__PURE__ */ new Set();
  const products = [];
  for (const p of rawProds) {
    if (!p || typeof p !== "object") return { ok: false, motivo: "Hay un producto da\xF1ado dentro de la copia." };
    const o = p;
    const id = sanitizeStr3(o["id"], 120);
    const name = sanitizeStr3(o["name"], 120);
    const categoryId = sanitizeStr3(o["categoryId"], 120);
    if (!id || !name || !categoryId) {
      return { ok: false, motivo: "Hay un producto sin identificador, nombre o categor\xEDa dentro de la copia." };
    }
    if (idsProducto.has(id)) return { ok: false, motivo: `La copia trae productos repetidos (${id}).` };
    idsProducto.add(id);
    const rawVars = o["variants"];
    if (!Array.isArray(rawVars)) {
      return { ok: false, motivo: `El producto \xAB${name}\xBB no trae variantes en la copia.` };
    }
    if (rawVars.length > MAX_VARIANTES_POR_PRODUCTO) {
      return { ok: false, motivo: `El producto \xAB${name}\xBB trae ${rawVars.length} variantes (tope ${MAX_VARIANTES_POR_PRODUCTO}).` };
    }
    const images = Array.isArray(o["images"]) ? o["images"].map(urlFoto).filter(Boolean).slice(0, 6) : [];
    const searchTerms = Array.isArray(o["searchTerms"]) ? o["searchTerms"].map((t) => sanitizeStr3(t, 40).toLowerCase()).filter(Boolean).slice(0, 20) : [];
    const variants = [];
    for (const v of rawVars) {
      if (!v || typeof v !== "object") return { ok: false, motivo: `El producto \xAB${name}\xBB tiene una variante da\xF1ada.` };
      const vo = v;
      const vid = sanitizeStr3(vo["id"], 120);
      if (!vid) return { ok: false, motivo: `El producto \xAB${name}\xBB tiene una variante sin identificador.` };
      variants.push({
        id: vid,
        name: sanitizeStr3(vo["name"], 80) || "Est\xE1ndar",
        sku: sanitizeStr3(vo["sku"], 40).toUpperCase(),
        priceUsd: numSeguro(vo["priceUsd"]),
        stock: Math.floor(numSeguro(vo["stock"])),
        active: vo["active"] !== false
      });
    }
    products.push({
      id,
      slug: sanitizeStr3(o["slug"], 140) || `producto-${id.slice(0, 8)}`,
      code: sanitizeStr3(o["code"], 40).toUpperCase(),
      name,
      brand: sanitizeStr3(o["brand"], 60),
      description: sanitizeStr3(o["description"], 1e3),
      categoryId,
      basePriceUsd: numSeguro(o["basePriceUsd"]),
      images,
      searchTerms,
      stockTotal: Math.floor(numSeguro(o["stockTotal"])),
      variantCount: Math.max(variants.length, Math.floor(numSeguro(o["variantCount"])) || variants.length),
      active: o["active"] !== false,
      createdAt: normalizeTs(o["createdAt"]),
      updatedAt: normalizeTs(o["updatedAt"]),
      variants
    });
  }
  const huerfanos = products.filter((p) => !idsCategoria.has(p.categoryId));
  if (huerfanos.length) {
    return {
      ok: false,
      motivo: `${huerfanos.length} producto(s) apuntan a categor\xEDas que no vienen en la copia (p. ej. \xAB${huerfanos[0]?.name ?? "desconocido"}\xBB). Copia incompleta: exporta el cat\xE1logo de nuevo.`
    };
  }
  const exportedAt = typeof f["exportedAt"] === "string" ? f["exportedAt"].slice(0, 40) : "";
  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: "spot24",
      exportedAt,
      catalog: { categories: categorias, products }
    }
  };
}
function joinChunks(parts) {
  return parts.join("");
}
async function leerVariantesPorProducto() {
  const porProducto = /* @__PURE__ */ new Map();
  const snap = await db5().collectionGroup("variants").get();
  snap.docs.forEach((d) => {
    const pid = d.ref.parent?.parent?.id;
    if (!pid) return;
    const o = d.data();
    const v = {
      id: d.id,
      name: sanitizeStr3(o["name"], 80) || "Est\xE1ndar",
      sku: sanitizeStr3(o["sku"], 40).toUpperCase(),
      priceUsd: numSeguro(o["priceUsd"]),
      stock: Math.floor(numSeguro(o["stock"])),
      active: o["active"] !== false
    };
    const lista = porProducto.get(pid) ?? [];
    lista.push(v);
    porProducto.set(pid, lista);
  });
  return porProducto;
}
async function assembleCatalog() {
  const [catsSnap, prodsSnap, variantes] = await Promise.all([
    db5().collection("categories").get(),
    db5().collection("products").get(),
    leerVariantesPorProducto()
  ]);
  const categories = catsSnap.docs.map((d) => {
    const o = d.data();
    return {
      id: d.id,
      name: sanitizeStr3(o["name"], 60),
      tagline: sanitizeStr3(o["tagline"], 80),
      imageUrl: urlFoto(o["imageUrl"]),
      active: o["active"] !== false,
      parentId: sanitizeStr3(o["parentId"], 120),
      createdAt: normalizeTs(o["createdAt"]),
      updatedAt: normalizeTs(o["updatedAt"])
    };
  });
  const products = prodsSnap.docs.map((d) => {
    const o = d.data();
    const variants = (variantes.get(d.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    return {
      id: d.id,
      slug: sanitizeStr3(o["slug"], 140),
      code: sanitizeStr3(o["code"], 40).toUpperCase(),
      name: sanitizeStr3(o["name"], 120),
      brand: sanitizeStr3(o["brand"], 60),
      description: sanitizeStr3(o["description"], 1e3),
      categoryId: sanitizeStr3(o["categoryId"], 120),
      basePriceUsd: numSeguro(o["basePriceUsd"]),
      images: Array.isArray(o["images"]) ? o["images"].map(urlFoto).filter(Boolean).slice(0, 6) : [],
      searchTerms: Array.isArray(o["searchTerms"]) ? o["searchTerms"].map((t) => sanitizeStr3(t, 40).toLowerCase()).slice(0, 20) : [],
      stockTotal: Math.floor(numSeguro(o["stockTotal"])),
      variantCount: variants.length,
      active: o["active"] !== false,
      createdAt: normalizeTs(o["createdAt"]),
      updatedAt: normalizeTs(o["updatedAt"]),
      variants
    };
  });
  return { categories, products };
}
async function leerSnapshot(snapshotId) {
  const ref = db5().collection("catalogBackups").doc(snapshotId);
  const metaSnap = await ref.get();
  if (!metaSnap.exists) {
    throw new HttpsError6("not-found", "Esa copia ya no existe (la rotaci\xF3n la borr\xF3). Elige otra de la lista.");
  }
  const chunksSnap = await ref.collection("chunks").orderBy("i").get();
  if (!chunksSnap.docs.length) {
    throw new HttpsError6("internal", "La copia est\xE1 vac\xEDa (chunks perdidos). Elige otra o exporta de nuevo.");
  }
  const json = joinChunks(chunksSnap.docs.map((d) => String(d.data()["json"] ?? "")));
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new HttpsError6("internal", "La copia guardada est\xE1 da\xF1ada (JSON ilegible). Elige otra o exporta de nuevo.");
  }
  const validado = validateBackupFile(raw);
  if (!validado.ok) throw new HttpsError6("internal", `Copia guardada inv\xE1lida: ${validado.motivo}`);
  return validado.file;
}
function requireStaff2(ctx, roles) {
  if (!ctx.auth) throw new HttpsError6("unauthenticated", "Sesi\xF3n requerida.");
  const role = ctx.auth.token["role"];
  if (typeof role !== "string" || !roles.includes(role)) {
    throw new HttpsError6("permission-denied", "Solo administraci\xF3n o gerencia.");
  }
  return ctx.auth.uid;
}
async function coreExportCatalog(ctx) {
  requireStaff2(ctx, ["admin", "gerente"]);
  const snapshotId = sanitizeStr3(ctx.data?.["snapshotId"], 120);
  if (snapshotId) {
    const file2 = await leerSnapshot(snapshotId);
    return { file: file2, bytes: Buffer.byteLength(JSON.stringify(file2), "utf8") };
  }
  const snapshot = await assembleCatalog();
  const file = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: "spot24",
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    catalog: snapshot
  };
  return { file, bytes: Buffer.byteLength(JSON.stringify(file), "utf8") };
}

// scripts/importar-inventario-local-entry.ts
var VERDE = "\x1B[32m";
var AMARILLO = "\x1B[33m";
var ROJO = "\x1B[31m";
var GRIS = "\x1B[2m";
var NEUTRO = "\x1B[0m";
function titulo(t) {
  console.log(`
${GRIS}\u2500\u2500 ${t} ${"\u2500".repeat(Math.max(0, 64 - t.length))}${NEUTRO}`);
}
function recortar(s, n) {
  return s.length <= n ? s : `${s.slice(0, n - 1)}\u2026`;
}
var entradaActiva = false;
var lineaBuffer = "";
var lineasPendientes = [];
var esperandoLinea = [];
function activarEntrada() {
  if (entradaActiva) return;
  entradaActiva = true;
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (trozo) => {
    lineaBuffer += trozo;
    let idx;
    while ((idx = lineaBuffer.indexOf("\n")) >= 0) {
      lineasPendientes.push(lineaBuffer.slice(0, idx).trim());
      lineaBuffer = lineaBuffer.slice(idx + 1);
    }
    while (esperandoLinea.length && lineasPendientes.length) {
      esperandoLinea.shift()(lineasPendientes.shift());
    }
  });
  process.stdin.on("end", () => {
    while (esperandoLinea.length) esperandoLinea.shift()("");
  });
}
function preguntar(texto) {
  process.stdout.write(texto);
  if (lineasPendientes.length) return Promise.resolve(lineasPendientes.shift());
  if (process.stdin.readableEnded) return Promise.resolve("");
  return new Promise((resolve2) => {
    esperandoLinea.push(resolve2);
    activarEntrada();
  });
}
function cargarEnv() {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    .../* @__PURE__ */ new Set([
      resolve(process.cwd(), ".env"),
      join(aqui, ".env"),
      join(aqui, "..", ".env")
    ])
  ];
  const ruta = candidatos.find((p) => existsSync(p));
  if (!ruta) {
    console.error(
      `${ROJO}\u2717 No encontr\xE9 el archivo .env.${NEUTRO}
  Busqu\xE9 en:
${candidatos.map((p) => `   \xB7 ${p}`).join("\n")}
  C\xF3rralo desde la carpeta del proyecto (la que tiene package.json y .env) o ponlo junto al script.`
    );
    process.exit(1);
  }
  const lineas = readFileSync(ruta, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const linea of lineas) {
    const t = linea.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const clave = t.slice(0, eq).trim();
    let valor = t.slice(eq + 1).trim();
    if (valor.startsWith('"') && valor.endsWith('"') && valor.length >= 2 || valor.startsWith("'") && valor.endsWith("'") && valor.length >= 2) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
  if (!process.env["FIREBASE_SERVICE_ACCOUNT"]) {
    console.error(
      `${ROJO}\u2717 El ${ruta} no trae FIREBASE_SERVICE_ACCOUNT.${NEUTRO}
  Es la misma credencial que ya usa netlify dev: p\xE9gala en el .env (JSON completo o su base64) y vuelve a correr el script.`
    );
    process.exit(1);
  }
  let json;
  const bruta = process.env["FIREBASE_SERVICE_ACCOUNT"];
  try {
    json = JSON.parse(bruta.trim().startsWith("{") ? bruta : Buffer.from(bruta, "base64").toString("utf8"));
  } catch {
    console.error(
      `${ROJO}\u2717 FIREBASE_SERVICE_ACCOUNT no se pudo leer como JSON.${NEUTRO}
  Debe ser el JSON completo EN UNA sola l\xEDnea (o su base64), sin saltos a\xF1adidos.`
    );
    process.exit(1);
  }
  return { ruta, projecto: String(json["project_id"] ?? "desconocido") };
}
async function conectarDB(env) {
  try {
    const db6 = admin7.firestore(getAdminApp());
    await db6.collection("categories").limit(1).get();
    console.log(`${VERDE}\u2713 Conectado y credencial v\xE1lida (proyecto ${env.projecto})${NEUTRO}`);
    return db6;
  } catch (e) {
    const codigo = e.code ?? "n/d";
    console.error(
      `
${ROJO}\u2717 No pude conectar a tu Firebase (c\xF3digo ${codigo}).${NEUTRO}
  Motivo t\xE9cnico: ${recortar(String(e.message ?? e), 220)}
  Revisa: 1) FIREBASE_SERVICE_ACCOUNT en el .env \u2014 el JSON completo de la clave
     privada en UNA l\xEDnea (o su base64), el mismo que usa netlify dev;
  2) que esa clave no est\xE9 revocada en Firebase Console \u2192 Cuentas de servicio;
  3) tu conexi\xF3n a internet.`
    );
    process.exit(1);
  }
}
async function contarCatalogo(db6) {
  const [prodsSnap, varsSnap] = await Promise.all([
    db6.collection("products").get(),
    db6.collectionGroup("variants").get()
  ]);
  const vivos = new Set(prodsSnap.docs.map((d) => d.id));
  let huerfanas = 0;
  varsSnap.forEach((d) => {
    if (!vivos.has(d.ref.parent?.parent?.id ?? "")) huerfanas += 1;
  });
  return { productos: prodsSnap.size, variantes: varsSnap.size, huerfanas };
}
async function respaldarCatalogo() {
  const ctx = {
    auth: { uid: "import-local-script", token: { role: "admin" } },
    data: {}
  };
  const r = await coreExportCatalog(ctx);
  const json = JSON.stringify(r.file, null, 2);
  const f = /* @__PURE__ */ new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const nombre = `backup-catalogo-antes-de-vaciar-${f.getFullYear()}-${p2(f.getMonth() + 1)}-${p2(f.getDate())}_${p2(f.getHours())}${p2(f.getMinutes())}${p2(f.getSeconds())}.json`;
  const ruta = resolve(process.cwd(), nombre);
  writeFileSync(ruta, json, "utf8");
  return ruta;
}
async function borrarEnLotes(db6, refs, etiqueta) {
  const TOPE = 300;
  let hechos = 0;
  for (let i = 0; i < refs.length; i += TOPE) {
    const tanda = refs.slice(i, i + TOPE);
    const b = db6.batch();
    tanda.forEach((r) => b.delete(r));
    await b.commit();
    hechos += tanda.length;
    process.stdout.write(`\r  ${etiqueta}: ${hechos}/${refs.length}`);
  }
  if (refs.length) process.stdout.write("\n");
  return hechos;
}
async function vaciarCatalogo(db6) {
  const [prodsSnap, varsSnap] = await Promise.all([
    db6.collection("products").get(),
    db6.collectionGroup("variants").get()
  ]);
  await borrarEnLotes(db6, varsSnap.docs.map((d) => d.ref), "Variantes borradas");
  await borrarEnLotes(db6, prodsSnap.docs.map((d) => d.ref), "Productos borrados");
  return contarCatalogo(db6);
}
async function auditarVaciado(c, backup) {
  try {
    await writeAudit({
      action: "vaciar_catalogo",
      adminUid: "import-local-script",
      targetId: "products",
      note: `vac\xEDo: ${c.productos} productos y ${c.variantes} variantes borrados \xB7 backup local ${backup.split(/[\\/]/).pop() ?? backup}`
    });
  } catch {
    console.log(
      `${AMARILLO}\xB7 Qued\xF3 sin nota en la auditor\xEDa (fall\xF3 writeAudit; el vaciado ya est\xE1 hecho).${NEUTRO}`
    );
  }
}
function exigirCero(final) {
  if (final.productos || final.variantes) {
    console.error(
      `${ROJO}\u2717 Quedaron rastros (productos ${final.productos}, variantes ${final.variantes}).${NEUTRO}
  Corre el comando de nuevo: termina de quitar lo que qued\xF3.`
    );
    process.exit(1);
  }
  console.log(`${VERDE}\u2713 Cat\xE1logo en CERO: 0 productos, 0 variantes, 0 hu\xE9rfanas.${NEUTRO}`);
}
async function modoVaciar() {
  console.log(
    `SPOT 24 \xB7 Vaciado de cat\xE1logo (5.92d)

Borra TODOS los productos y variantes de tu base REAL (incluidas las
hu\xE9rfanas de productos borrados) y la deja en cero. Antes de borrar
guarda SIEMPRE una copia local en JSON restaurable desde el panel.
`
  );
  const env = cargarEnv();
  titulo("Conexi\xF3n a tu Firebase");
  const db6 = await conectarDB(env);
  const conteo = await contarCatalogo(db6);
  titulo("Estado actual del cat\xE1logo");
  console.log(`\xB7 Productos:  ${conteo.productos}`);
  console.log(
    `\xB7 Variantes:  ${conteo.variantes} (incluye ${conteo.huerfanas} hu\xE9rfana${conteo.huerfanas === 1 ? "" : "s"} de productos borrados)`
  );
  if (!conteo.productos && !conteo.variantes) {
    console.log(`${VERDE}\u2713 El cat\xE1logo YA est\xE1 en cero. No hay nada que vaciar.${NEUTRO}`);
    process.exit(0);
  }
  const resp = (await preguntar(`
Escribe VACIAR para borrar TODO lo de arriba (cualquier otra cosa cancela): `)).trim().toUpperCase();
  if (resp !== "VACIAR") {
    console.log("Cancelado. No se borr\xF3 nada.");
    process.exit(0);
  }
  titulo("Copia de seguridad (siempre antes de borrar)");
  const backup = await respaldarCatalogo();
  console.log(`${VERDE}\u2713 Copia guardada: ${backup}${NEUTRO}`);
  console.log(
    `  (${(statSync(backup).size / 1024).toFixed(1)} KB \xB7 formato del panel: puedes restaurarla desde Copias de seguridad \u2192 Restaurar desde archivo)`
  );
  titulo("Vaciando");
  const final = await vaciarCatalogo(db6);
  exigirCero(final);
  await auditarVaciado(conteo, backup);
  console.log(
    `
Listo. Para importar limpia desde tu PDF:
  node scripts\\importar-inventario-local.mjs "ruta\\ACCESORIOS_LIMPIO.pdf"
(la copia de seguridad queda en esta carpeta por si necesitas volver atr\xE1s).`
  );
  process.exit(0);
}
async function main() {
  const [, , pdfArg, categoriaArg] = process.argv;
  if (pdfArg === "--vaciar") {
    await modoVaciar();
    return;
  }
  if (!pdfArg) {
    console.log(
      `SPOT 24 \xB7 Importaci\xF3n local de inventario (opci\xF3n B)

Uso:
  node scripts\\importar-inventario-local.mjs "ruta\\ACCESORIOS_LIMPIO.pdf"
  node scripts\\importar-inventario-local.mjs "ruta\\ACCESORIOS_LIMPIO.pdf" ID_DE_CATEGORIA
  node scripts\\importar-inventario-local.mjs --vaciar      (solo vac\xEDa el cat\xE1logo, sin PDF)

Qu\xE9 hace:
  1. Lee tu PDF (reporte del POS o lista con doble precio \u2014 detecta el formato solo).
  2. Te muestra qu\xE9 VA a importar y te pide confirmaci\xF3n.
  3. Crea/actualiza los productos en tu base de datos REAL de Firebase
     (la misma de la app; no hay una base "de prueba").
  4. Opcional (te pregunta antes): VACIAR el cat\xE1logo para partir de cero,
     sin rastros viejos \u2014 guarda copia de seguridad local autom\xE1tica.

Sin tope de tiempo: con tu red puede tardar varios minutos \u2014 no cierres la terminal.`
    );
    process.exit(0);
  }
  const rutaPdf = resolve(pdfArg);
  if (!existsSync(rutaPdf)) {
    console.error(`${ROJO}\u2717 No existe el archivo: ${rutaPdf}${NEUTRO}`);
    process.exit(1);
  }
  const peso = statSync(rutaPdf).size;
  if (peso > 4 * 1024 * 1024) {
    console.error(`${ROJO}\u2717 El PDF pesa ${(peso / 1024 / 1024).toFixed(1)} MB (tope 4 MB).${NEUTRO}`);
    process.exit(1);
  }
  const env = cargarEnv();
  titulo("Entorno");
  console.log(`\xB7 .env:      ${env.ruta}`);
  console.log(`\xB7 Proyecto:  ${VERDE}${env.projecto}${NEUTRO} (el MISMO que producci\xF3n \u2014 lo que se escriba aqu\xED queda)`);
  console.log(`\xB7 PDF:       ${recortar(rutaPdf, 70)} (${(peso / 1024).toFixed(0)} KB)`);
  titulo("1 \xB7 Lectura del PDF");
  const pdfBase64 = readFileSync(rutaPdf).toString("base64");
  const paginas = await extraerItemsPdf(pdfBase64);
  const parseo = parseInventarioAuto(paginas);
  const nombreFormato = parseo.formato === "lista-limpia" ? "lista con doble precio (usa el SIN impuesto)" : "reporte del POS";
  if (!parseo.filas.length) {
    console.error(
      `${ROJO}\u2717 No se reconoci\xF3 ning\xFAn producto.${NEUTRO}
Motivos:
` + parseo.problemas.map((p) => `  \xB7 ${p}`).join("\n")
    );
    process.exit(1);
  }
  console.log(`${VERDE}\u2713 Formato detectado: ${nombreFormato}${NEUTRO}`);
  console.log(`\u2713 ${parseo.filas.length} filas listas \xB7 ${parseo.problemas.length} avisos`);
  titulo("Muestra de lo que va a importar (primeras 8)");
  for (const f of parseo.filas.slice(0, 8)) {
    console.log(
      `  ${f.codigo.padEnd(12)} ${AMARILLO}$${f.costo.toFixed(2).padStart(8)}${NEUTRO}  stock ${String(f.existencia).padStart(4)}  ${recortar(f.descripcion, 46)}`
    );
  }
  if (parseo.filas.length > 8) console.log(`  \u2026 y ${parseo.filas.length - 8} filas m\xE1s`);
  if (parseo.problemas.length) {
    titulo(`Avisos (${parseo.problemas.length})`);
    for (const p of parseo.problemas) console.log(`  ${AMARILLO}\xB7${NEUTRO} ${p}`);
  }
  titulo("2 \xB7 Conexi\xF3n a tu Firebase");
  const db6 = await conectarDB(env);
  let categoryId = (categoriaArg ?? "").trim();
  if (!categoryId) {
    const snap = await db6.collection("categories").get();
    const cats = snap.docs.map((d) => ({ id: d.id, nombre: String(d.data()["name"] ?? d.id) })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!cats.length) {
      console.error(`${ROJO}\u2717 No hay categor\xEDas en el panel: crea primero la categor\xEDa (p. ej. ACCESORIOS).${NEUTRO}`);
      process.exit(1);
    }
    console.log("Categor\xEDas disponibles:");
    cats.forEach((c, i) => console.log(`  ${String(i + 1).padStart(2)}) ${c.nombre} ${GRIS}(${c.id})${NEUTRO}`));
    const respuesta = (await preguntar("N\xFAmero de la categor\xEDa donde caer\xE1n los NUEVOS productos: ")).trim();
    const elegida = cats[Number(respuesta) - 1];
    if (!elegida) {
      console.error(`${ROJO}\u2717 \xAB${respuesta}\xBB no es una opci\xF3n v\xE1lida.${NEUTRO}`);
      process.exit(1);
    }
    categoryId = elegida.id;
    console.log(`Elegida: ${VERDE}${elegida.nombre}${NEUTRO} (${categoryId})`);
  } else {
    const doc = await db6.collection("categories").doc(categoryId).get();
    if (!doc.exists) {
      console.error(`${ROJO}\u2717 La categor\xEDa \xAB${categoryId}\xBB no existe. C\xF3rralo sin ese argumento para ver la lista.${NEUTRO}`);
      process.exit(1);
    }
  }
  titulo("3 \xB7 Estado actual del cat\xE1logo");
  const conteo = await contarCatalogo(db6);
  console.log(`\xB7 Productos:  ${conteo.productos}`);
  console.log(
    `\xB7 Variantes:  ${conteo.variantes} (incluye ${conteo.huerfanas} hu\xE9rfana${conteo.huerfanas === 1 ? "" : "s"} de productos borrados)`
  );
  let vaciado = false;
  if (conteo.productos || conteo.variantes) {
    console.log(
      `
Si quieres partir de CERO (sin rastros viejos), aqu\xED puedes vaciar todo
antes de importar: primero se guarda una copia de seguridad local (JSON
restaurable desde el panel) y despu\xE9s se borra TODO el cat\xE1logo.`
    );
    const rl3resp = (await preguntar("Escribe VACIAR para borrar todo el cat\xE1logo antes de importar (ENTER = conservar): ")).trim().toUpperCase();
    if (rl3resp === "VACIAR") {
      titulo("Copia de seguridad (siempre antes de borrar)");
      const backup = await respaldarCatalogo();
      console.log(`${VERDE}\u2713 Copia guardada: ${backup}${NEUTRO}`);
      console.log(
        `  (${(statSync(backup).size / 1024).toFixed(1)} KB \xB7 restaurable desde Copias de seguridad \u2192 Restaurar desde archivo)`
      );
      titulo("Vaciando el cat\xE1logo");
      const final = await vaciarCatalogo(db6);
      exigirCero(final);
      await auditarVaciado(conteo, backup);
      vaciado = true;
    } else {
      console.log("Conservando el cat\xE1logo actual (solo se crear\xE1n/actualizar\xE1n los del PDF).");
    }
  } else {
    console.log(`${VERDE}Ya est\xE1 en cero: la importaci\xF3n crear\xE1 todo fresco.${NEUTRO}`);
  }
  titulo("4 \xB7 Confirmaci\xF3n");
  if (vaciado) {
    console.log(`El cat\xE1logo qued\xF3 VAC\xCDO. Voy a crear los ${VERDE}${parseo.filas.length}${NEUTRO} productos del PDF.`);
    console.log(`(Si cancelas aqu\xED, el cat\xE1logo sigue vac\xEDo \u2014 puedes restaurar la copia desde el panel.)`);
  } else {
    console.log(`Voy a crear/actualizar ${VERDE}${parseo.filas.length}${NEUTRO} productos en tu base de datos REAL.`);
  }
  console.log(`${AMARILLO}Esto no es una simulaci\xF3n: los productos aparecer\xE1n en el cat\xE1logo de verdad.${NEUTRO}`);
  const si = (await preguntar("Escribe SI para confirmar (cualquier otra cosa cancela): ")).trim().toLowerCase();
  if (si !== "si") {
    console.log("Cancelado. No se escribi\xF3 nada.");
    process.exit(0);
  }
  titulo("5 \xB7 Importando (puede tardar varios minutos con tu red \u2014 NO cierres la terminal)");
  const puntos = setInterval(() => process.stdout.write("\xB7"), 5e3);
  const inicio = Date.now();
  try {
    const ctx = {
      auth: { uid: "import-local-script", token: { role: "admin" } },
      data: { pdfBase64, categoryId }
    };
    const r = await coreImportInventory(ctx);
    clearInterval(puntos);
    const seg = ((Date.now() - inicio) / 1e3).toFixed(1);
    console.log(`
${VERDE}\u2713 LISTO en ${seg} s${NEUTRO}`);
    console.log(`  Formato:     ${r.formato}`);
    console.log(`  Filas:       ${r.filas}`);
    console.log(`  Creados:     ${VERDE}${r.creados}${NEUTRO}`);
    console.log(`  Actualizados: ${r.actualizados}`);
    if (vaciado) {
      console.log(`  Parti\xF3 de CERO: el cat\xE1logo es EXACTAMENTE estos ${r.creados} productos, sin rastros viejos.`);
    }
    if (r.omitidasHuerfanas) {
      console.log(
        `  Hu\xE9rfanas:   ${r.omitidasHuerfanas} (variantes de productos borrados \u2014 se omitieron; esas filas se crearon como productos nuevos)`
      );
    }
    if (r.problemas.length) {
      console.log(`  Avisos:      ${r.problemas.length}`);
      for (const p of r.problemas) console.log(`    ${AMARILLO}\xB7${NEUTRO} ${p}`);
    }
    console.log(
      `
Los productos YA est\xE1n en tu cat\xE1logo (rev\xEDsalos en el panel de la app de producci\xF3n).
Qued\xF3 registro en la auditor\xEDa como \xABimport-local-script\xBB.
Recuerda: cuando hayas verificado, haz el push de los archivos del lote
spot24-ronda-5.75 (ver LEEME-RONDA-5.75.md) \u2014 la importaci\xF3n NO hay que repetirla.`
    );
    process.exit(0);
  } catch (e) {
    clearInterval(puntos);
    const codigo = e.code ?? "n/d";
    console.error(`
${ROJO}\u2717 Fall\xF3 la importaci\xF3n (c\xF3digo ${codigo}):${NEUTRO}
  ${e.message ?? e}`);
    process.exit(1);
  }
}
main().catch((e) => {
  console.error(`${ROJO}\u2717 Error inesperado:${NEUTRO}`, e);
  process.exit(1);
});
