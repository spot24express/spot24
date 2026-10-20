/**
 * SPOT 24 · Copias de seguridad del catálogo (ronda 5.89, a pedido del dueño:
 * «es posible que admin pueda hacer copia de seguridad del catalogo de
 * productos y poder restaurar esa copia y que pueda programar copias de
 * seguridad»).
 *
 * DISEÑO CONFIRMADO POR EL DUEÑO (6 decisiones):
 *   1. Copia manual → botón «Descargar copia» (archivo JSON al teléfono/PC).
 *   2. Copias automáticas → DIARIAS a las 6:00 a.m. hora de Venezuela
 *      (el cron vive en netlify/functions/backup-catalog.ts: '0 10 * * *' UTC;
 *      Venezuela = UTC-4 todo el año, sin horario de verano).
 *   3. Retención → las ÚLTIMAS 30 por tipo (auto y manual rotan por separado).
 *   4. Alcance → SOLO catálogo: categorías + productos + variantes (con
 *      precios, stock, fotos como ENLACES y descripciones). NO pedidos ni
 *      usuarios.
 *   5. Restauración → REEMPLAZO total del catálogo con doble confirmación
 *      (el panel exige escribir RESTAURAR).
 *   6. Restaurar desde ARCHIVO o desde la NUBE (lista de copias guardadas).
 *
 * PLAN GRATIS (Spark) SIN Cloud Storage: las fotos del catálogo son ENLACES
 * (imgbb o /img/…), así que la copia es texto puro. Los snapshots viven
 * DENTRO de Firestore (colección catalogBackups), troceados en chunks de
 * ≤512 KB para respetar el límite de 1 MiB por documento con margen, con un
 * documento «meta» por copia (fecha, modo, conteos, bytes) para listar sin
 * leer el contenido. 1 GiB gratis ≈ miles de copias de este tamaño.
 *
 * SEGURIDAD DE LA RESTAURACIÓN (reemplazo sin ventana vacía):
 *   · ANTES de tocar nada se guarda automáticamente una copia del estado
 *     actual (modo manual, nota «previo a restaurar»): si el resultado no
 *     gusta, se restaura esa copia y se vuelve atrás. Si esa copia previa
 *     falla, la restauración se CANCELA (jamás se pisa el catálogo sin red
 *     de seguridad).
 *   · MORPH, no delete-then-create: primero se ESCRIBEN categorías,
 *     productos y variantes de la copia (conservando sus IDs, para que las
 *     fotos y el historial sigan apuntando bien) y al final se BORRAN los
 *     sobrantes. La tienda nunca se queda vacía a mitad del proceso.
 *   · Escrituras en lotes ≤ 450 ops (límite de Firestore: 500).
 *
 * ROLES (igual que el resto de las funciones administrativas):
 *   exportar/listar/guardar → admin o gerente; RESTAURAR → SOLO admin.
 *
 * Los helpers PUROS (validateBackupFile, chunkJson, planRotacion…) están
 * exportados para poder probarse sin Firestore (functions/src/__tests__).
 */
import admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/* ── Constantes (tope defensivo de cada límite, con margen) ── */

/** Marca de formato del archivo: la validación rechaza cualquier otra cosa. */
export const BACKUP_FORMAT = 'spot24-catalog-backup';
export const BACKUP_VERSION = 1;
export const MAX_CATEGORIAS = 200;
export const MAX_PRODUCTOS = 1000;
export const MAX_VARIANTES_POR_PRODUCTO = 100;
/** Tamaño máximo de UNA copia (57 productos ≈ 0,2 MB; tope 20 MB = catálogo enorme). */
export const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
/** Trozo máximo por documento Firestore (doc admite 1 MiB → margen x2). */
export const CHUNK_BYTES = 512 * 1024;
/** Copias conservadas por tipo (auto y manual rotan por separado). */
export const RETENCION_POR_MODO = 30;
/** Edad mínima de la última copia automática para que el cron cree otra (idempotencia). */
export const GAP_AUTOMATICA_HORAS = 20;
/** Firestore admite 500 ops por lote: margen para el control. */
const OPS_POR_LOTE = 450;

/* ── Contratos (espejo en src/features/admin/services/backups.service.ts) ── */

export interface BackupVariante {
  id: string;
  name: string;
  sku: string;
  priceUsd: number;
  stock: number;
  active: boolean;
}

