/**
 * SPOT 24 · Parser del reporte «REPORTE DE INVENTARIO DISPONIBLE» del POS
 * (5.87, a pedido del dueño: importar el PDF desde el panel).
 *
 * El PDF es una tabla de layout FIJO: cada página repite una cabecera
 * (Codigo | Descripcion | Existencia | Pedidos | Disponible | Costo |
 * Costo Total) y cada producto es una fila con TODOS los valores ya en su
 * columna. El texto plano del PDF CONCATENA código+descripción sin
 * separador («10500060ALINTERNA…»), así que la extracción fiable se hace
 * POR COORDENADAS: se toman los items de texto de pdfjs (str + x + y),
 * se agrupan en filas por Y y se reparte cada item a su columna según los
 * X de las cabeceras de ESA página (los límites son los puntos medios
 * entre el inicio de cada etiqueta).
 *
 * Este módulo es PURO (sin imports): así lo testea el frontend con vitest
 * (src/tests/inventario-pdf.test.ts) y lo usa el core de importación.
 *
 * Mapeo que pidió el dueño: nombre ← Descripcion · código ← Codigo ·
 * precio ← Costo (USD) · stock ← Existencia. Entre páginas el parser
 * conserva el hilo (una descripción puede envolver al pie de página).
 */

/** Item de texto del PDF, ya filtrado (sin vacíos) y redondeado a 0.1 px. */
export interface InvItem {
  /** Texto del item. */
  s: string;
  /** X del inicio del texto (px del layout del reporte). */
  x: number;
  /** Y del renglón (mayor = más arriba en la página). */
  y: number;
  /** Ancho renderizado (informativo). */
  w: number;
}

/** Una línea del inventario lista para importar. */
export interface FilaInventario {
  /** Código del POS (mayúsculas); único tras deduplicar. */
  codigo: string;
  /** Descripción completa (incluye los renglones envueltos). */
  descripcion: string;
  /** Existencia redondeada a unidades. */
  existencia: number;
  /** Costo en USD (2 decimales) — el dueño lo usa como precio. */
  costo: number;
}

export interface ParseInventarioResult {
  filas: FilaInventario[];
  /** Filas descartadas con motivo (código sin costo, ilegibles…). */
  problemas: string[];
}

/** Etiquetas de cabecera que anclan las columnas, EN ORDEN de X. */
const ANCLAS = [
  'Codigo',
  'Descripcion',
  'Existencia',
  'Pedidos',
  'Disponible',
  'Costo',
  'Costo Total',
] as const;

/** Tolerancia de agrupación por Y (px): los renglones del reporte distan ≥ 5 px. */
const TOL_Y = 3;

/** Tope defensivo del nombre (el panel guarda name con 120). */
const MAX_NOMBRE = 120;
/** Tope defensivo del código (el panel guarda code/sku con 40). */
const MAX_CODIGO = 40;

/** Agrupa items en renglones (Y) y ordena cada renglón por X. */
export function filasDeItems(items: InvItem[]): InvItem[][] {
  const orden = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: InvItem[][] = [];
  for (const it of orden) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && Math.abs(ultimo[0]!.y - it.y) <= TOL_Y) ultimo.push(it);
    else grupos.push([it]);
  }
  return grupos.map((g) => [...g].sort((a, b) => a.x - b.x));
}

/**
 * Límites de columnas a partir de la fila de cabecera: punto medio entre el
 * inicio de cada etiqueta consecutiva (las cabeceras se repiten en TODAS
 * las páginas del reporte y el generador es el mismo → estable).
 * Devuelve null si la fila no es una cabecera reconocible.
 */
export function limitesDeCabecera(fila: InvItem[]): number[] | null {
  const xs: Array<number | undefined> = ANCLAS.map(() => undefined);
  for (const it of fila) {
    const i = ANCLAS.findIndex((a) => it.s === a);
    if (i >= 0 && xs[i] === undefined) xs[i] = it.x;
  }
  if (xs.some((v) => v === undefined)) return null;
  const limites: number[] = [];
  for (let i = 0; i < ANCLAS.length - 1; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    limites.push((a + b) / 2);
  }
  limites.push(Number.POSITIVE_INFINITY);
  return limites;
}

function colDe(x: number, limites: number[]): number {
  for (let i = 0; i < limites.length; i++) {
    if (x < limites[i]!) return i;
  }
  return limites.length - 1;
}

/**
 * Número «a la venezolana» del reporte: admite «61.19», «1,234.56» y
 * «1.234,56». Si hay punto Y coma, el ÚLTIMO es el separador decimal.
 * Devuelve NaN si no es un número limpio (letras, paréntesis…).
 */
