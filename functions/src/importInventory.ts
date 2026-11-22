/**
 * SPOT 24 · Importar inventario: modo «actualizar» con el Excel del ERP
 * (5.151/5.152) — la ÚNICA vía de importación desde la ronda 5.161.
 *
 * El dueño sube el «REPORTE LISTA DE PRECIOS» en Excel (.xlsx) del ERP:
 *  · existe → actualiza precio («Precio REF c/Imp» CON decimales) y stock.
 *  · no existe → borrador INACTIVO, sin categoría, CON precio y existencia.
 *  · solo se escriben los CAMBIOS reales (Regla 4); el ensayo no escribe
 *    nada (Regla 5) y el precio 0/ilegible jamás toca el precio (Regla 3).
 *
 * 5.161 · CIERRE DE LA PENDIENTE 5.154 («borrar el código PDF dormido»):
 * se eliminó el import por PDF — modos «completo»/«stock»/«precios»,
 * lib/extraerPdf (pdfjs-dist) y lib/inventarioPdf. El botón llevaba fuera
 * del panel desde la 5.151 y el Excel lleva corriendo en producción 3 veces
 * al día (verificado por el dueño). Un modo viejo recibe hoy una orden
 * explícita de usar el Excel en vez de un camino muerto.
 *
 * Arquitectura de lecturas (la misma de siempre):
 *  · Emparejamiento por product.code y por sku de variante: porLotesIn en
 *    tandas de 30 EN PARALELO (5.140).
 *  · UNA lectura en bloque de collectionGroup('variants') para todo el
 *    proceso (5.140) — sin índices manuales (5.87d).
 *  · Blindaje de vivos por documentId (5.92b) + semilla sin re-lectura de
 *    los emparejados por código (5.157): ~1 lectura menos por producto.
 *  · Escrituras: lotes de 450 confirmados en paralelo; registro de la
 *    corrida en inventoryImports + writeAudit (5.152).
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import type { FilaInventario } from './lib/filasInventario';
import { parseListaPreciosXlsx } from './lib/listaPreciosXlsx';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/**
 * 5.151/5.152 · Tope del modo «actualizar» (Excel del ERP): margen para el
 * crecimiento del catálogo que espera el dueño («se espera que el catálogo
 * crezca bastante»). El archivo real de 985 filas sobra; subirlo es cambiar
 * esta constante.
 */
export const MAX_FILAS_ACTUALIZAR = 5000;
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

/**
 * 5.157 · Semilla de vivos SIN re-lectura para los emparejados por CÓDIGO.
 *
 * La consulta por 'code' corre sobre la COLECCIÓN products: un documento que
 * una consulta devuelve EXISTE por definición (Firestore jamás devuelve un
 * doc borrado), y llega con name y createdAt a bordo. Re-leer esos mismos
 * pids por documentId era la pasada «blindaje de vivos» (5.92b) — correcta
 * pero redundante para ellos: ~1 lectura extra por producto del catálogo en
 * CADA corrida (ensayo o real).
 *
 * Única excepción real: los pids emparejados por SKU de variante — esos sí
 * pueden ser huérfanos (collectionGroup('variants') sigue listando variantes
 * de productos ya borrados), así que se devuelven en pidsPorVerificar para
 * que el llamador los re-lea por documentId en tandas de 30 como siempre.
 *
 * Pura: mismo input → mismo output. El comportamiento OBSERVABLE de
 * filtrarPidsVivos queda intacto (pidsVivos contiene exactamente los pids
 * vivos de antes).
 */
export interface DocMinimo {
  id: string;
  data(): Record<string, unknown>;
}

export function sembrarVivosDeLecturas(
  docsCode: readonly DocMinimo[],
  pidsPorSku: Iterable<string>,
): {
  pidsVivos: Set<string>;
  nombrePorPid: Map<string, string>;
  pidsPorVerificar: string[];
} {
  const pidsVivos = new Set<string>();
  const nombrePorPid = new Map<string, string>();
  docsCode.forEach((d) => {
    pidsVivos.add(d.id);
    nombrePorPid.set(d.id, String(d.data()['name'] ?? ''));
  });
  // Dedup de sku-pids y fuera los que ya nacieron vivos por código: la
  // consulta documentId solo verá los pids que realmente la necesitan.
  const pidsPorVerificar = [...new Set([...pidsPorSku])].filter((pid) => !pidsVivos.has(pid));
  return { pidsVivos, nombrePorPid, pidsPorVerificar };
}