export interface BackupProducto {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  basePriceUsd: number;
  images: string[];
  searchTerms: string[];
  stockTotal: number;
  variantCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  variants: BackupVariante[];
}

export interface BackupCategoria {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  active: boolean;
  parentId: string;
  createdAt: number;
  updatedAt: number;
}

export interface CatalogSnapshot {
  categories: BackupCategoria[];
  products: BackupProducto[];
}

export interface BackupFile {
  format: string;
  version: number;
  app: string;
  /** ISO UTC del momento de la copia. */
  exportedAt: string;
  catalog: CatalogSnapshot;
}

export interface BackupMeta {
  id: string;
  createdAt: number;
  mode: 'auto' | 'manual';
  counts: { categorias: number; productos: number; variantes: number };
  bytes: number;
  chunks: number;
  note: string;
  byUid: string;
}

/* ── Helpers puros (exportados para los tests) ── */

export function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** Normaliza createdAt/updatedAt: número, Timestamp de Firestore o {seconds}. */
export function normalizeTs(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.round(v));
  if (v && typeof v === 'object') {
    const t = v as { toMillis?: unknown; seconds?: unknown };
    if (typeof t.toMillis === 'function') return (t.toMillis as () => number).call(t);
    if (typeof t.seconds === 'number') return Math.round(t.seconds * 1000);
  }
  return 0;
}

function numSeguro(v: unknown, max = 1_000_000): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.round(n * 100) / 100, max);
}

/** Solo URLs https (imgbb) o rutas del repo /img/… — igual que el panel. */
function urlFoto(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return /^https:\/\//.test(s) || /^\/img\//.test(s) ? s.slice(0, 500) : '';
}

/**
 * Valida el archivo COMPLETO de copia (lo que baja el botón «Descargar» o lo
 * que el panel sube) y lo devuelve con TODOS los campos en lista blanca y
 * coercidos. Jamás confía en la forma del JSON: un archivo alterado a mano
 * termina como copia limpia o con un motivo claro.
 */