export function numeroVe(s: string): number {
  const t = s.trim().replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(t)) return NaN;
  const tieneC = t.includes(',');
  const tieneD = t.includes('.');
  let out = t;
  if (tieneC && tieneD) {
    const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.';
    out = dec === ',' ? t.replace(/\./g, '').replace(/,/g, '.') : t.replace(/,/g, '');
  } else if (tieneC && /,\d{2}$/.test(t)) {
    out = t.replace(/,/g, '.');
  } else if (tieneC) {
    out = t.replace(/,/g, '');
  }
  const n = Number(out);
  return Number.isFinite(n) ? n : NaN;
}

const RE_CODIGO = /^[0-9][A-Z0-9./-]{1,}$/; // «021400059245», «05K650MV», «10500060A»
const RE_NUM_LIMPIO = /^\d[\d.,]*$/;

/**
 * Parsea TODAS las páginas del reporte y devuelve las filas listas para
 * importar (deduplicadas por código: si el POS repitiera un código, gana
 * la última aparición) + la lista de problemas (filas descartadas).
 */
export function parseInventario(paginas: InvItem[][]): ParseInventarioResult {
  const filas: FilaInventario[] = [];
  const porCodigo = new Map<string, FilaInventario>();
  const problemas: string[] = [];
  let limites: number[] | null = null;
  let ultimo = -1; // índice de la última fila insertada (continuación de desc.)

  const celda = (items: InvItem[]): string => items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();

  for (const items of paginas) {
    for (const fila of filasDeItems(items)) {
      const cab = limitesDeCabecera(fila);
      if (cab) {
        limites = cab;
        continue;
      }
      if (!limites) continue; // antes de la primera cabecera (membrete)

      const celdas: InvItem[][] = Array.from({ length: ANCLAS.length }, () => []);
      for (const it of fila) celdas[colDe(it.x, limites)]!.push(it);

      const codigo = celdas[0]!.length ? celda(celdas[0]!).toUpperCase() : '';
      const desc = celdas[1]!.length ? celda(celdas[1]!) : '';
      const existTxt = celdas[2]!.filter((i) => RE_NUM_LIMPIO.test(i.s.trim()));
      const costoTxt = celdas[5]!.filter((i) => RE_NUM_LIMPIO.test(i.s.trim()));

      if (codigo) {
        if (!RE_CODIGO.test(codigo)) continue; // membrete, «Fecha :…», nº de página
        if (porCodigo.has(codigo)) {
          // El POS no debería repetir, pero si repite gana la última: se
          // reemplaza en el MISMO lugar para no perder el orden.
          const existencia = existTxt[0] !== undefined ? numeroVe(existTxt[0].s) : NaN;
          const costo = costoTxt[0] !== undefined ? numeroVe(costoTxt[0].s) : NaN;
          const previa = porCodigo.get(codigo)!;
          if (!Number.isFinite(existencia) || !Number.isFinite(costo)) {
            problemas.push(`${codigo}: valores ilegibles, se conserva la primera aparición.`);
            continue;
          }
          previa.descripcion = desc.slice(0, MAX_NOMBRE);
          previa.existencia = Math.max(0, Math.round(existencia));
          previa.costo = Math.round(costo * 100) / 100;
          ultimo = filas.indexOf(previa);
          continue;
        }
        if (desc.length < 3) {
          problemas.push(`${codigo}: sin descripción legible, se omitió.`);
          continue;
        }
        const existencia = existTxt[0] !== undefined ? numeroVe(existTxt[0].s) : NaN;
        const costo = costoTxt[0] !== undefined ? numeroVe(costoTxt[0].s) : NaN;
        if (!Number.isFinite(existencia) || !Number.isFinite(costo)) {
          problemas.push(`${codigo}: existencia o costo ilegibles, se omitió.`);
          continue;
        }
        const nueva: FilaInventario = {
          codigo: codigo.slice(0, MAX_CODIGO),
          descripcion: desc.slice(0, MAX_NOMBRE),
          existencia: Math.max(0, Math.round(existencia)),
          costo: Math.round(costo * 100) / 100,
        };
        filas.push(nueva);
        porCodigo.set(codigo, nueva);
        ultimo = filas.length - 1;
        continue;
      }

      // Fila sin código: si hay texto de descripción y un producto abierto,
      // es un renglón envuelto de la descripción («…RETORNABLE 350» + «M»).
      if (ultimo >= 0 && desc && !desc.startsWith('Completa') && !desc.startsWith('REPORTE')) {
        const actual = filas[ultimo]!;
        if (actual.descripcion.length < MAX_NOMBRE) {
          actual.descripcion = `${actual.descripcion} ${desc}`.slice(0, MAX_NOMBRE).replace(/\s+/g, ' ').trim();
        }
      }
    }
  }
  return { filas, problemas };
}