/* ── 5.137/5.138 · Modos, ensayo y planes (lógica PURA, testeable sin Firestore) ── */

/** 5.161 · Único modo: «actualizar» (el Excel del ERP, 5.151/5.152). */
export type ModoImportacion = 'actualizar';

/**
 * Modo pedido en el body. 5.161 · Cualquier valor viejo (o ausente) es un
 * error EXPLÍCITO: los modos del PDF se retiraron con la pendiente 5.154 y
 * nada legítimo los envía — el panel manda 'actualizar' desde la 5.151.
 */
export function modoDe(data: unknown): ModoImportacion {
  const m = (data as Record<string, unknown> | undefined)?.['modo'];
  if (m === 'actualizar') return 'actualizar';
  throw new HttpsError(
    'failed-precondition',
    `El import por PDF se retiró (5.161): el modo «${String(m ?? 'sin modo')}» ya no existe. `
      + 'Usa el modo «actualizar» con el Excel del ERP («REPORTE LISTA DE PRECIOS»).',
  );
}

/**
 * 5.152 · Roles por modo (decisión del dueño): el Excel «actualizar» lo
 * corren cajero, gerente y admin; el resto queda admin/gerente. Delivery
 * jamás. Pura para poder testearla sin Firestore.
 */
export function puedeImportarInventario(modo: ModoImportacion, role: unknown): boolean {
  const permitidos = modo === 'actualizar' ? ['admin', 'gerente', 'cajero'] : ['admin', 'gerente'];
  return typeof role === 'string' && permitidos.includes(role);
}

/** Bandera de ensayo (dry-run: no escribe nada). */
export function ensayoDe(data: unknown): boolean {
  return (data as Record<string, unknown> | undefined)?.['ensayo'] === true;
}

/**
 * 5.141 · Precio de la lista CON decimales (pedido del dueño: «cuando
 * importo para actualizar los precios necesito que tome en cuenta los
 * decimales»): 125.81 → 125.81 · 15.00 → 15 · 0.75 → 0.75 · basura → 0
 * (jamás NaN: un precio 0 o ilegible NO se aplica — Regla 3 de planActualizar).
 * Redondeo a 2 decimales, el mismo que escribe el panel.
 */
export function precioDecimalesDe(n: number): number {
  return Number.isFinite(n) ? redondearPrecio(n) : 0;
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
  /** Precio nuevo CON decimales (redondeado a 2). */
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
  /** 5.152 · Modo actualizar: precio CON el que nace el borrador (0 si ilegible). */
  precio?: number;
}


export interface PlanActualizar {
  /** Precio que cambia de verdad (antes ≠ después, después > 0). */
  cambiosPrecio: Array<CambioPrecioInfo & { pid: string; vid: string }>;
  /** Existencia que cambia de verdad (antes ≠ después). */
  cambiosStock: Array<CambioStockInfo & { pid: string; vid: string }>;
  /** Códigos NUEVOS: nacen como borrador INACTIVO con precio y existencia. */
  altas: FilaInventario[];
  /** Códigos emparejados SIN ningún cambio real: 0 escrituras (Regla 4). */
  sinCambio: string[];
  /** Emparejados con precio 0/ilegible en el archivo: precio NO se toca
   *  (Regla 3); si su stock cambia igual aparecen en cambiosStock. */
  sinPrecio: string[];
}

/**
 * 5.152 · Clasificación PURA del modo «actualizar» (las Reglas 1 a 4 del
 * pedido del dueño en UNA sola pasada sobre el emparejamiento code/sku):
 *  · existe + precio válido ≠ actual → cambiosPrecio (Regla 1).
 *  · existe + stock ≠ actual → cambiosStock (Regla 1, junto al precio).
 *  · no existe → altas (Regla 2: borrador inactivo con precio y existencia).
 *  · precio 0/ilegible de un EXISTENTE → sinPrecio, su stock SÍ se procesa
 *    (Regla 3: jamás un producto gratis, pero la existencia es real).
 *  · nada cambió → sinCambio: CERO escrituras (Regla 4).
 */