export function validateBackupFile(raw: unknown): { ok: true; file: BackupFile } | { ok: false; motivo: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, motivo: 'El archivo no contiene una copia válida.' };
  const f = raw as Record<string, unknown>;
  if (f['format'] !== BACKUP_FORMAT) {
    return { ok: false, motivo: `Este archivo no es una copia de SPOT 24 (formato ${BACKUP_FORMAT}).` };
  }
  if (f['version'] !== BACKUP_VERSION) {
    return { ok: false, motivo: `La copia usa una versión distinta (${String(f['version'])}); actualiza la app.` };
  }
  const cat = f['catalog'];
  if (!cat || typeof cat !== 'object') {
    return { ok: false, motivo: 'La copia está incompleta: no trae el catálogo.' };
  }
  const rawCats = (cat as Record<string, unknown>)['categories'];
  const rawProds = (cat as Record<string, unknown>)['products'];
  if (!Array.isArray(rawCats) || !Array.isArray(rawProds)) {
    return { ok: false, motivo: 'La copia está incompleta: faltan las categorías o los productos.' };
  }
  if (rawCats.length > MAX_CATEGORIAS) {
    return { ok: false, motivo: `La copia trae ${rawCats.length} categorías (tope ${MAX_CATEGORIAS}).` };
  }
  if (rawProds.length > MAX_PRODUCTOS) {
    return { ok: false, motivo: `La copia trae ${rawProds.length} productos (tope ${MAX_PRODUCTOS}). Divídela o pide ampliar el tope.` };
  }

  const idsCategoria = new Set<string>();
  const categorias: BackupCategoria[] = [];
  for (const c of rawCats) {
    if (!c || typeof c !== 'object') return { ok: false, motivo: 'Hay una categoría dañada dentro de la copia.' };
    const o = c as Record<string, unknown>;
    const id = sanitizeStr(o['id'], 120);
    const name = sanitizeStr(o['name'], 60);
    if (!id || !name) {
      return { ok: false, motivo: 'Hay una categoría sin identificador o sin nombre dentro de la copia.' };
    }
    if (idsCategoria.has(id)) return { ok: false, motivo: `La copia trae categorías repetidas (${id}).` };
    idsCategoria.add(id);
    categorias.push({
      id,
      name,
      tagline: sanitizeStr(o['tagline'], 80),
      imageUrl: urlFoto(o['imageUrl']),
      active: o['active'] !== false,
      parentId: sanitizeStr(o['parentId'], 120),
      createdAt: normalizeTs(o['createdAt']),
      updatedAt: normalizeTs(o['updatedAt']),
    });
  }

  const idsProducto = new Set<string>();
  const products: BackupProducto[] = [];
  for (const p of rawProds) {
    if (!p || typeof p !== 'object') return { ok: false, motivo: 'Hay un producto dañado dentro de la copia.' };
    const o = p as Record<string, unknown>;
    const id = sanitizeStr(o['id'], 120);
    const name = sanitizeStr(o['name'], 120);
    const categoryId = sanitizeStr(o['categoryId'], 120);
    if (!id || !name || !categoryId) {
      return { ok: false, motivo: 'Hay un producto sin identificador, nombre o categoría dentro de la copia.' };
    }
    if (idsProducto.has(id)) return { ok: false, motivo: `La copia trae productos repetidos (${id}).` };
    idsProducto.add(id);
    const rawVars = o['variants'];
    if (!Array.isArray(rawVars)) {
      return { ok: false, motivo: `El producto «${name}» no trae variantes en la copia.` };
    }
    if (rawVars.length > MAX_VARIANTES_POR_PRODUCTO) {
      return { ok: false, motivo: `El producto «${name}» trae ${rawVars.length} variantes (tope ${MAX_VARIANTES_POR_PRODUCTO}).` };
    }
    const images = Array.isArray(o['images'])
      ? (o['images'] as unknown[]).map(urlFoto).filter(Boolean).slice(0, 6)
      : [];
    const searchTerms = Array.isArray(o['searchTerms'])
      ? (o['searchTerms'] as unknown[]).map((t) => sanitizeStr(t, 40).toLowerCase()).filter(Boolean).slice(0, 20)
      : [];
    const variants: BackupVariante[] = [];
    for (const v of rawVars) {
      if (!v || typeof v !== 'object') return { ok: false, motivo: `El producto «${name}» tiene una variante dañada.` };
      const vo = v as Record<string, unknown>;
      const vid = sanitizeStr(vo['id'], 120);
      if (!vid) return { ok: false, motivo: `El producto «${name}» tiene una variante sin identificador.` };
      variants.push({
        id: vid,
        name: sanitizeStr(vo['name'], 80) || 'Estándar',
        sku: sanitizeStr(vo['sku'], 40).toUpperCase(),
        priceUsd: numSeguro(vo['priceUsd']),
        stock: Math.floor(numSeguro(vo['stock'])),
        active: vo['active'] !== false,
      });
    }
    products.push({
      id,
      slug: sanitizeStr(o['slug'], 140) || `producto-${id.slice(0, 8)}`,
      code: sanitizeStr(o['code'], 40).toUpperCase(),
      name,
      brand: sanitizeStr(o['brand'], 60),
      description: sanitizeStr(o['description'], 1000),
      categoryId,
      basePriceUsd: numSeguro(o['basePriceUsd']),
      images,
      searchTerms,
      stockTotal: Math.floor(numSeguro(o['stockTotal'])),
      variantCount: Math.max(variants.length, Math.floor(numSeguro(o['variantCount'])) || variants.length),
      active: o['active'] !== false,
      createdAt: normalizeTs(o['createdAt']),
      updatedAt: normalizeTs(o['updatedAt']),
      variants,
    });
  }
  // Referencias sanas: todo producto apunta a una categoría QUE VIENE EN LA COPIA.
  const huerfanos = products.filter((p) => !idsCategoria.has(p.categoryId));
  if (huerfanos.length) {
    return {
      ok: false,
      motivo: `${huerfanos.length} producto(s) apuntan a categorías que no vienen en la copia (p. ej. «${huerfanos[0]?.name ?? 'desconocido'}»). Copia incompleta: exporta el catálogo de nuevo.`,
    };
  }

  const exportedAt = typeof f['exportedAt'] === 'string' ? f['exportedAt'].slice(0, 40) : '';
  return {
    ok: true,
    file: {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      app: 'spot24',
      exportedAt,
      catalog: { categories: categorias, products },
    },
  };
}

/**
 * Trocea el JSON por BYTES UTF-8 (no por caracteres: los acentos ocupan 2
 * bytes y cortar a ciegas rompería el límite real de Firestore) retrocediendo
 * hasta el inicio de un carácter si el corte cae en medio.
 */
