/**
 * SPOT 24 · Importar inventario desde el PDF del POS (5.87, a pedido del
 * dueño: «desde admin deberé cargar el archivo; si el producto no existe que
 * lo cree; si ya existe, actualizará el stock y el costo»).
 *
 * Mapeo literal del reporte «REPORTE DE INVENTARIO DISPONIBLE»:
 *   Codigo → product.code + variante.sku · Descripcion → name ·
 *   Costo → precio (USD) · Existencia → stock.
 *
 * · El PDF llega en base64 por POST (callFunction estándar: Bearer + App
 *   Check). La EXTRACCIÓN vive en lib/extraerPdf (pdfjs-dist + registro del
 *   worker para el bundle esbuild, fix 5.87b) y el parser puro de
 *   lib/inventarioPdf reparte cada valor a su columna (el reporte concatena
 *   código+descripción en el texto plano: solo las columnas son fiables).
 * · Emparejamiento: por product.code; si el producto no tiene código pero
 *   alguna de sus variantes tiene ese POS-code como sku, también cuenta
 *   (productos creados a mano en el panel antes de importar). La lectura de
 *   variantes va SIN where (5.87d): Firestore NO mantiene índices automáticos
 *   en alcance COLLECTION_GROUP y el where('sku','in',…) anterior exigía
 *   crear un índice a mano — la 1ª importación moría con
 *   FAILED_PRECONDITION «COLLECTION_GROUP_ASC … field sku» (400, 20-25 s).
 * · Los que existen: se actualiza SOLO stock y precio (jamás fotos, nombre,
 *   categoría ni visibilidad). stockTotal y basePriceUsd se recalculan con
 *   TODAS las variantes del producto (la elegida toma el valor del PDF).
 * · Los que no existen: producto NUEVO con UNA variante «Estándar»,
 *   activo, con la imagen de la categoría (igual que el alta del panel) en
 *   la categoría que el admin elige al importar.
 * · 5.92 · a pedido del dueño: los productos con existencia 0 y precio 0
 *   TAMBIÉN se crean (o se ponen en cero) — la importación futura con los
 *   valores reales los actualiza. Ya no existe la opción «omitir cero».
 * · 5.92 · detecta el formato automáticamente: el reporte del POS
 *   (lib/inventarioPdf.parseInventario), la «lista limpia» del dueño con
 *   doble precio sin/con impuesto (parseListaLimpia — usa el SIN impuesto y
 *   resuelve códigos repetidos con sufijo -2/-3…) o la «LISTA DE PRECIOS»
 *   del ERP (parseListaPrecios, 5.138 — usa «Precio REF c/Imp»).
 * · 5.92b · blindaje «No document to update»: cuando el panel borra un
 *   producto, su subcolección variants SOBREVIVE (Firestore no borra
 *   subcolecciones en cascada) y collectionGroup la sigue listando — los
 *   productos candidatos se validan por existencia ANTES de planear
 *   escrituras; las referencias muertas se omiten. La variante que se
 *   inventa para un producto sin variantes va con set (update daría el
 *   mismo NOT_FOUND).
 * · Escrituras en lotes ≤ 450 ops (límite de Firestore: 500). Re-importar
 *   es seguro: los valores simplemente se vuelven a escribir.
 *
 * ── 5.137 · MODOS + MODO ENSAYO (a pedido del dueño) ──
 * · modo 'completo' (default, comportamiento de SIEMPRE intacto): crea los
 *   que falten y actualiza stock+precio de los existentes.
 * · modo 'stock': SOLO existencias. A los existentes se les actualiza el
 *   stock (entero de «Existencia»: 12.9 → 12, sin decimales) y NADA más
 *   (precio, nombre, categoría y visibilidad quedan como están). A los que
 *   no están en la tienda se los CREA como INACTIVOS, SIN categoría y SIN
 *   precio (0): el dueño los completa desde el panel antes de activarlos.
 * · MODO ENSAYO (ensayo: true): corre TODO el proceso real — lectura del
 *   PDF, emparejamiento, plan de escrituras — pero NO ESCRIBE NADA en
 *   Firestore (ni lotes ni auditoría). Devuelve el resumen detallado de lo
 *   que pasaría (altas, cambios stock/precio, sin match, problemas) para
 *   que el dueño lo revise; después ejecuta de verdad con ensayo: false.
 *
 * ── 5.138 · MODO PRECIOS (a pedido del dueño, con la LISTA DE PRECIOS) ──
 * · Con la «REPORTE LISTA DE PRECIOS» del ERP (columna final «Precio REF
 *   c/Imp» = USD CON impuesto, el precio final de la tienda desde el modelo
 *   de IVA incluido 5.120): a cada código que YA EXISTE en la tienda se le
 *   fija el precio de esa columna SIN DECIMALES (pedido literal: 125.81 →
 *   125). NO se crea nada y NO se toca el stock: los códigos que solo están
 *   en el PDF quedan fuera (lista «sin match» del resumen).
 * · BLINDAJE GRATIS: si al quitar los decimales el precio quedaría en 0
 *   (artículos por debajo de $1: 0.75, 0.13…), la fila NO se toca y queda
 *   listada en el resumen («quedarían en 0») para que el dueño decida — un
 *   precio 0 en la tienda sería un producto gratis.
 *
 * ── 5.140 · FIX TIMEOUT — «Task timed out after 30.00 seconds» ──
 * · La terminal de netlify dev mostró el timeout en fn-importInventory y la
 *   medición real dio la causa: el PDF se lee y parsea en <1 s (reporte de
 *   ~950 filas: 812 ms), el tiempo se iba en las LECTURAS de Firestore UNA
 *   POR UNA: leerVariantesPorPid hacía 1 consulta SECUENCIAL por producto
 *   emparejado (~900 productos ≈ 900 idas y vueltas ≈ 30 s) y el modo
 *   completo además 2 por producto (variants + ficha) — el «Modo ensayo»
 *   también moría porque las lecturas corren igual.
 * · AHORA: UNA sola lectura en bloque de collectionGroup('variants')
 *   alimenta el emparejamiento por sku Y las variantes de TODOS los
 *   productos emparejados (el createdAt crudo viaja gratis con la lectura de
 *   vivos); las tandas `in` de 30 corren EN PARALELO (Promise.all) y los
 *   lotes se confirman en paralelo. La lógica de negocio es EXACTAMENTE la
 *   misma (planPrecios/planStock/modos/ensayo intactos). El resumen trae
 *   «tiempos» (pdf / lecturas / escrituras) y una línea en el log del
 *   servidor: así se ve de un vistazo que la importación entra en segundos.
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { extraerItemsPdf } from './lib/extraerPdf';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { parseInventarioAuto, type FilaInventario } from './lib/inventarioPdf';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/** Tope defensivo de filas por importación (reportes de miles de ítems). */
const MAX_FILAS = 2000;
/** Firestore admite 500 ops por lote: margen para el control. */
const OPS_POR_LOTE = 450;
/** Firestore `in` admite 30 valores por consulta. */
const EN_CONSULTA = 30;
/** Tope de códigos listados en el resumen (para no tumbar el modal). */
const TOPE_LISTA_RESUMEN = 40;
const TOPE_CAMBIOS_RESUMEN = 50;