export function planActualizar(
  filas: FilaInventario[],
  existentes: Map<string, {
    pid: string;
    nombre: string;
    precioActual: number;
    stockActual: number;
    vid: string;
  }>,
): PlanActualizar {
  const cambiosPrecio: PlanActualizar['cambiosPrecio'] = [];
  const cambiosStock: PlanActualizar['cambiosStock'] = [];
  const altas: FilaInventario[] = [];
  const sinCambio: string[] = [];
  const sinPrecio: string[] = [];
  for (const fila of filas) {
    const blanco = existentes.get(fila.codigo);
    if (!blanco) {
      altas.push(fila);
      continue;
    }
    let toco = false;
    const nuevoPrecio = precioDecimalesDe(fila.precioConImp ?? Number.NaN);
    if (nuevoPrecio > 0) {
      const antes = Math.round(blanco.precioActual * 100) / 100;
      if (nuevoPrecio !== antes) {
        cambiosPrecio.push({
          codigo: fila.codigo,
          nombre: blanco.nombre,
          antes,
          despues: nuevoPrecio,
          pid: blanco.pid,
          vid: blanco.vid,
        });
        toco = true;
      }
    } else {
      // Regla 3 (punto ciego): el precio del archivo es 0 o ilegible.
      sinPrecio.push(fila.codigo);
    }
    const nuevoStock = existenciaEnteraDe(fila.existencia);
    if (nuevoStock !== Math.round(blanco.stockActual)) {
      cambiosStock.push({
        codigo: fila.codigo,
        nombre: blanco.nombre,
        antes: Math.round(blanco.stockActual),
        despues: nuevoStock,
        pid: blanco.pid,
        vid: blanco.vid,
      });
      toco = true;
    }
    if (!toco) sinCambio.push(fila.codigo);
  }
  return { cambiosPrecio, cambiosStock, altas, sinCambio, sinPrecio };
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

/**
 * 5.152 · Payload del producto NUEVO del modo «actualizar»: IGUAL que el del
 * modo stock (INACTIVO, SIN categoría — «sin categoria e inactivo para
 * completar luego y ponerlo activo donde corresponde») pero CON el precio y
 * la existencia del archivo («crear el producto con el precio y la
 * existencia»). Precio ilegible/0 → 0 (nace inactivo: jamás sale gratis a
 * la venta; el dueño lo completa antes de activarlo).
 */
export function datosProductoNuevoActualizar(
  fila: FilaInventario,
  ahora: number,
  slug: string,
): { producto: Record<string, unknown>; variante: Record<string, unknown> } {
  const base = datosProductoNuevoStock(fila, ahora, slug);
  const precio = precioDecimalesDe(fila.precioConImp ?? Number.NaN);
  return {
    producto: { ...base.producto, basePriceUsd: precio },
    variante: { ...base.variante, priceUsd: precio },
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
  /** Modo precios: precio 0 o ilegible en el PDF → se conserva el precio actual. */
  sinPrecio: string[];
  /** Modo precios: el precio ya era ese (nada que escribir). */
  sinCambio: number;
  /** Modo precios: precio anterior → nuevo CON decimales (tope 50). */
  cambiosPrecio: CambioPrecioInfo[];
  /** Modo stock (y ensayo de completo): altas — códigos que se crearían/crearon. */
  altas: AltaInfo[];
  /** Modo stock: existencias antes → después (tope 50). */
  cambiosStock: CambioStockInfo[];
  /** 5.140 · Dónde se fue el tiempo (log del servidor; el cliente lo ignora). */
  tiempos: {
    /** Leer + parsear el archivo (Excel del ERP). */
    msArchivo: number;
    /** TODAS las lecturas de Firestore (emparejar, validar, planear). */
    msLecturas: number;
    /** Confirmar los lotes (0 en ensayo: no escribe). */
    msEscrituras: number;
  };
  /** 5.152 · Modo actualizar: nombre del archivo subido (para la corrida). */
  archivo?: string;
  /** 5.152 · Modo actualizar: meta del lector XLSX (para el resumen del panel). */
  metaXlsx?: { bloques: number; basura: number; descartadasResumen: number };
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

/* ── 5.151/5.152 · MODO «ACTUALIZAR»: el Excel del ERP, las Reglas 1-5 ── */

interface CtxActualizar {
  role: unknown;
  adminUid: string;
  ensayo: boolean;
}

/**
 * Núcleo del modo «actualizar» (5.151/5.152): la entrada es el «REPORTE LISTA
 * DE PRECIOS» en Excel del ERP; el upsert literal del dueño:
 *  «si el codigo existe actualizar tanto el precio como el stock y si no
 *   existe crear el producto con el precio y la existencia, sin categoria e
 *   inactivo para completar luego y ponerlo activo donde corresponde».
 * La lectura/emparejamiento replica EXACTAMENTE la arquitectura de los otros
 * modos (porLotesIn code → sku del grupo variants → blindaje de vivos
 * 5.92b) y las escrituras son SOLO los cambios reales (Regla 4), loteados a
 * 450 y confirmados en paralelo. En ensayo NADA se escribe (Regla 5).
 */
async function coreActualizar(ctx: CoreCtx, datos: CtxActualizar): Promise<unknown> {
  const { role, adminUid, ensayo } = datos;
  const archivoB64 = typeof ctx.data?.['archivoBase64'] === 'string' ? ctx.data['archivoBase64'] : '';
  if (!archivoB64) throw new HttpsError('invalid-argument', 'Falta el archivo Excel (.xlsx) de la lista de precios.');
  const nombreArchivo = sanitizeStr(ctx.data?.['nombreArchivo'], 120) || 'lista de precios.xlsx';

  // ── 1 · Lectura del Excel (lib/listaPreciosXlsx: multi-bloque, coma VE,
  //        ceros iniciales como texto, filas-trampa del ERP descartadas) ──
  const t0 = Date.now();
  let bytes: Buffer;
  try {
    bytes = Buffer.from(archivoB64, 'base64');
  } catch {
    throw new HttpsError('invalid-argument', 'El archivo llegó dañado (no se pudo decodificar).');
  }
  const parseo = parseListaPreciosXlsx(new Uint8Array(bytes));
  const tArchivo = Date.now();
  if (!parseo.filas.length) {
    throw new HttpsError(
      'invalid-argument',
      'No se reconoció ningún producto en el Excel. Sube el «REPORTE LISTA DE PRECIOS» de tu sistema (.xlsx).',
    );
  }
  if (parseo.filas.length > MAX_FILAS_ACTUALIZAR) {
    throw new HttpsError(
      'invalid-argument',
      `El archivo trae ${parseo.filas.length} filas (tope ${MAX_FILAS_ACTUALIZAR}). Divídelo.`,
    );
  }

  // ── 2 · Emparejamiento code/sku (idéntico a los otros modos) ──
  const filas = parseo.filas;
  const codigos = [...new Set(filas.map((f) => f.codigo))];
  const productoPorCode = new Map<string, string>();
  const docs = codigos.length
    ? await porLotesIn(db().collection('products'), 'code', codigos)
    : [];
  docs.forEach((d) => {
    const code = String(d.data()['code'] ?? '').toUpperCase();
    if (code) productoPorCode.set(code, d.id);
  });

  const skuSinProducto = codigos.filter((c) => !productoPorCode.has(c));
  const productoPorSku = new Map<string, string>();
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

  // 5.157 · Vivos sin re-lectura para los emparejados por código: la consulta
  // por 'code' corre sobre la colección products, y un doc que una consulta
  // devuelve EXISTE por definición — llega con name a bordo. La pasada vieja
  // (documentId en tandas de 30 sobre TODOS los candidatos) re-leía el mismo
  // catálogo una segunda vez: ~1 lectura extra por producto en cada corrida.
  // Ahora la re-lectura queda SOLO para los pids emparejados por SKU de
  // variante (esos sí pueden ser huérfanos de productos borrados, blindaje
  // 5.92b intacto) — en el flujo real del Excel suelen ser cero o una tanda.
  const { pidsVivos, nombrePorPid, pidsPorVerificar } = sembrarVivosDeLecturas(docs, productoPorSku.values());
  const tandasVivos: Array<Promise<admin.firestore.QuerySnapshot>> = [];
  for (let i = 0; i < pidsPorVerificar.length; i += EN_CONSULTA) {
    const tanda = pidsPorVerificar.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    tandasVivos.push(
      db().collection('products')
        .where(admin.firestore.FieldPath.documentId(), 'in', tanda)
        .get(),
    );
  }
  const vivosSnaps = await Promise.all(tandasVivos);
  vivosSnaps.forEach((snap) =>
    snap.forEach((d) => {
      pidsVivos.add(d.id);
      nombrePorPid.set(d.id, String(d.data()['name'] ?? ''));
    }),
  );
  const omitidasHuerfanas = filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos);

  // ── 3 · Existentes con precio y stock de su variante objetivo ──
  const existentes = new Map<string, {
    pid: string; nombre: string; precioActual: number; stockActual: number; vid: string;
  }>();
  const pidsMatch = new Set<string>();
  for (const fila of filas) {
    const pid = productoPorCode.get(fila.codigo) ?? productoPorSku.get(fila.codigo);
    if (!pid) continue;
    pidsMatch.add(pid);
    existentes.set(fila.codigo, { pid, nombre: nombrePorPid.get(pid) ?? '', precioActual: 0, stockActual: 0, vid: '' });
  }
  const variantesPorPid = variantesDeGrupo(grupoVariantes, pidsMatch);
  for (const [codigo, info] of existentes) {
    const map = variantesPorPid.get(info.pid);
    const vid = map ? elegirVid(map, codigo) : null;
    if (!map || !vid) {
      // Producto sin variantes (resto de datos del panel): no emparejable,
      // su código cae como NUEVO (alta) igual que en los otros modos.
      existentes.delete(codigo);
      continue;
    }
    const v = map.get(vid)!;
    info.vid = vid;
    info.precioActual = v.priceUsd;
    info.stockActual = v.stock;
  }

  // ── 4 · Plan (Reglas 1-4, pura) ──
  const plan = planActualizar(filas, existentes);

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

  // ── 5 · UPDATE de existentes: consolidado por producto (un pid puede
  //      llevar precio Y stock a la vez) → 1 update por variante tocada y
  //      UNA sola ficha del producto (basePriceUsd solo si cambió precio). ──
  const tocadosPorPid = new Map<string, { precio: Map<string, number>; stock: Map<string, number> }>();
  const tocar = (pid: string, vid: string, campo: 'precio' | 'stock', valor: number): void => {
    const actual = tocadosPorPid.get(pid) ?? { precio: new Map<string, number>(), stock: new Map<string, number>() };
    (campo === 'precio' ? actual.precio : actual.stock).set(vid, valor);
    tocadosPorPid.set(pid, actual);
  };
  for (const c of plan.cambiosPrecio) tocar(c.pid, c.vid, 'precio', c.despues);
  for (const c of plan.cambiosStock) tocar(c.pid, c.vid, 'stock', c.despues);

  let actualizados = 0;
  for (const [pid, cambios] of tocadosPorPid) {
    const pref = db().doc(`products/${pid}`);
    const map = variantesPorPid.get(pid)!;
    const estadoFinal = new Map<string, VarianteDatos>();
    map.forEach((v, vid) => estadoFinal.set(vid, { ...v }));
    for (const [vid, p] of cambios.precio) {
      const actual = estadoFinal.get(vid);
      if (actual) estadoFinal.set(vid, { ...actual, priceUsd: p });
    }
    for (const [vid, s] of cambios.stock) {
      const actual = estadoFinal.get(vid);
      if (actual) estadoFinal.set(vid, { ...actual, stock: s });
    }
    const vidsTocados = new Set([...cambios.precio.keys(), ...cambios.stock.keys()]);
    for (const vid of vidsTocados) {
      const precioNuevo = cambios.precio.get(vid);
      const stockNuevo = cambios.stock.get(vid);
      enLote((b) => b.update(pref.collection('variants').doc(vid), {
        ...(precioNuevo !== undefined ? { priceUsd: redondearPrecio(precioNuevo) } : {}),
        ...(stockNuevo !== undefined ? { stock: Math.max(0, stockNuevo) } : {}),
      }));
    }
    const stockTotal = [...estadoFinal.values()].reduce((a, v) => a + Math.max(0, Math.round(v.stock)), 0);
    const escribePrecio = cambios.precio.size > 0;
    const basePriceUsd = escribePrecio
      ? redondearPrecio(Math.min(...[...estadoFinal.values()].map((v) => v.priceUsd).filter((p) => Number.isFinite(p) && p >= 0)))
      : 0;
    enLote((b) => b.update(pref, {
      stockTotal,
      updatedAt: ahora,
      ...(escribePrecio ? { basePriceUsd } : {}),
    }));
    actualizados += vidsTocados.size;
  }

  // ── 6 · CREATE de nuevos (Regla 2): borrador INACTIVO, SIN categoría, CON
  //      precio y existencia; imagen placeholder hasta que el dueño complete. ──
  let creados = 0;
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
    const datosNueva = datosProductoNuevoActualizar(fila, ahora, slug);
    enLote((b) => b.set(pref, datosNueva.producto));
    enLote((b) => b.set(pref.collection('variants').doc(`${pref.id}-v1`), datosNueva.variante));
    creados += 1;
  }

  // ── 7 · Resumen (el mismo contrato del modal, con lo nuevo del modo) ──
  const resumen: ResumenImportacion = {
    filas: filas.length,
    formato: 'xlsx',
    modo: 'actualizar',
    ensayo,
    creados,
    actualizados,
    omitidasHuerfanas,
    problemas: parseo.problemas.slice(0, 20),
    sinPrecio: plan.sinPrecio.slice(0, TOPE_LISTA_RESUMEN),
    sinCambio: plan.sinCambio.length,
    cambiosPrecio: plan.cambiosPrecio.slice(0, TOPE_CAMBIOS_RESUMEN).map(({ codigo, nombre, antes, despues }) => ({
      codigo, nombre, antes, despues,
    })),
    altas: plan.altas.slice(0, TOPE_CAMBIOS_RESUMEN).map((f) => ({
      codigo: f.codigo,
      nombre: f.descripcion.slice(0, 60),
      stock: existenciaEnteraDe(f.existencia),
      precio: precioDecimalesDe(f.precioConImp ?? Number.NaN),
    })),
    cambiosStock: plan.cambiosStock.slice(0, TOPE_CAMBIOS_RESUMEN).map(({ codigo, nombre, antes, despues }) => ({
      codigo, nombre, antes, despues,
    })),
    tiempos: { msArchivo: tArchivo - t0, msLecturas: 0, msEscrituras: 0 },
    archivo: nombreArchivo,
    metaXlsx: {
      bloques: parseo.bloquesEncabezado,
      basura: parseo.filasBasura,
      descartadasResumen: parseo.descartadasResumen,
    },
  };

  const tLecturas = Date.now();
  resumen.tiempos = { msArchivo: tArchivo - t0, msLecturas: tLecturas - tArchivo, msEscrituras: 0 };
  // Regla 5 · ENSAYO: NADA se escribe (ni lotes ni corrida ni auditoría).
  if (!ensayo) {
    lote.push(loteActual);
    await Promise.all(lote.map((b) => b.commit()));
    resumen.tiempos.msEscrituras = Date.now() - tLecturas;

    // Auditoría por corrida (decisión del dueño): «se vea quien lo ejecuto
    // por ultima vez con fecha y hora» donde está el botón. 1 lectura del
    // nombre (users/{uid}) + 1 documento por corrida. Los cajeros ven esta
    // página (firestore.rules: lectura staff, escritura SOLO funciones).
    const userSnap = await db().collection('users').doc(adminUid).get();
    const byName = sanitizeStr(userSnap.data()?.['name'], 80) || 'Personal';
    await db().collection('inventoryImports').add({
      byUid: adminUid,
      byName,
      byRole: String(role ?? ''),
      at: ahora,
      archivo: nombreArchivo,
      filas: filas.length,
      altas: plan.altas.length,
      precios: plan.cambiosPrecio.length,
      stocks: plan.cambiosStock.length,
      sinCambio: plan.sinCambio.length,
      modo: 'actualizar',
    });

    await writeAudit({
      action: 'importar_inventario',
      adminUid,
      targetId: 'actualizar',
      note: `${nombreArchivo} · modo actualizar · ${filas.length} filas · ${plan.cambiosPrecio.length} precios`
        + ` · ${plan.cambiosStock.length} existencias · +${plan.altas.length} borradores`
        + ` · ${plan.sinCambio.length} sin cambio${omitidasHuerfanas ? ` · ${omitidasHuerfanas} huérfanas` : ''}`,
    });
  }
  console.log(
    `[fn-importInventory] modo actualizar${ensayo ? ' · ENSAYO' : ''} · ${nombreArchivo}`
    + ` · tiempos ms: archivo=${resumen.tiempos.msArchivo} lecturas=${resumen.tiempos.msLecturas} escrituras=${resumen.tiempos.msEscrituras}`,
  );
  return resumen;
}

export async function coreImportInventory(ctx: CoreCtx): Promise<unknown> {
  // 5.161 · ÚNICO modo «actualizar» (Excel del ERP): cajero, gerente y admin
  // (decisión 5.152). modoDe ya rechazó cualquier modo del PDF borrado.
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  const modo = modoDe(ctx.data);
  if (!puedeImportarInventario(modo, role)) {
    throw new HttpsError('permission-denied', 'Solo administración, gerencia o caja.');
  }
  return coreActualizar(ctx, { role, adminUid: ctx.auth.uid, ensayo: ensayoDe(ctx.data) });
}

export const fnImportInventory = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 5, timeoutSeconds: 120 },
  (req: CallableRequest) => coreImportInventory(req as unknown as CoreCtx),
);