export function chunkJson(json: string): string[] {
  const buf = Buffer.from(json, 'utf8');
  if (buf.length <= CHUNK_BYTES) return [json];
  const parts: string[] = [];
  let start = 0;
  while (start < buf.length) {
    let end = Math.min(start + CHUNK_BYTES, buf.length);
    if (end < buf.length) {
      // Los bytes de continuación UTF-8 empiezan con 10xxxxxx: retrocede
      // hasta encontrar el inicio del carácter (?? 0: índice fuera → no es
      // continuación → corta ahí).
      while (end > start && ((buf[end] ?? 0) & 0xc0) === 0x80) end -= 1;
    }
    parts.push(buf.subarray(start, end).toString('utf8'));
    start = end;
  }
  return parts;
}

export function joinChunks(parts: string[]): string {
  return parts.join('');
}

/**
 * Plan de rotación: metas ORDENADAS de más nueva a más vieja. Conserva las
 * primeras RETENCION_POR_MODO de cada modo y devuelve los ids a borrar.
 * (Auto y manual rotan por separado: las copias de guardia del dueño no
 * desplazan al historial diario.)
 */
export function planRotacion(metas: Array<{ id?: string; mode?: unknown }>): string[] {
  const vistos = { auto: 0, manual: 0 };
  const borrar: string[] = [];
  for (const m of metas) {
    const id = typeof m.id === 'string' ? m.id : '';
    if (!id) continue;
    const modo = m.mode === 'auto' ? 'auto' : 'manual';
    vistos[modo] += 1;
    if (vistos[modo] > RETENCION_POR_MODO) borrar.push(id);
  }
  return borrar;
}

/* ── Ensamblado del catálogo (Lecturas Admin SDK) ── */

/** Igual que el panel: variantes de TODOS los productos en UNA lectura sin where (5.87d: sin índices manuales). */
async function leerVariantesPorProducto(): Promise<Map<string, BackupVariante[]>> {
  const porProducto = new Map<string, BackupVariante[]>();
  const snap = await db().collectionGroup('variants').get();
  snap.docs.forEach((d) => {
    const pid = d.ref.parent?.parent?.id;
    if (!pid) return;
    const o = d.data();
    const v: BackupVariante = {
      id: d.id,
      name: sanitizeStr(o['name'], 80) || 'Estándar',
      sku: sanitizeStr(o['sku'], 40).toUpperCase(),
      priceUsd: numSeguro(o['priceUsd']),
      stock: Math.floor(numSeguro(o['stock'])),
      active: o['active'] !== false,
    };
    const lista = porProducto.get(pid) ?? [];
    lista.push(v);
    porProducto.set(pid, lista);
  });
  return porProducto;
}