function sanitizeStr(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

/** El dueño usa el Costo del reporte como PRECIO de venta (USD). */
function redondearPrecio(n: number): number {
  return Math.max(0, Math.round(n * 100) / 100);
}

/** Igual que el slug del panel: sin acentos, minúsculas, guiones. */
function slugDe(nombre: string): string {
  return (
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `producto-${Date.now().toString(36)}`
  );
}

/** Igual que buildSearchTerms del panel: palabras de nombre y marca (7.1). */
function searchTermsDe(nombre: string, marca: string): string[] {
  const words = `${nombre} ${marca}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
  return [...new Set(words)].slice(0, 20);
}

/**
 * 5.95 · Epoch-ms desde número / Timestamp de Firestore (toMillis) /
 * {seconds,nanoseconds} pelado / Date. Todo lo desconocido → 0 (jamás NaN).
 * Gemela de aMillis del frontend (src/shared/lib/tiempos.ts).
 */
export function aMillisDe(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v instanceof Date) {
    const t = v.getTime();
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === 'object') {
    const o = v as { toMillis?: unknown; seconds?: unknown; nanoseconds?: unknown };
    if (typeof o.toMillis === 'function') {
      try {
        const t = (o.toMillis as () => number).call(o);
        return Number.isFinite(t) ? t : 0;
      } catch {
        return 0;
      }
    }
    const s = Number(o.seconds);
    if (Number.isFinite(s)) {
      const ns = Number(o.nanoseconds ?? 0);
      return Math.round(s * 1000 + (Number.isFinite(ns) ? ns : 0) / 1e6);
    }
  }
  return 0;
}

/**
 * 5.92b · Deja en los mapas code→productId y sku→productId SOLO los
 * productos que siguen existiendo. Una variante huérfana (el panel borra el
 * producto con deleteDoc y la subcolección sobrevive — Firestore NO borra
 * subcolecciones en cascada) o un resto de pruebas apuntan a ids muertos: si
 * entraran al plan, el lote COMPLETO moriría con NOT_FOUND «No document to
 * update». Devuelve cuántas referencias muertas se omitieron (auditoría y
 * resumen del script local).
 */
export function filtrarPidsVivos(
  productoPorCode: Map<string, string>,
  productoPorSku: Map<string, string>,
  pidsVivos: Set<string>,
): number {
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

/* ── 5.137/5.138 · Modos, ensayo y planes (lógica PURA, testeable sin Firestore) ── */

export type ModoImportacion = 'completo' | 'stock' | 'precios';

/** Modo pedido en el body ('completo' por default: comportamiento de siempre). */
export function modoDe(data: unknown): ModoImportacion {
  const m = (data as Record<string, unknown> | undefined)?.['modo'];
  return m === 'stock' ? 'stock' : m === 'precios' ? 'precios' : 'completo';
}

/** Bandera de ensayo (dry-run: no escribe nada). */
export function ensayoDe(data: unknown): boolean {
  return (data as Record<string, unknown> | undefined)?.['ensayo'] === true;
}

/**
 * 5.138 · Precio de la lista SIN decimales (pedido literal del dueño:
 * «colocas precio que sale en la columna Precio REF c/imp sin los
 * decimales»): 125.81 → 125 · 15.00 → 15 · 0.75 → 0 (el modo precios NO
 * aplica los que caen a 0: ver planPrecios).
 */
export function precioEnteroDe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

/** 5.137 · Existencia SIN decimales: 12.9 → 12 (truncada, no redondeada). */
export function existenciaEnteraDe(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

export interface CambioPrecioInfo {
  codigo: string;
  nombre: string;
  /** Precio actual de la variante (2 decimales). */
  antes: number;
  /** Precio nuevo SIN decimales (entero). */
  despues: number;
}

export interface CambioStockInfo {
  codigo: string;
  nombre: string;
  antes: number;
  despues: number;
}

export interface AltaInfo {
  codigo: string;
  nombre: string;
  stock: number;
}

export interface PlanPrecios {
  cambios: Array<CambioPrecioInfo & { pid: string; vid: string }>;
  /** El precio ya era ese: nada que escribir. */
  sinCambio: string[];
  /** Quedaría en 0 al quitar decimales → se conserva el precio actual. */
  sinPrecio: string[];
  /** Código del PDF que NO está en la tienda (modo precios no crea nada). */
  sinMatch: string[];
}

/**
 * 5.138 · Clasificación PURA del modo precios: qué códigos cambian de
 * precio (antes → después entero), cuáles no están en la tienda, cuáles
 * quedarían en 0 y cuáles ya tenían ese precio.
 */
export function planPrecios(
  filas: FilaInventario[],
  existentes: Map<string, { pid: string; nombre: string; precioActual: number; vid: string }>,
): PlanPrecios {
  const cambios: PlanPrecios['cambios'] = [];
  const sinCambio: string[] = [];
  const sinPrecio: string[] = [];
  const sinMatch: string[] = [];
  for (const fila of filas) {
    const blanco = existentes.get(fila.codigo);
    if (!blanco) {
      sinMatch.push(fila.codigo);
      continue;
    }
    const entero = precioEnteroDe(fila.precioConImp ?? Number.NaN);
    if (entero < 1) {
      // «Sin los decimales» dejaría el precio en 0 (artículos por debajo de
      // $1): un producto gratis en la tienda. NO se toca y queda listado.
      sinPrecio.push(fila.codigo);
      continue;
    }
    const antes = Math.round(blanco.precioActual * 100) / 100;
    if (entero === antes) {
      sinCambio.push(fila.codigo);
      continue;
    }
    cambios.push({
      codigo: fila.codigo,
      nombre: blanco.nombre,
      antes,
      despues: entero,
      pid: blanco.pid,
      vid: blanco.vid,
    });
  }
  return { cambios, sinCambio, sinPrecio, sinMatch };
}

export interface PlanStock {
  /** Existencias que cambian de verdad (antes ≠ después). */
  cambios: Array<CambioStockInfo & { pid: string; vid: string }>;
  /** Filas SIN emparejar: el modo stock las CREA (inactivas, sin categoría). */
  altas: FilaInventario[];
}

/** 5.137 · Clasificación PURA del modo stock: cambios de existencia + altas. */
export function planStock(
  filas: FilaInventario[],
  existentes: Map<string, { pid: string; nombre: string; stockActual: number; vid: string }>,
): PlanStock {
  const cambios: PlanStock['cambios'] = [];
  const altas: FilaInventario[] = [];
  for (const fila of filas) {
    const blanco = existentes.get(fila.codigo);
    if (!blanco) {
      altas.push(fila);
      continue;
    }
    const despues = existenciaEnteraDe(fila.existencia);
    const antes = Math.round(blanco.stockActual);
    if (despues === antes) continue;
    cambios.push({
      codigo: fila.codigo,
      nombre: blanco.nombre,
      antes,
      despues,
      pid: blanco.pid,
      vid: blanco.vid,
    });
  }
  return { cambios, altas };
}

/**
 * 5.137 · Payload del producto NUEVO del modo stock: INACTIVO, SIN categoría
 * y SIN precio (0) — el dueño los completa desde el panel antes de activarlo
 * (así jamás sale a la venta un producto a medio importar).
 */
export function datosProductoNuevoStock(
  fila: FilaInventario,
  ahora: number,
  slug: string,
): { producto: Record<string, unknown>; variante: Record<string, unknown> } {
  const nombre = fila.descripcion.slice(0, 120);
  const stock = existenciaEnteraDe(fila.existencia);
  return {
    producto: {
      slug,
      code: fila.codigo,
      name: nombre,
      brand: '',
      description: '',
      categoryId: '', // SIN categoría (pedido del dueño): la asigna desde el panel
      basePriceUsd: 0, // SIN precio: lo pone el dueño antes de activarlo
      images: ['/img/products/placeholder.svg'],
      searchTerms: searchTermsDe(nombre, ''),
      stockTotal: stock,
      variantCount: 1,
      active: false, // INACTIVO hasta que el dueño lo complete
      createdAt: ahora,
      updatedAt: ahora,
    },
    variante: {
      name: 'Estándar',
      sku: fila.codigo.slice(0, 40),
      priceUsd: 0,
      stock,
      active: true,
    },
  };
}

export interface ResumenImportacion {
  filas: number;
  formato: string;
  modo: ModoImportacion;
  ensayo: boolean;
  creados: number;
  actualizados: number;
  omitidasHuerfanas: number;
  problemas: string[];
  /** Modo precios: códigos del PDF que NO están en la tienda (no se tocan). */
  sinMatch: string[];
  /** Modo precios: quedarían en 0 sin decimales → se conserva el precio actual. */
  sinPrecio: string[];
  /** Modo precios: el precio ya era ese (nada que escribir). */
  sinCambio: number;
  /** Modo precios: precio anterior → nuevo entero (tope 50). */
  cambiosPrecio: CambioPrecioInfo[];
  /** Modo stock (y ensayo de completo): altas — códigos que se crearían/crearon. */
  altas: AltaInfo[];
  /** Modo stock: existencias antes → después (tope 50). */
  cambiosStock: CambioStockInfo[];
  /** 5.140 · Dónde se fue el tiempo (log del servidor; el cliente lo ignora). */
  tiempos: {
    /** Leer + parsear el PDF. */
    msPdf: number;
    /** TODAS las lecturas de Firestore (emparejar, validar, planear). */
    msLecturas: number;
    /** Confirmar los lotes (0 en ensayo: no escribe). */
    msEscrituras: number;
  };
}

/**
 * Consultas `where campo in …` en tandas de 30. 5.140 · Las tandas corren EN
 * PARALELO (Promise.all): antes iban encadenadas y con ~900 códigos eran 30
 * idas y vueltas una tras otra (con la red del operador, varios segundos).
 * El orden del resultado es el mismo (tanda por tanda).
 */
async function porLotesIn(
  coleccion: admin.firestore.Query,
  campo: string,
  valores: string[],
): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const tandas: Array<Promise<admin.firestore.QueryDocumentSnapshot[]>> = [];
  for (let i = 0; i < valores.length; i += EN_CONSULTA) {
    const tanda = valores.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    tandas.push(coleccion.where(campo, 'in', tanda).get().then((s) => s.docs));
  }
  const resultados = await Promise.all(tandas);
  const docs: admin.firestore.QueryDocumentSnapshot[] = [];
  resultados.forEach((parte) => docs.push(...parte));
  return docs;
}

interface VarianteDatos {
  sku: string;
  stock: number;
  priceUsd: number;
  activa: boolean;
}

/**
 * 5.140 · Variantes de los pids pedidos, extraídas de la lectura en bloque
 * de collectionGroup('variants') YA HECHA (0 lecturas extra). Exportada solo
 * para poder probarla sin Firestore (fake de snapshot en el test).
 *
 * Antes cada producto emparejado costaba 1 consulta SECUENCIAL a su
 * subcolección: con ~900 emparejados eran ~900 idas y vueltas ≈ 30 s y el
 * timeout de netlify dev mataba la función (500 «sin mensaje del servidor»).
 *
 * Un pid sin variantes NO queda en el mapa (igual que una subcolección
 * vacía): los códigos que dependan de él se eliminan del emparejamiento o
 * inventan variante igual que antes.
 */
export function variantesDeGrupo(
  grupo: admin.firestore.QuerySnapshot,
  pids: Iterable<string>,
): Map<string, Map<string, VarianteDatos>> {
  const queridos = new Set(pids);
  const out = new Map<string, Map<string, VarianteDatos>>();
  if (!queridos.size) return out;
  grupo.forEach((d) => {
    const pid = d.ref.parent?.parent?.id;
    if (!pid || !queridos.has(pid)) return;
    const data = d.data();
    const map = out.get(pid) ?? new Map<string, VarianteDatos>();
    map.set(d.id, {
      sku: String(data['sku'] ?? '').toUpperCase(),
      stock: Number(data['stock'] ?? 0),
      priceUsd: Number(data['priceUsd'] ?? 0),
      activa: data['active'] !== false,
    });
    out.set(pid, map);
  });
  return out;
}

/**
 * Variante objetivo de un código: la de sku == código (activa); si ninguna,
 * la primera activa; si ninguna, la primera del documento.
 */
function elegirVid(map: Map<string, VarianteDatos>, codigo: string): string | null {
  const entradas = [...map.entries()];
  return (
    entradas.find(([, v]) => v.activa && v.sku === codigo)?.[0] ??
    entradas.find(([, v]) => v.activa)?.[0] ??
    entradas[0]?.[0] ??
    null
  );
}

export async function coreImportInventory(ctx: CoreCtx): Promise<unknown> {
  // Igual que fn-adjustStock: administración o gerencia (reglas del catálogo).
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Solo administración o gerencia.');
  }
  const adminUid = ctx.auth.uid;

  // 5.137 · Modo de importación y bandera de ensayo. Cualquier valor distinto
  // de 'stock'/'precios' en modo cae en 'completo' (default = comportamiento
  // de siempre, intacto: los clientes que no mandan modo siguen igual).
  const modo = modoDe(ctx.data);
  const ensayo = ensayoDe(ctx.data);

  const pdfBase64 = typeof ctx.data?.['pdfBase64'] === 'string' ? ctx.data['pdfBase64'] : '';
  const categoryId = sanitizeStr(ctx.data?.['categoryId'], 120);
  if (!pdfBase64) throw new HttpsError('invalid-argument', 'Falta el archivo PDF.');
  // La categoría solo se exige en modo 'completo': en 'stock' los nuevos
  // nacen SIN categoría (así los pidió el dueño) y 'precios' no crea nada.
  if (modo === 'completo' && !categoryId) {
    throw new HttpsError('invalid-argument', 'Elige la categoría donde caerán los productos nuevos.');
  }

  // 5.140 · Telemetría: el log del servidor muestra dónde fue cada segundo
  // (pdf / lecturas / escrituras). La medición real dio pdf ≈ 0.8 s con el
  // reporte de ~950 filas: el timeout venía de las lecturas, no del PDF.
  const t0 = Date.now();
  const parseo = parseInventarioAuto(await extraerItemsPdf(pdfBase64));
  const tPdf = Date.now();
  if (!parseo.filas.length) {
    throw new HttpsError(
      'invalid-argument',
      'No se reconoció ningún producto. Verifica que el PDF sea el reporte «Inventario disponible» de tu sistema, '
      + 'una lista con columnas Código / Descripción / Existencia / Precio sin impuesto '
      + 'o la «Lista de precios» (columna Precio REF c/Imp).',
    );
  }
  if (parseo.filas.length > MAX_FILAS) {
    throw new HttpsError('invalid-argument', `El reporte trae ${parseo.filas.length} filas (tope ${MAX_FILAS}). Divídelo.`);
  }
  // 5.138 · El modo exige el reporte correcto: precios ← lista de precios;
  // stock ← un reporte CON existencias (jamás la lista de precios, que no
  // trae stock: pondría TODO en 0).
  if (modo === 'precios' && parseo.formato !== 'lista-precios') {
    throw new HttpsError(
      'invalid-argument',
      'El modo «Solo precios» es para la LISTA DE PRECIOS de tu sistema (columna «Precio REF c/Imp»). '
      + `El PDF subido se reconoció como «${parseo.formato === 'lista-limpia' ? 'lista limpia con doble precio' : 'reporte de inventario del POS'}». `
      + 'Sube la lista de precios o cambia el modo.',
    );
  }
  if (modo === 'stock' && parseo.formato === 'lista-precios') {
    throw new HttpsError(
      'invalid-argument',
      'El modo «Solo stock» necesita el reporte de INVENTARIO (con columna Existencia): '
      + 'el PDF subido es la LISTA DE PRECIOS, que no trae existencias.',
    );
  }

  // ── Emparejamiento: por código de producto y por sku de variante ──
  const filas = parseo.filas;
  const codigos = [...new Set(filas.map((f) => f.codigo))];

  const productoPorCode = new Map<string, string>(); // code → productId
  const docs = codigos.length
    ? await porLotesIn(db().collection('products'), 'code', codigos)
    : [];
  docs.forEach((d) => {
    const code = String(d.data()['code'] ?? '').toUpperCase();
    if (code) productoPorCode.set(code, d.id);
  });

  // Productos sin code pero con el POS-code como sku en alguna variante.
  // 5.87d · Lectura COMPLETA del grupo de colecciones SIN where: Firestore
  // no mantiene índices automáticos en alcance COLLECTION_GROUP, así que el
  // where('sku','in',…) previo exigía un índice manual y la 1ª importación
  // moría con FAILED_PRECONDITION «COLLECTION_GROUP_ASC … field sku». Sin
  // where no hace falta NINGÚN índice: las variantes se leen una vez y se
  // emparejan en memoria (solo sku + producto padre; escala del dueño:
  // centenares~miles de filas, una ida y vuelta. La 1ª importación parte de
  // la BD casi vacía; las siguientes ya entran mayormente por product.code).
  const skuSinProducto = codigos.filter((c) => !productoPorCode.has(c));
  const productoPorSku = new Map<string, string>(); // sku → productId
  // 5.140 · UNA lectura en bloque del grupo variants para TODO el proceso:
  // emparejar por sku (aquí) y las variantes de los productos emparejados
  // (variantesDeGrupo en cada modo). Antes las variantes del plan iban UNA
  // CONSULTA POR PRODUCTO — el tramo que reventaba el timeout de 30 s.
  const grupoVariantes = await db().collectionGroup('variants').get();
  if (skuSinProducto.length) {
    const buscar = new Set(skuSinProducto.map((c) => c.slice(0, 40).toUpperCase()));
    grupoVariantes.forEach((d) => {
      const sku = String(d.data()['sku'] ?? '').toUpperCase();
      const pid = d.ref.parent?.parent?.id;
      if (sku && pid && buscar.has(sku) && !productoPorCode.has(sku)) {
        productoPorSku.set(sku, pid);
      }
    });
  }

  // 5.92b · Blindaje «No document to update»: toda referencia a un producto
  // borrado (variante huérfana que collectionGroup sigue listando, resto de
  // pruebas) se valida por EXISTENCIA real antes de planear escrituras —
  // por documentId, en tandas de 30 como las demás consultas (no necesita
  // índice). Con el filtro, esas filas caen como NUEVAS (el producto fresco
  // se crea en el CREATE) y la basura de la base queda sin efecto.
  const pidsCandidatos = [
    ...new Set([...productoPorCode.values(), ...productoPorSku.values()]),
  ];
  const pidsVivos = new Set<string>();
  // 5.137/5.138 · El nombre del producto viaja en el resumen (ensayo y modos
  // stock/precios); se captura AQUÍ, en la misma lectura de vivos: 0 lecturas extra.
  const nombrePorPid = new Map<string, string>();
  // 5.140 · El createdAt crudo también viaja gratis desde aquí: el modo
  // completo lo normaliza (antes costaba 1 lectura POR producto).
  const creadoCrudoPorPid = new Map<string, unknown>();
  // 5.140 · Tandas de 30 EN PARALELO (Promise.all) en vez de encadenadas.
  const tandasVivos: Array<Promise<admin.firestore.QuerySnapshot>> = [];
  for (let i = 0; i < pidsCandidatos.length; i += EN_CONSULTA) {
    const tanda = pidsCandidatos.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    tandasVivos.push(
      db()
        .collection('products')
        .where(admin.firestore.FieldPath.documentId(), 'in', tanda)
        .get(),
    );
  }
  const vivosSnaps = await Promise.all(tandasVivos);
  vivosSnaps.forEach((snap) =>
    snap.forEach((d) => {
      pidsVivos.add(d.id);
      nombrePorPid.set(d.id, String(d.data()['name'] ?? ''));
      creadoCrudoPorPid.set(d.id, d.data()['createdAt'] ?? null);
    }),
  );
  const omitidasHuerfanas = filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos);

  // ── Plan de escrituras (TODAS las lecturas antes de escribir) ──
  const ahora = Date.now();
  const lote: admin.firestore.WriteBatch[] = [];
  let loteActual = db().batch();
  let ops = 0;
  const nuevoLoteSiHagaFalta = () => {
    if (ops >= OPS_POR_LOTE) {
      lote.push(loteActual);
      loteActual = db().batch();
      ops = 0;
    }
  };
  const enLote = (fn: (b: admin.firestore.WriteBatch) => void): void => {
    nuevoLoteSiHagaFalta();
    fn(loteActual);
    ops += 1;
  };

  let creados = 0;
  let actualizados = 0;

  const resumen: ResumenImportacion = {
    filas: parseo.filas.length,
    formato: parseo.formato,
    modo,
    ensayo,
    creados: 0,
    actualizados: 0,
    omitidasHuerfanas,
    problemas: parseo.problemas.slice(0, 20),
    sinMatch: [],
    sinPrecio: [],
    sinCambio: 0,
    cambiosPrecio: [],
    altas: [],
    cambiosStock: [],
    // 5.140 · Valores reales: se rellenan al cerrar las lecturas en cada modo.
    tiempos: { msPdf: 0, msLecturas: 0, msEscrituras: 0 },
  };

  /* ── 5.138 · MODO PRECIOS: solo códigos que EXISTEN; precio entero de «Precio REF c/Imp» ── */
  if (modo === 'precios') {
    const existentes = new Map<string, { pid: string; nombre: string; precioActual: number; vid: string }>();
    const pidsMatch = new Set<string>();
    for (const fila of filas) {
      const pid = productoPorCode.get(fila.codigo) ?? productoPorSku.get(fila.codigo);
      if (pid) {
        pidsMatch.add(pid);
        existentes.set(fila.codigo, {
          pid,
          nombre: nombrePorPid.get(pid) ?? '',
          precioActual: 0,
          vid: '',
        });
      }
    }
    const variantesPorPid = variantesDeGrupo(grupoVariantes, pidsMatch);
    for (const [codigo, info] of existentes) {
      const map = variantesPorPid.get(info.pid);
      const vid = map ? elegirVid(map, codigo) : null;
      if (!map || !vid) {
        // Producto sin variantes (resto de datos del panel): no emparejable.
        existentes.delete(codigo);
        continue;
      }
      info.vid = vid;
      info.precioActual = map.get(vid)!.priceUsd;
    }

    const plan = planPrecios(filas, existentes);

    // Escrituras consolidadas por producto (basePriceUsd = mínimo del estado
    // final, mismo criterio que el modo completo).
    const cambiosPorPid = new Map<string, PlanPrecios['cambios']>();
    for (const c of plan.cambios) {
      const lista = cambiosPorPid.get(c.pid) ?? [];
      lista.push(c);
      cambiosPorPid.set(c.pid, lista);
    }
    for (const [pid, lista] of cambiosPorPid) {
      const pref = db().doc(`products/${pid}`);
      const map = variantesPorPid.get(pid)!;
      const estadoFinal = new Map<string, VarianteDatos>();
      map.forEach((v, vid) => estadoFinal.set(vid, { ...v }));
      for (const c of lista) {
        const actual = estadoFinal.get(c.vid);
        if (actual) estadoFinal.set(c.vid, { ...actual, priceUsd: c.despues });
      }
      const precios = [...estadoFinal.values()].map((v) => v.priceUsd).filter((p) => Number.isFinite(p) && p >= 0);
      const basePriceUsd = precios.length ? redondearPrecio(Math.min(...precios)) : 0;
      for (const c of lista) {
        enLote((b) => b.update(pref.collection('variants').doc(c.vid), { priceUsd: redondearPrecio(c.despues) }));
      }
      enLote((b) => b.update(pref, { basePriceUsd, updatedAt: ahora }));
      actualizados += lista.length;
    }

    resumen.actualizados = actualizados;
    resumen.sinMatch = plan.sinMatch.slice(0, TOPE_LISTA_RESUMEN);
    resumen.sinPrecio = plan.sinPrecio.slice(0, TOPE_LISTA_RESUMEN);
    resumen.sinCambio = plan.sinCambio.length;
    resumen.cambiosPrecio = plan.cambios.slice(0, TOPE_CAMBIOS_RESUMEN).map(({ codigo, nombre, antes, despues }) => ({
      codigo,
      nombre,
      antes,
      despues,
    }));

    // 5.140 · Telemetría: lecturas cerradas aquí; escrituras tras los commits.
    const tLecturas = Date.now();
    resumen.tiempos = { msPdf: tPdf - t0, msLecturas: tLecturas - tPdf, msEscrituras: 0 };
    // Ensayo: NADA se escribe (ni lotes ni auditoría).
    if (!ensayo) {
      lote.push(loteActual);
      await Promise.all(lote.map((b) => b.commit())); // 5.140: lotes en paralelo
      resumen.tiempos.msEscrituras = Date.now() - tLecturas;
      await writeAudit({
        action: 'importar_inventario',
        adminUid,
        targetId: 'solo-precios',
        note: `${parseo.formato} · modo precios · ${parseo.filas.length} filas · ~${actualizados} precios fijados`
          + ` · ${plan.sinMatch.length} sin match · ${plan.sinPrecio.length} quedarían en 0`,
      });
    }
    console.log(`[fn-importInventory] modo ${modo}${ensayo ? ' · ENSAYO' : ''} · tiempos ms: pdf=${resumen.tiempos.msPdf} lecturas=${resumen.tiempos.msLecturas} escrituras=${resumen.tiempos.msEscrituras}`);
    return resumen;
  }

  /* ── 5.137 · MODO STOCK: solo existencias; nuevos = INACTIVOS sin categoría ── */
  if (modo === 'stock') {
    const existentes = new Map<string, { pid: string; nombre: string; stockActual: number; vid: string }>();
    const pidsMatch = new Set<string>();
    for (const fila of filas) {
      const pid = productoPorCode.get(fila.codigo) ?? productoPorSku.get(fila.codigo);
      if (pid) {
        pidsMatch.add(pid);
        existentes.set(fila.codigo, {
          pid,
          nombre: nombrePorPid.get(pid) ?? '',
          stockActual: 0,
          vid: '',
        });
      }
    }
    const variantesPorPid = variantesDeGrupo(grupoVariantes, pidsMatch);
    for (const [codigo, info] of existentes) {
      const map = variantesPorPid.get(info.pid);
      const vid = map ? elegirVid(map, codigo) : null;
      if (!map || !vid) {
        existentes.delete(codigo);
        continue;
      }
      info.vid = vid;
      info.stockActual = map.get(vid)!.stock;
    }

    const plan = planStock(filas, existentes);

    // UPDATE existentes: SOLO el stock de la variante objetivo + stockTotal
    // recalculado. Ni precio, ni basePriceUsd, ni nombre, ni categoría, ni
    // visibilidad (pedido literal del dueño).
    const cambiosPorPid = new Map<string, PlanStock['cambios']>();
    for (const c of plan.cambios) {
      const lista = cambiosPorPid.get(c.pid) ?? [];
      lista.push(c);
      cambiosPorPid.set(c.pid, lista);
    }
    for (const [pid, lista] of cambiosPorPid) {
      const pref = db().doc(`products/${pid}`);
      const map = variantesPorPid.get(pid)!;
      const estadoFinal = new Map<string, VarianteDatos>();
      map.forEach((v, vid) => estadoFinal.set(vid, { ...v }));
      for (const c of lista) {
        const actual = estadoFinal.get(c.vid);
        if (actual) estadoFinal.set(c.vid, { ...actual, stock: c.despues });
      }
      const stockTotal = [...estadoFinal.values()].reduce((a, v) => a + Math.max(0, Math.round(v.stock)), 0);
      for (const c of lista) {
        enLote((b) => b.update(pref.collection('variants').doc(c.vid), { stock: Math.max(0, c.despues) }));
      }
      enLote((b) => b.update(pref, { stockTotal, updatedAt: ahora }));
      actualizados += lista.length;
    }

    // CREATE: los que NO están en la tienda nacen INACTIVOS, SIN categoría
    // y SIN precio (así jamás salen a la venta a medio importar).
    const slugsBase = [...new Set(plan.altas.map((f) => slugDe(f.descripcion)))];
    const slugsUsados = new Set<string>();
    if (slugsBase.length) {
      const docsSlug = await porLotesIn(db().collection('products'), 'slug', slugsBase.slice(0, 300));
      docsSlug.forEach((d) => slugsUsados.add(String(d.data()['slug'] ?? '')));
    }
    for (const fila of plan.altas) {
      const pref = db().collection('products').doc();
      let slug = slugDe(fila.descripcion);
      if (slugsUsados.has(slug)) slug = `${slug}-${fila.codigo.toLowerCase()}`;
      if (slugsUsados.has(slug)) slug = `${slug}-${pref.id.slice(0, 6)}`;
      slugsUsados.add(slug);
      const datos = datosProductoNuevoStock(fila, ahora, slug);
      enLote((b) => b.set(pref, datos.producto));
      enLote((b) => b.set(pref.collection('variants').doc(`${pref.id}-v1`), datos.variante));
      creados += 1;
    }

    resumen.actualizados = actualizados;
    resumen.creados = creados;
    resumen.cambiosStock = plan.cambios.slice(0, TOPE_CAMBIOS_RESUMEN).map(({ codigo, nombre, antes, despues }) => ({
      codigo,
      nombre,
      antes,
      despues,
    }));
    resumen.altas = plan.altas.slice(0, TOPE_CAMBIOS_RESUMEN).map((f) => ({
      codigo: f.codigo,
      nombre: f.descripcion.slice(0, 60),
      stock: existenciaEnteraDe(f.existencia),
    }));

    const tLecturas = Date.now();
    resumen.tiempos = { msPdf: tPdf - t0, msLecturas: tLecturas - tPdf, msEscrituras: 0 };
    // Ensayo: NADA se escribe (ni lotes ni auditoría).
    if (!ensayo) {
      lote.push(loteActual);
      await Promise.all(lote.map((b) => b.commit())); // 5.140: lotes en paralelo
      resumen.tiempos.msEscrituras = Date.now() - tLecturas;
      await writeAudit({
        action: 'importar_inventario',
        adminUid,
        targetId: 'solo-stock',
        note: `${parseo.formato} · modo stock · ${parseo.filas.length} filas · ~${actualizados} existencias`
          + ` · +${creados} nuevos inactivos`,
      });
    }
    console.log(`[fn-importInventory] modo ${modo}${ensayo ? ' · ENSAYO' : ''} · tiempos ms: pdf=${resumen.tiempos.msPdf} lecturas=${resumen.tiempos.msLecturas} escrituras=${resumen.tiempos.msEscrituras}`);
    return resumen;
  }

  /* ── MODO COMPLETO (comportamiento de SIEMPRE, intacto) ── */

  // Slugs ya usados (para los nuevos): consulta única por los slugs bases.
  const slugsBase = [...new Set(filas.map((f) => slugDe(f.descripcion)))];
  const slugsUsados = new Set<string>();
  if (slugsBase.length) {
    const docsSlug = await porLotesIn(db().collection('products'), 'slug', slugsBase.slice(0, 300));
    docsSlug.forEach((d) => slugsUsados.add(String(d.data()['slug'] ?? '')));
  }

  // UPDATE: consolidar por producto (2 filas del PDF pueden caer en el mismo
  // producto si tiene varias variantes con skus del POS).
  const cambiosPorProducto = new Map<string, Map<string, { stock: number; priceUsd: number }>>();
  for (const fila of filas) {
    const porCode = productoPorCode.get(fila.codigo);
    const pid = porCode ?? productoPorSku.get(fila.codigo);
    if (!pid) continue;
    const cambios = cambiosPorProducto.get(pid) ?? new Map<string, { stock: number; priceUsd: number }>();
    cambios.set(fila.codigo, { stock: fila.existencia, priceUsd: redondearPrecio(fila.costo) });
    cambiosPorProducto.set(pid, cambios);
    actualizados += 1;
  }

  // Leer las variantes de cada producto afectado y decidir cuál toma cada fila.
  // 5.140 · Ya las trajeron TODAS en una sola lectura en bloque
  // (grupoVariantes): antes eran 2 consultas SECUENCIALES POR producto
  // (variants + ficha) — con ~900 emparejados, ~1800 idas y vueltas ≈ 30 s,
  // el timeout de netlify dev mataba la función.
  const variantesPorPid = variantesDeGrupo(grupoVariantes, cambiosPorProducto.keys());
  for (const [pid, plan] of cambiosPorProducto) {
    const pref = db().doc(`products/${pid}`);
    const variantes = variantesPorPid.get(pid) ?? new Map<string, VarianteDatos>();
    // 5.95 · Normaliza el createdAt de productos viejos: si vive como Timestamp
    // de Firestore (panel con serverTimestamp o importador pre-5.92e) se
    // reescribe como número epoch-ms. Sin esto, el orden de TIPOS de Firestore
    // (números < Timestamps en DESC) entierra los importados al final del
    // catálogo y fuera de la lista del panel. Re-importando las listas (el
    // reporte del POS) queda TODO el catálogo con fechas uniformes.
    // 5.140 · El valor crudo viajó gratis con la lectura de vivos (0 lecturas);
    // undefined (pid sin lectura) → 0, igual que antes con un doc ausente.
    const crudo = creadoCrudoPorPid.get(pid);
    const creadoMs = crudo === undefined ? 0 : aMillisDe(crudo);
    const yaEsNumero = typeof crudo === 'number';

    const estadoFinal = new Map<string, { sku: string; stock: number; priceUsd: number; activa: boolean }>();
    variantes.forEach((v, vid) => estadoFinal.set(vid, { sku: v.sku, stock: v.stock, priceUsd: v.priceUsd, activa: v.activa }));

    const aplicado = new Map<string, { stock: number; priceUsd: number }>();
    for (const [skuObjetivo, cambio] of plan) {
      // La variante cuyo sku == código del POS; si ninguna, la primera del doc.
      let vid = [...estadoFinal.entries()].find(([, v]) => v.activa && v.sku === skuObjetivo)?.[0];
      if (!vid) vid = estadoFinal.keys().next().value;
      if (!vid) {
        // Producto sin variantes (dato huérfano del panel): se le crea una.
        vid = `${pid}-v1`;
        estadoFinal.set(vid, { sku: skuObjetivo, stock: cambio.stock, priceUsd: cambio.priceUsd, activa: true });
      }
      estadoFinal.set(vid, { ...estadoFinal.get(vid)!, stock: cambio.stock, priceUsd: cambio.priceUsd });
      aplicado.set(vid, cambio);
    }

    const stockTotal = [...estadoFinal.values()].reduce((a, v) => a + Math.max(0, Math.round(v.stock)), 0);
    const precios = [...estadoFinal.values()].map((v) => v.priceUsd).filter((p) => Number.isFinite(p) && p >= 0);
    const basePriceUsd = precios.length ? redondearPrecio(Math.min(...precios)) : 0;

    // 5.92b · Solo las variantes que EXISTEN van con update; la inventada
    // para un producto sin variantes va con set (un update sobre un doc
    // inexistente daría el mismo NOT_FOUND que abortó la 1ª importación).
    const vidsExistentes = new Set(variantes.keys());
    for (const [vid, cambio] of aplicado) {
      const vref = pref.collection('variants').doc(vid);
      if (vidsExistentes.has(vid)) {
        enLote((b) => b.update(vref, {
          stock: Math.max(0, Math.round(cambio.stock)),
          priceUsd: redondearPrecio(cambio.priceUsd),
        }));
      } else {
        enLote((b) => b.set(vref, {
          name: 'Estándar',
          sku: (estadoFinal.get(vid)?.sku ?? '').slice(0, 40),
          stock: Math.max(0, Math.round(cambio.stock)),
          priceUsd: redondearPrecio(cambio.priceUsd),
          active: true,
        }));
      }
    }
    enLote((b) => b.update(pref, {
      // 5.95: solo se reescribe si NO era ya un número (Timestamp/otro) y el
      // valor normalizado es real (0 = nada fiable → no se toca).
      ...(creadoMs && !yaEsNumero ? { createdAt: creadoMs } : {}),
      stockTotal,
      basePriceUsd,
      updatedAt: ahora,
    }));
  }

  // CREATE: productos nuevos (1 variante «Estándar», activos, imagen de la
  // categoría — misma ficha que crea el panel a mano).
  for (const fila of filas) {
    if (productoPorCode.has(fila.codigo) || productoPorSku.has(fila.codigo)) continue;
    const pref = db().collection('products').doc();
    let slug = slugDe(fila.descripcion);
    if (slugsUsados.has(slug)) slug = `${slug}-${fila.codigo.toLowerCase()}`;
    if (slugsUsados.has(slug)) slug = `${slug}-${pref.id.slice(0, 6)}`;
    slugsUsados.add(slug);
    const nombre = fila.descripcion.slice(0, 120);
    enLote((b) => b.set(pref, {
      slug,
      code: fila.codigo,
      name: nombre,
      brand: '',
      description: '',
      categoryId,
      basePriceUsd: redondearPrecio(fila.costo),
      images: [`/img/products/${categoryId}.svg`],
      searchTerms: searchTermsDe(nombre, ''),
      stockTotal: fila.existencia,
      variantCount: 1,
      active: true,
      // 5.92e: número epoch-ms (Date.now()), MISMA convención que el resto de
      // la app. serverTimestamp() grababa un Timestamp de Firestore y rompía el
      // cursor de paginación del catálogo (Number(Timestamp) = NaN).
      createdAt: ahora,
      updatedAt: ahora,
    }));
    enLote((b) => b.set(pref.collection('variants').doc(`${pref.id}-v1`), {
      name: 'Estándar',
      sku: fila.codigo.slice(0, 40),
      priceUsd: redondearPrecio(fila.costo),
      stock: fila.existencia,
      active: true,
    }));
    creados += 1;
    resumen.altas.push({
      codigo: fila.codigo,
      nombre: nombre.slice(0, 60),
      stock: fila.existencia,
    });
  }
  resumen.altas = resumen.altas.slice(0, TOPE_CAMBIOS_RESUMEN);
  resumen.creados = creados;
  resumen.actualizados = actualizados;

  const tLecturas = Date.now();
  resumen.tiempos = { msPdf: tPdf - t0, msLecturas: tLecturas - tPdf, msEscrituras: 0 };
  // Ensayo: NADA se escribe (ni lotes ni auditoría).
  if (!ensayo) {
    lote.push(loteActual);
    await Promise.all(lote.map((b) => b.commit())); // 5.140: lotes en paralelo
    resumen.tiempos.msEscrituras = Date.now() - tLecturas;
    const notaHuerfanas = omitidasHuerfanas
      ? ` · ${omitidasHuerfanas} referencia${omitidasHuerfanas === 1 ? '' : 's'} huérfana${omitidasHuerfanas === 1 ? '' : 's'} omitida${omitidasHuerfanas === 1 ? '' : 's'}`
      : '';
    await writeAudit({
      action: 'importar_inventario',
      adminUid,
      targetId: categoryId,
      note: `${parseo.formato} · modo completo · ${parseo.filas.length} filas · +${creados} nuevos · ~${actualizados} actualizados${notaHuerfanas}`,
    });
  }
  console.log(`[fn-importInventory] modo ${modo}${ensayo ? ' · ENSAYO' : ''} · tiempos ms: pdf=${resumen.tiempos.msPdf} lecturas=${resumen.tiempos.msLecturas} escrituras=${resumen.tiempos.msEscrituras}`);
  return resumen;
}

export const fnImportInventory = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 5 },
  (req: CallableRequest) => coreImportInventory(req as unknown as CoreCtx),
);