/**
 * SPOT 24 · Lector del «REPORTE LISTA DE PRECIOS» en EXCEL (.xlsx) del ERP
 * (5.151, a pedido del dueño: «ya no quiero las opciones de importar pdf,
 * solo quiero poder actualizar» con el Excel que trae «más de 1000
 * productos»).
 *
 * Formato real verificado con el archivo del dueño (ListadePreciosGabriel.xlsx,
 * 2.981 filas · 985 productos · ERP AUTO SERVICIO MONTANA FRESCA 2026, C.A):
 *  · Portada/filtros arriba (empresa, dirección, fecha, hora, «Nivel …»,
 *    «Clase:», «Estatus :Todas», «Ordenado Por : Código», «Tipo de Precio»).
 *  · Fila de encabezado con GRUPOS de celdas repetidas (celdas fusionadas):
 *    Codigo | Descripcion | Existencia | Precio | Precio c/Imp |
 *    Precio REF | Precio REF c/Imp. El reporte puede repetir el bloque de
 *    encabezado entre secciones (el archivo de 2007 traía 5).
 *  · Cada producto va seguido de 2 filas de detalle por depósito («Deposito»
 *    y «DEPOSITO PRINCIPAL»). Pie final: «No. de Registros» y «Pag.NN».
 *  · Números en TEXTO con convención venezolana («95.648,70», «2,00») —
 *    reutiliza numeroVe, que también acepta la variante US («95,648.70»).
 *  · Los códigos van como TEXTO: los 41 que empiezan con 0 (p. ej.
 *    «021400059245») conservan su cero. Celda numérica → texto entero.
 *
 * ── CALIBRACIÓN DE COLUMNAS (hallazgo 5.151 sobre el archivo REAL) ──
 * Las anclas del encabezado NO coinciden con las de las filas de datos
 * (encabezado: Codigo×2+Descripcion×10+Existencia×5…; datos: Codigo×3 +
 * hueco + Descripcion×8 + Existencia×4…). Leer el encabezado por SU columna
 * y aplicar esa columna a los datos da «Descripcion» = código y «Precio REF
 * c/Imp» = vacío (TODO quedaría sin precio). La lectura fiable es la
 * ESTRUCTURA DE LA FILA DE DATOS MISMA: cada campo del ERP llega como una
 * CORRIDA (run) de celdas IGUALES contiguas separadas por huecos o por otro
 * valor. La primera fila de datos bien formada del bloque CALIBRA la columna
 * absoluta de cada campo (por el orden de las corridas contra el orden de
 * las etiquetas del encabezado) y las filas siguientes la usan. Bloque nuevo
 * → se recalibra. Fallback sin calibración: anclas del encabezado.
 *
 * Mapeo que pidió el dueño (5.151): precio ← «Precio REF c/Imp» (USD CON
 * impuesto: el precio final de la tienda con el modelo de IVA incluido 5.120)
 * · stock ← Existencia · nombre ← Descripcion · código ← Codigo.
 *
 * EXCLUSIÓN DE FILAS-TRAMPA (5.151, decisión del dueño): las filas de
 * resumen interno del ERP «COMPRAS GRAVABLES» y «COMPRAS EXENTAS» NO son
 * productos («no deben ser tomadas en cuentas, realmente no son productos»):
 * se descartan SIEMPRE y quedan contadas en el resumen. Todo lo demás que
 * no se entienda queda en `problemas` (jamás se inventa un producto).
 *
 * Este módulo es PURO (solo SheetJS + numeroVe): lo testea el frontend con
 * vitest y lo usa el core del importador (misma arquitectura que
 * lib/inventarioPdf).
 */
import * as XLSX from 'xlsx';
import { numeroVe, type FilaInventario } from './inventarioPdf';

/** Etiquetas de encabezado que definen los grupos de columnas del reporte. */
const ETIQUETAS = [
  'Codigo',
  'Descripcion',
  'Existencia',
  'Precio',
  'Precio c/Imp',
  'Precio REF',
  'Precio REF c/Imp',
] as const;

