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
 * · omitirCero: si el admin lo marca, las filas con existencia 0 no se
 *   crean NI se tocan (el reporte suele traer muchos en cero).
 * · Escrituras en lotes ≤ 450 ops (límite de Firestore: 500). Re-importar
 *   es seguro: los valores simplemente se vuelven a escribir.
 */
import admin from 'firebase-admin';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { extraerItemsPdf } from './lib/extraerPdf';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { parseInventario } from './lib/inventarioPdf';
import { writeAudit } from './payments';

const db = () => admin.firestore(getAdminApp());

/** Tope defensivo de filas por importación (reportes de miles de ítems). */
const MAX_FILAS = 2000;
/** Firestore admite 500 ops por lote: margen para el control. */
const OPS_POR_LOTE = 450;
/** Firestore `in` admite 30 valores por consulta. */
const EN_CONSULTA = 30;

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

/** Consulta `where campo in …` por tandas de 30 y devuelve los docs. */
async function porLotesIn(
  coleccion: admin.firestore.Query,
  campo: string,
  valores: string[],
): Promise<admin.firestore.QueryDocumentSnapshot[]> {
  const docs: admin.firestore.QueryDocumentSnapshot[] = [];
  for (let i = 0; i < valores.length; i += EN_CONSULTA) {
    const tanda = valores.slice(i, i + EN_CONSULTA);
    if (!tanda.length) continue;
    const snap = await coleccion.where(campo, 'in', tanda).get();
    docs.push(...snap.docs);
  }
  return docs;
}

interface VarianteDatos {
  sku: string;
  stock: number;
  priceUsd: number;
  activa: boolean;
}

export async function coreImportInventory(ctx: CoreCtx): Promise<unknown> {
  // Igual que fn-adjustStock: administración o gerencia (reglas del catálogo).
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  const role = ctx.auth.token['role'];
  if (role !== 'admin' && role !== 'gerente') {
    throw new HttpsError('permission-denied', 'Solo administración o gerencia.');
  }
  const adminUid = ctx.auth.uid;

  const pdfBase64 = typeof ctx.data?.['pdfBase64'] === 'string' ? ctx.data['pdfBase64'] : '';
  const categoryId = sanitizeStr(ctx.data?.['categoryId'], 120);
  const omitirCero = ctx.data?.['omitirCero'] === true;
  if (!pdfBase64) throw new HttpsError('invalid-argument', 'Falta el archivo PDF.');
  if (!categoryId) throw new HttpsError('invalid-argument', 'Elige la categoría donde caerán los productos nuevos.');

  // La categoría debe existir: los productos nuevos caen ahí (y toman su
  // imagen de respaldo /img/products/{categoría}.svg, igual que el panel).
  const catSnap = await db().collection('categories').doc(categoryId).get();
  if (!catSnap.exists) {
    throw new HttpsError('invalid-argument', 'La categoría elegida no existe. Recarga el panel.');
  }

  const parseo = parseInventario(await extraerItemsPdf(pdfBase64));
  if (!parseo.filas.length) {
    throw new HttpsError(
      'invalid-argument',
      'No se reconoció ningún producto. Verifica que el PDF sea el reporte «Inventario disponible» de tu sistema.',
    );
  }
  if (parseo.filas.length > MAX_FILAS) {
    throw new HttpsError('invalid-argument', `El reporte trae ${parseo.filas.length} filas (tope ${MAX_FILAS}). Divídelo.`);
  }

  // ── Emparejamiento: por código de producto y por sku de variante ──
  const filas = omitirCero ? parseo.filas.filter((f) => f.existencia > 0) : parseo.filas;
  const omitidosCero = parseo.filas.length - filas.length;
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
  if (skuSinProducto.length) {
    const buscar = new Set(skuSinProducto.map((c) => c.slice(0, 40).toUpperCase()));
    const variantes = await db().collectionGroup('variants').get();
    variantes.forEach((d) => {
      const sku = String(d.data()['sku'] ?? '').toUpperCase();
      const pid = d.ref.parent?.parent?.id;
      if (sku && pid && buscar.has(sku) && !productoPorCode.has(sku)) {
        productoPorSku.set(sku, pid);
      }
    });
  }

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
  for (const [pid, plan] of cambiosPorProducto) {
    const pref = db().doc(`products/${pid}`);
    const varsSnap = await pref.collection('variants').get();
    const variantes = new Map<string, VarianteDatos>();
    varsSnap.docs.forEach((d) => {
      const data = d.data();
      variantes.set(d.id, {
        sku: String(data['sku'] ?? '').toUpperCase(),
        stock: Number(data['stock'] ?? 0),
        priceUsd: Number(data['priceUsd'] ?? 0),
        activa: data['active'] !== false,
      });
    });

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

    for (const [vid, cambio] of aplicado) {
      enLote((b) => b.update(pref.collection('variants').doc(vid), {
        stock: Math.max(0, Math.round(cambio.stock)),
        priceUsd: redondearPrecio(cambio.priceUsd),
      }));
    }
    enLote((b) => b.update(pref, {
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
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
  }
  lote.push(loteActual);
  for (const b of lote) await b.commit();

  await writeAudit({
    action: 'importar_inventario',
    adminUid,
    targetId: categoryId,
    note: `${parseo.filas.length} filas · +${creados} nuevos · ~${actualizados} actualizados${omitidosCero ? ` · ${omitidosCero} en cero omitidos` : ''}`,
  });

  return {
    filas: parseo.filas.length,
    creados,
    actualizados,
    omitidosCero,
    problemas: parseo.problemas.slice(0, 20),
  };
}

export const fnImportInventory = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 5 },
  (req: CallableRequest) => coreImportInventory(req as unknown as CoreCtx),
);