/** Lee el catálogo completo y lo devuelve como snapshot plano (solo campos conocidos). */
export async function assembleCatalog(): Promise<CatalogSnapshot> {
  const [catsSnap, prodsSnap, variantes] = await Promise.all([
    db().collection('categories').get(),
    db().collection('products').get(),
    leerVariantesPorProducto(),
  ]);

  const categories: BackupCategoria[] = catsSnap.docs.map((d) => {
    const o = d.data();
    return {
      id: d.id,
      name: sanitizeStr(o['name'], 60),
      tagline: sanitizeStr(o['tagline'], 80),
      imageUrl: urlFoto(o['imageUrl']),
      active: o['active'] !== false,
      parentId: sanitizeStr(o['parentId'], 120),
      createdAt: normalizeTs(o['createdAt']),
      updatedAt: normalizeTs(o['updatedAt']),
    };
  });
  const products: BackupProducto[] = prodsSnap.docs.map((d) => {
    const o = d.data();
    const variants = (variantes.get(d.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
    return {
      id: d.id,
      slug: sanitizeStr(o['slug'], 140),
      code: sanitizeStr(o['code'], 40).toUpperCase(),
      name: sanitizeStr(o['name'], 120),
      brand: sanitizeStr(o['brand'], 60),
      description: sanitizeStr(o['description'], 1000),
      categoryId: sanitizeStr(o['categoryId'], 120),
      basePriceUsd: numSeguro(o['basePriceUsd']),
      images: Array.isArray(o['images']) ? (o['images'] as unknown[]).map(urlFoto).filter(Boolean).slice(0, 6) : [],
      searchTerms: Array.isArray(o['searchTerms']) ? (o['searchTerms'] as unknown[]).map((t) => sanitizeStr(t, 40).toLowerCase()).slice(0, 20) : [],
      stockTotal: Math.floor(numSeguro(o['stockTotal'])),
      variantCount: variants.length,
      active: o['active'] !== false,
      createdAt: normalizeTs(o['createdAt']),
      updatedAt: normalizeTs(o['updatedAt']),
      variants,
    };
  });
  return { categories, products };
}

/* ── Guardado del snapshot (meta + chunks) con rotación ── */

async function guardarSnapshot(opts: { mode: 'auto' | 'manual'; uid?: string; note?: string }): Promise<BackupMeta> {
  const snapshot = await assembleCatalog();
  if (snapshot.categories.length > MAX_CATEGORIAS) {
    throw new HttpsError('failed-precondition', `El catálogo tiene ${snapshot.categories.length} categorías (tope ${MAX_CATEGORIAS}).`);
  }
  if (snapshot.products.length > MAX_PRODUCTOS) {
    throw new HttpsError('failed-precondition', `El catálogo tiene ${snapshot.products.length} productos (tope ${MAX_PRODUCTOS}).`);
  }
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'spot24',
    exportedAt: new Date().toISOString(),
    catalog: snapshot,
  };
  const json = JSON.stringify(file);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes > MAX_SNAPSHOT_BYTES) {
    throw new HttpsError(
      'failed-precondition',
      `La copia ocupa ${(bytes / 1024 / 1024).toFixed(1)} MB (tope ${MAX_SNAPSHOT_BYTES / 1024 / 1024} MB). Contacta soporte para ampliar el almacenamiento de copias.`,
    );
  }
  const parts = chunkJson(json);
  const counts = {
    categorias: snapshot.categories.length,
    productos: snapshot.products.length,
    variantes: snapshot.products.reduce((a, p) => a + p.variants.length, 0),
  };

  const metaRef = db().collection('catalogBackups').doc();
  // Chunks en SUBCOLECCIÓN (catalogBackups/{id}/chunks/{i}): listar la
  // colección padre NO los trae, así que la lista del panel se lee barata.
  let loteActual = db().batch();
  let ops = 0;
  const lotes: admin.firestore.WriteBatch[] = [];
  const enLote = (fn: (b: admin.firestore.WriteBatch) => void): void => {
    if (ops >= OPS_POR_LOTE) {
      lotes.push(loteActual);
      loteActual = db().batch();
      ops = 0;
    }
    fn(loteActual);
    ops += 1;
  };
  parts.forEach((parte, i) => {
    enLote((b) => b.set(metaRef.collection('chunks').doc(String(i)), { i, json: parte }));
  });
  enLote((b) => b.set(metaRef, {
    createdAt: Date.now(),
    mode: opts.mode,
    counts,
    bytes,
    chunks: parts.length,
    note: (opts.note ?? '').slice(0, 80),
    byUid: opts.uid ?? '',
  }));
  lotes.push(loteActual);
  for (const b of lotes) await b.commit();

  await rotar();
  return {
    id: metaRef.id,
    createdAt: Date.now(),
    mode: opts.mode,
    counts,
    bytes,
    chunks: parts.length,
    note: (opts.note ?? '').slice(0, 80),
    byUid: opts.uid ?? '',
  };
}

/** Borra meta + chunks de una copia (en lotes de 450). */
async function borrarCopia(metaId: string): Promise<void> {
  const ref = db().collection('catalogBackups').doc(metaId);
  let loteActual = db().batch();
  let ops = 0;
  const lotes: admin.firestore.WriteBatch[] = [];
  const enLote = (fn: (b: admin.firestore.WriteBatch) => void): void => {
    if (ops >= OPS_POR_LOTE) {
      lotes.push(loteActual);
      loteActual = db().batch();
      ops = 0;
    }
    fn(loteActual);
    ops += 1;
  };
  const chunks = await ref.collection('chunks').get();
  chunks.docs.forEach((c) => enLote((b) => b.delete(c.ref)));
  enLote((b) => b.delete(ref));
  lotes.push(loteActual);
  for (const b of lotes) await b.commit();
}