type Etiqueta = (typeof ETIQUETAS)[number];

/** Columna ancla (1ª del grupo de celdas fusionadas) de cada campo. */
type MapaColumnas = Partial<Record<Etiqueta, number>>;

/**
 * Filas de resumen interno del ERP que NO son productos (5.151, decisión del
 * dueño). Comparación por descripción normalizada (mayúsculas, sin acentos,
 * espacios colapsados) para que no importe cómo venga escrito el código.
 */
const FILAS_TRAMPA = new Set(['COMPRAS GRAVABLES', 'COMPRAS EXENTAS']);

function normalizarDesc(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Celda cruda → texto limpio (números a texto, sin saltos raros). */
export function textoPlano(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return '';
  if (typeof v === 'string') return v.replace(/\s+/g, ' ').trim();
  return String(v).replace(/\s+/g, ' ').trim();
}

/** Celda cruda → número (convención VE por texto; crudo si ya es número). */
export function numeroDeCelda(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  const s = textoPlano(v);
  if (!s) return NaN;
  return numeroVe(s);
}

/** Corrida de celdas iguales contiguas (la unidad estructural del reporte). */
interface Corrida {
  valor: string;
  /** Índice de la 1ª celda de la corrida. */
  desde: number;
}

/**
 * Corridas de una fila: reparte las celdas en corridas de valor igual
 * contiguo; las celdas vacías SEPARAN (dos grupos con el mismo valor pero
 * con hueco entre medias son dos corridas) igual que un valor distinto.
 * Fila real 24 del dueño → [D22-850], [BATERIA DUNCAN 850], [2,00],
 * [95.648,70], [110.952,49], [108,46], [125,81] (7 corridas, 7 campos).
 */
export function corridasDe(celdas: unknown[]): Corrida[] {
  const out: Corrida[] = [];
  let previa = '';
  for (let i = 0; i < celdas.length; i++) {
    const t = textoPlano(celdas[i]);
    if (t === '') {
      previa = '';
      continue;
    }
    if (t !== previa) {
      out.push({ valor: t, desde: i });
      previa = t;
    }
  }
  return out;
}

/**
 * De una fila de encabezado construye el mapa de columnas por ANCLA:
 * recorre de izquierda a derecha, agrupa las celdas de etiqueta IGUAL
 * consecutiva y toma la PRIMERA columna de cada grupo. (Fallback: en el
 * archivo real las anclas del encabezado NO alinean con los datos.)
 */
export function mapaDeEncabezado(celdas: string[]): MapaColumnas {
  const mapa: MapaColumnas = {};
  let previa = '';
  for (let i = 0; i < celdas.length; i++) {
    const etiqueta = celdas[i] ?? '';
    if (etiqueta === previa) continue;
    previa = etiqueta;
    if ((ETIQUETAS as readonly string[]).includes(etiqueta) && mapa[etiqueta as Etiqueta] === undefined) {
      mapa[etiqueta as Etiqueta] = i;
    }
  }
  return mapa;
}

/** ¿Es la fila de encabezado del reporte? (Codigo + Descripcion + Existencia) */
function esEncabezado(celdas: string[]): boolean {
  const limpias = celdas.map((c) => c.trim());
  return (
    limpias.includes('Codigo')
    && limpias.some((c) => c.startsWith('Descripcion'))
    && limpias.includes('Existencia')
  );
}

/**
 * Etiquetas del encabezado EN ORDEN (una entrada por grupo fusionado): es el
 * orden contra el que se calibran las corridas de los datos.
 */
export function ordenDeEncabezado(celdas: string[]): Etiqueta[] {
  const orden: Etiqueta[] = [];
  let previa = '';
  for (const cruda of celdas) {
    const etiqueta = cruda.trim();
    if (etiqueta === previa) continue;
    previa = etiqueta;
    if ((ETIQUETAS as readonly string[]).includes(etiqueta)) orden.push(etiqueta as Etiqueta);
  }
  return orden;
}

/** Prefijos de la portada / filtros del ERP: jamás son productos. */
const PREFIJOS_PORTADA = [
  'AUTO SERVICIO',
  'REPORTE LISTA',
  'REPORTE DE INVENTARIO',
  'Dirección',
  'Direccion',
  'Fecha :',
  'Hora :',
  'Nivel ',
  'Producto:',
  'Familia :',
  'Familia:',
  'Marca:',
  'Clase:',
  'Depósito :',
  'Deposito :',
  'Estatus',
  'Ordenado Por',
  'Tipo de Precio',
  'No. de Registros',
  'Pag.',
];

/** ¿Fila de basura del ERP (portada, filtro, pie o detalle de depósito)? */
function esBasura(primera: string): boolean {
  const t = primera.trim();
  if (!t) return true;
  if (/^deposito\b/i.test(t)) return true; // «Deposito», «DEPOSITO PRINCIPAL»
  return PREFIJOS_PORTADA.some((p) => t.startsWith(p));
}

export interface ParseListaPreciosXlsxResult {
  filas: FilaInventario[];
  /** Filas descartadas con motivo (basura no producto, ilegibles, trampa). */
  problemas: string[];
  /** Bloques de encabezado encontrados (el 2007 traía 5; Gabriel 1). */
  bloquesEncabezado: number;
  /** Filas de basura filtradas (portada, depósitos, pies, vacías). */
  filasBasura: number;
  /** Filas-trampa del ERP descartadas (COMPRAS GRAVABLES / EXENTAS). */
  descartadasResumen: number;
}

/**
 * Parsea el «REPORTE LISTA DE PRECIOS» en Excel. Devuelve las filas listas
 * para el modo «actualizar» (deduplicadas por código: si el ERP repitiera un
 * código gana la ÚLTIMA aparición, igual que los parsers del PDF) más el
 * detalle de lo filtrado.
 */
export function parseListaPreciosXlsx(datos: Uint8Array | ArrayBuffer): ParseListaPreciosXlsxResult {
  const wb = XLSX.read(datos, { type: 'array' });
  const nombreHoja = wb.SheetNames[0];
  const hoja = nombreHoja !== undefined ? wb.Sheets[nombreHoja] : undefined;
  if (!hoja) {
    return { filas: [], problemas: ['El archivo no tiene hojas legibles.'], bloquesEncabezado: 0, filasBasura: 0, descartadasResumen: 0 };
  }
  const matriz = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: '' });

  const filas: FilaInventario[] = [];
  const problemas: string[] = [];
  const porCodigo = new Map<string, FilaInventario>();
  let bloques = 0;
  let basura = 0;
  let descartadas = 0;

  // Estado del bloque VIGENTE: cada encabezado recalcula orden, anclas y
  // calibración (el reporte puede cambiar el ancho de los grupos por bloque).
  let camposOrden: Etiqueta[] = [];
  let anclas: MapaColumnas = {};
  // Columnas ABSOLUTAS calibradas con la 1ª fila de datos bien formada.
  let calibracion: MapaColumnas | null = null;

  for (const cruda of matriz) {
    const celdas = (cruda ?? []).map((c) => textoPlano(c));
    if (esEncabezado(celdas)) {
      bloques += 1;
      camposOrden = ordenDeEncabezado(celdas);
      anclas = mapaDeEncabezado(celdas);
      calibracion = null;
      continue;
    }

    const corridas = corridasDe(cruda ?? []);
    const primera = corridas[0]?.valor ?? '';
    if (esBasura(primera)) {
      if (primera) basura += 1;
      continue;
    }
    if (!camposOrden.length) {
      // Filas con contenido antes del primer encabezado (portada rara): basura.
      if (primera) basura += 1;
      continue;
    }

    // ── Calibración: la 1ª fila de datos del bloque con EXACTAMENTE tantas
    //    corridas como campos fija la columna absoluta de cada campo. ──
    if (corridas.length === camposOrden.length) {
      const nueva: MapaColumnas = {};
      camposOrden.forEach((etiqueta, i) => {
        nueva[etiqueta] = corridas[i]!.desde;
      });
      calibracion = nueva;
    }

    // Lectura del código y la descripción: calibración > corridas por orden >
    // anclas del encabezado.
    let codigo = '';
    let descripcion = '';
    let colExistencia: number | undefined;
    let colRefCi: number | undefined;
    if (calibracion) {
      codigo = calibracion.Codigo !== undefined ? (celdas[calibracion.Codigo] ?? '') : (corridas[0]?.valor ?? '');
      descripcion = calibracion.Descripcion !== undefined ? (celdas[calibracion.Descripcion] ?? '') : (corridas[1]?.valor ?? '');
      colExistencia = calibracion.Existencia;
      colRefCi = calibracion['Precio REF c/Imp'];
    } else if (corridas.length === camposOrden.length) {
      camposOrden.forEach((etiqueta, i) => {
        const v = corridas[i]!.valor;
        if (etiqueta === 'Codigo') codigo = v;
        else if (etiqueta === 'Descripcion') descripcion = v;
        else if (etiqueta === 'Existencia') colExistencia = corridas[i]!.desde;
        else if (etiqueta === 'Precio REF c/Imp') colRefCi = corridas[i]!.desde;
      });
    } else {
      codigo = anclas.Codigo !== undefined ? (celdas[anclas.Codigo] ?? '') : (corridas[0]?.valor ?? '');
      descripcion = anclas.Descripcion !== undefined ? (celdas[anclas.Descripcion] ?? '') : (corridas[1]?.valor ?? '');
      colExistencia = anclas.Existencia;
      colRefCi = anclas['Precio REF c/Imp'];
    }

    codigo = codigo.trim().toUpperCase();
    if (!codigo) {
      basura += 1;
      continue;
    }
    if (!descripcion) descripcion = primera;

    // FILA-TRAMPA del ERP (decisión del dueño, 5.151): resúmenes internos,
    // no son productos. Se descartan SIEMPRE y quedan contadas.
    if (FILAS_TRAMPA.has(normalizarDesc(descripcion))) {
      descartadas += 1;
      problemas.push(`Fila de resumen del ERP descartada (no es producto): ${codigo} · ${descripcion.slice(0, 40)}`);
      continue;
    }

    const existencia = colExistencia !== undefined ? numeroDeCelda((cruda ?? [])[colExistencia]) : NaN;
    if (!Number.isFinite(existencia)) {
      problemas.push(`Existencia ilegible, fila descartada (no se toca nada): ${codigo} · ${descripcion.slice(0, 40)}`);
      continue;
    }

    // Precio REF c/Imp: la única columna fiable del precio FINAL (con IVA).
    // Ilegible/ausente → undefined: el modo «actualizar» la trata con la
    // Regla 3 (precio 0: no se toca el precio del existente; el nuevo nace
    // inactivo con precio 0 para que el dueño lo complete).
    const precioCrudo = colRefCi !== undefined ? numeroDeCelda((cruda ?? [])[colRefCi]) : NaN;

    const fila: FilaInventario = {
      codigo,
      descripcion,
      existencia: Math.max(0, Math.trunc(existencia)),
      costo: Number.isFinite(precioCrudo) ? precioCrudo : 0,
      precioConImp: Number.isFinite(precioCrudo) ? precioCrudo : undefined,
    };

    // Deduplicación (igual que los parsers del PDF: gana la ÚLTIMA).
    if (porCodigo.has(codigo)) {
      problemas.push(`Código repetido en el archivo (gana la última aparición): ${codigo}`);
      const previaFila = porCodigo.get(codigo)!;
      const idx = filas.indexOf(previaFila);
      if (idx >= 0) filas.splice(idx, 1);
    }
    porCodigo.set(codigo, fila);
    filas.push(fila);
  }

  return { filas, problemas, bloquesEncabezado: bloques, filasBasura: basura, descartadasResumen: descartadas };
}