/**
 * Rotación por modo (auto y manual por separado, 30 + 30). where('mode',…)
 * sin orderBy: un solo campo filtrado NO exige índice compuesto (lección
 * 5.87e) y el orden se resuelve en memoria.
 */
async function rotar(): Promise<void> {
  for (const modo of ['auto', 'manual'] as const) {
    const snap = await db().collection('catalogBackups').where('mode', '==', modo).limit(200).get();
    const metas = snap.docs
      .map((d) => ({ id: d.id, mode: d.data()['mode'], createdAt: Number(d.data()['createdAt'] ?? 0) }))
      .sort((a, b) => b.createdAt - a.createdAt);
    const aBorrar = planRotacion(metas);
    for (const id of aBorrar) await borrarCopia(id);
  }
}

/** Lee una copia guardada (meta + chunks en orden) y la devuelve como archivo. */
async function leerSnapshot(snapshotId: string): Promise<BackupFile> {
  const ref = db().collection('catalogBackups').doc(snapshotId);
  const metaSnap = await ref.get();
  if (!metaSnap.exists) {
    throw new HttpsError('not-found', 'Esa copia ya no existe (la rotación la borró). Elige otra de la lista.');
  }
  const chunksSnap = await ref.collection('chunks').orderBy('i').get();
  if (!chunksSnap.docs.length) {
    throw new HttpsError('internal', 'La copia está vacía (chunks perdidos). Elige otra o exporta de nuevo.');
  }
  const json = joinChunks(chunksSnap.docs.map((d) => String(d.data()['json'] ?? '')));
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new HttpsError('internal', 'La copia guardada está dañada (JSON ilegible). Elige otra o exporta de nuevo.');
  }
  const validado = validateBackupFile(raw);
  if (!validado.ok) throw new HttpsError('internal', `Copia guardada inválida: ${validado.motivo}`);
  return validado.file;
}

/* ── Cores (agnósticos del runtime: shims de Netlify + schedule) ── */

function requireStaff(ctx: CoreCtx, roles: string[]): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  if (typeof role !== 'string' || !roles.includes(role)) {
    throw new HttpsError('permission-denied', 'Solo administración o gerencia.');
  }
  return ctx.auth.uid;
}

/** GET-equivalente lógico: exporta el catálogo ACTUAL o una copia guardada (snapshotId). */
export async function coreExportCatalog(ctx: CoreCtx): Promise<unknown> {
  requireStaff(ctx, ['admin', 'gerente']);
  const snapshotId = sanitizeStr(ctx.data?.['snapshotId'], 120);
  if (snapshotId) {
    const file = await leerSnapshot(snapshotId);
    return { file, bytes: Buffer.byteLength(JSON.stringify(file), 'utf8') };
  }
  const snapshot = await assembleCatalog();
  const file: BackupFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'spot24',
    exportedAt: new Date().toISOString(),
    catalog: snapshot,
  };
  return { file, bytes: Buffer.byteLength(JSON.stringify(file), 'utf8') };
}

/** Lista las copias guardadas (solo metas: barato, jamás lee chunks). */
export async function coreListCatalogBackups(ctx: CoreCtx): Promise<unknown> {
  requireStaff(ctx, ['admin', 'gerente']);
  const snap = await db().collection('catalogBackups').orderBy('createdAt', 'desc').limit(100).get();
  const copias = snap.docs.map((d) => {
    const o = d.data();
    return {
      id: d.id,
      createdAt: Number(o['createdAt'] ?? 0),
      mode: o['mode'] === 'auto' ? 'auto' : 'manual',
      counts: {
        categorias: Number((o['counts'] as Record<string, unknown> | undefined)?.['categorias'] ?? 0),
        productos: Number((o['counts'] as Record<string, unknown> | undefined)?.['productos'] ?? 0),
        variantes: Number((o['counts'] as Record<string, unknown> | undefined)?.['variantes'] ?? 0),
      },
      bytes: Number(o['bytes'] ?? 0),
      chunks: Number(o['chunks'] ?? 0),
      note: String(o['note'] ?? ''),
    };
  });
  return { copias };
}

/** Guarda una copia del estado ACTUAL en la nube (botón «Guardar copia en la nube»). */
export async function coreSaveCatalogBackup(ctx: CoreCtx): Promise<unknown> {
  const uid = requireStaff(ctx, ['admin', 'gerente']);
  const meta = await guardarSnapshot({ mode: 'manual', uid, note: 'manual desde el panel' });
  return { copia: meta };
}

/**
 * RESTAURA una copia REEMPLAZANDO el catálogo (solo admin). Fuente:
 *  · { snapshotId } → una copia de la lista en la nube.
 *  · { snapshot }   → el objeto del archivo subido por el panel.
 * Siempre guarda primero una copia del estado actual (red de seguridad).
 */
export async function coreRestoreCatalog(ctx: CoreCtx): Promise<unknown> {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  if (role !== 'admin') throw new HttpsError('permission-denied', 'Solo administración puede restaurar el catálogo.');
  const adminUid = ctx.auth.uid;

  const snapshotId = sanitizeStr(ctx.data?.['snapshotId'], 120);
  const raw = ctx.data?.['snapshot'];
  let file: BackupFile;
  if (snapshotId) {
    file = await leerSnapshot(snapshotId);
  } else if (raw && typeof raw === 'object') {
    const validado = validateBackupFile(raw);
    if (!validado.ok) throw new HttpsError('invalid-argument', validado.motivo);
    file = validado.file;
  } else {
    throw new HttpsError('invalid-argument', 'Falta la copia a restaurar (archivo o copia de la nube).');
  }
  const { categories, products } = file.catalog;

  // 1. RED DE SEGURIDAD: copia del estado actual ANTES de tocar nada.
  let copiaPrevia: string;
  try {
    const previa = await guardarSnapshot({ mode: 'manual', uid: adminUid, note: 'previo a restaurar' });
    copiaPrevia = previa.id;
  } catch (e) {
    throw new HttpsError(
      'failed-precondition',
      `No se pudo guardar la copia previa de seguridad, así que la restauración se CANCELÓ sin tocar el catálogo. Motivo: ${(e as Error)?.message ?? 'desconocido'}`,
    );
  }

  // 2. MORPH: escribir TODO lo de la copia (IDs originales) y borrar los
  //    sobrantes al final. La tienda jamás se queda vacía a mitad.
  const ahora = Date.now();
  const lotes: admin.firestore.WriteBatch[] = [];
  let loteActual = db().batch();
  let ops = 0;
  const enLote = (fn: (b: admin.firestore.WriteBatch) => void): void => {
    if (ops >= OPS_POR_LOTE) {
      lotes.push(loteActual);
      loteActual = db().batch();
      ops = 0;
    }
    fn(loteActual);
    ops += 1;
  };

  for (const c of categories) {
    enLote((b) => b.set(db().collection('categories').doc(c.id), {
      name: c.name,
      tagline: c.tagline,
      imageUrl: c.imageUrl,
      active: c.active,
      parentId: c.parentId,
      createdAt: c.createdAt || ahora,
      updatedAt: c.updatedAt || ahora,
    }));
  }
  for (const p of products) {
    enLote((b) => b.set(db().collection('products').doc(p.id), {
      slug: p.slug,
      code: p.code,
      name: p.name,
      brand: p.brand,
      description: p.description,
      categoryId: p.categoryId,
      basePriceUsd: p.basePriceUsd,
      images: p.images,
      searchTerms: p.searchTerms,
      stockTotal: p.stockTotal,
      variantCount: p.variantCount,
      active: p.active,
      createdAt: p.createdAt || ahora,
      updatedAt: p.updatedAt || ahora,
    }));
    for (const v of p.variants) {
      enLote((b) => b.set(db().collection('products').doc(p.id).collection('variants').doc(v.id), {
        name: v.name,
        sku: v.sku,
        priceUsd: v.priceUsd,
        stock: v.stock,
        active: v.active,
      }));
    }
  }
  // 5.89: SIEMPRE empujar el lote parcial final (si ops cruzó 450, el
  // loteActual pendiente NO está todavía dentro de `lotes`).
  lotes.push(loteActual);
  for (const b of lotes) await b.commit();

  // 3. BORRAR SOBRANTES del estado actual (después de escribir: sin ventana vacía).
  const idsProductoCopia = new Set(products.map((p) => p.id));
  const idsCategoriaCopia = new Set(categories.map((c) => c.id));
  const idsVarianteCopia = new Map<string, Set<string>>(products.map((p) => [p.id, new Set(p.variants.map((v) => v.id))]));
  const [prodsActuales, varsActuales, catsActuales] = await Promise.all([
    db().collection('products').get(),
    db().collectionGroup('variants').get(),
    db().collection('categories').get(),
  ]);

  let productosEliminados = 0;
  let variantesEliminadas = 0;
  let categoriasEliminadas = 0;
  const lotesBorrado: admin.firestore.WriteBatch[] = [];
  let loteBorrado = db().batch();
  let opsBorrado = 0;
  const enLoteBorrado = (fn: (b: admin.firestore.WriteBatch) => void): void => {
    if (opsBorrado >= OPS_POR_LOTE) {
      lotesBorrado.push(loteBorrado);
      loteBorrado = db().batch();
      opsBorrado = 0;
    }
    fn(loteBorrado);
    opsBorrado += 1;
  };

  // Variantes sobrantes de productos que quedan (las de productos borrados
  // desaparecen con su padre... en Firestore NUNCA: la subcolección hay que
  // vaciarla a mano — se borran TODAS las variantes de productos que no
  // vienen en la copia, y las sobrantes de los que sí).
  varsActuales.docs.forEach((d) => {
    const pid = d.ref.parent?.parent?.id ?? '';
    const enCopia = idsProductoCopia.has(pid) && idsVarianteCopia.get(pid)?.has(d.id);
    if (!enCopia) {
      enLoteBorrado((b) => b.delete(d.ref));
      variantesEliminadas += 1;
    }
  });
  prodsActuales.docs.forEach((d) => {
    if (!idsProductoCopia.has(d.id)) {
      enLoteBorrado((b) => b.delete(d.ref));
      productosEliminados += 1;
    }
  });
  catsActuales.docs.forEach((d) => {
    if (!idsCategoriaCopia.has(d.id)) {
      enLoteBorrado((b) => b.delete(d.ref));
      categoriasEliminadas += 1;
    }
  });
  lotesBorrado.push(loteBorrado);
  for (const b of lotesBorrado) await b.commit();

  await writeAudit({
    action: 'restaurar_catalogo',
    adminUid,
    targetId: snapshotId || 'archivo',
    note: `${countsDe(file)} · eliminados: ${productosEliminados} p / ${variantesEliminadas} v / ${categoriasEliminadas} c · previa ${copiaPrevia.slice(0, 8)}`,
  });

  return {
    restaurado: true,
    categorias: categories.length,
    productos: products.length,
    variantes: products.reduce((a, p) => a + p.variants.length, 0),
    productosEliminados,
    variantesEliminadas,
    categoriasEliminadas,
    copiaPrevia,
  };
}

function countsDe(file: BackupFile): string {
  const v = file.catalog.products.reduce((a, p) => a + p.variants.length, 0);
  return `${file.catalog.categories.length} categorías · ${file.catalog.products.length} productos · ${v} variantes`;
}

/**
 * Copia automática diaria (la llama netlify/functions/backup-catalog.ts a las
 * 6:00 a.m. de Venezuela). Idempotente: si la última automática tiene menos de
 * GAP_AUTOMATICA_HORAS (20 h), NO duplica. Nunca lanza: el cron debe terminar
 * limpio aunque Firestore falle (el log de Netlify dice QUÉ pasó).
 */
export async function coreScheduledCatalogBackup(): Promise<void> {
  try {
    // where de UN campo + límite: sin índices compuestos (lección 5.87e).
    const snap = await db().collection('catalogBackups').where('mode', '==', 'auto').limit(5).get();
    const masReciente = snap.docs
      .map((d) => Number(d.data()['createdAt'] ?? 0))
      .sort((a, b) => b - a)[0] ?? 0;
    const edadHoras = masReciente ? (Date.now() - masReciente) / 3_600_000 : Infinity;
    if (edadHoras < GAP_AUTOMATICA_HORAS) {
      console.log(`[backup-catalog] copia automática saltada: la última tiene ${edadHoras.toFixed(1)} h (< ${GAP_AUTOMATICA_HORAS} h)`);
      return;
    }
    const meta = await guardarSnapshot({ mode: 'auto' });
    console.log(`[backup-catalog] copia automática creada: ${meta.counts.productos} productos / ${meta.counts.variantes} variantes / ${Math.round(meta.bytes / 1024)} KB`);
  } catch (e) {
    console.error('[backup-catalog]', (e as Error)?.name ?? 'Error', '-', (e as Error)?.message ?? '');
  }
}
