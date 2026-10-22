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

/* ── 5.92 · Formato «lista limpia» (la segunda lista del dueño) ──
 *
 * El dueño también importa listas aparte del POS («ACCESORIOS — LISTA
 * LIMPIA», generadas fuera del sistema): tabla con cabecera en VARIOS
 * renglones (Código | Descripción | Existencia (unidades) | «Precio USD
 * sin»+«impuesto» | «Precio USD con»+«impuesto»), precios con «$» y
 * códigos alfanuméricos que pueden empezar con LETRA (CE0501, DM1202,
 * WT4RUNNE). Probado extremo a extremo con SU PDF real (72/72 filas).
 *
 * Diferencias con el POS que este parser tolera:
 * · Cabecera multi-renglón: se detecta la fila ancla que trae «Código»+
 *   «Descripción» y los 5 anclas se buscan en una VENTANA de ±10 px.
 * · Límites de columna: punto medio entre el FIN de la etiqueta anterior
 *   y el INICIO de la siguiente (los precios van alineados a la derecha:
 *   con el medio-por-inicios del POS el «$90.00» sin impuesto caería en
 *   la columna del precio CON impuesto).
 * · «$» y «und.» en las celdas de precio y existencia.
 * · Códigos repetidos: la lista trae productos DISTINTOS que comparten
 *   código (el sistema origen corta los códigos a 8-9 letras: FORROSINT
 *   ×7). Decisión del dueño (Opción A): en vez de perder filas, la
 *   repetida queda con sufijo secuencial (FORROSINT-2, FORROSINT-3…)
 *   y aviso visible en el resultado de la importación.
 * · El precio que manda es el SIN impuesto (decisión del dueño): la
 *   columna «con impuesto» se ignora.
 */

/** Anclas del formato lista limpia (etiqueta, longitud máxima del item). */
const ANCLAS_LISTA: Array<{ re: RegExp; maxLen: number }> = [
  { re: /^C[oó]digo$/i, maxLen: 20 },
  { re: /^Descripci[oó]n$/i, maxLen: 20 },
  { re: /Existencia/i, maxLen: 40 },
  { re: /Precio USD sin/i, maxLen: 20 },
  { re: /Precio USD con/i, maxLen: 20 },
];

/** Códigos de la lista limpia: dígito o LETRA inicial («CE0501», «317»). */
const RE_CODIGO_LISTA = /^[A-Z0-9][A-Z0-9./-]{1,}$/;

/** Primer número de un texto («4 und.» → 4 · «$90.00» → 90). */
function primerNumero(t: string): number {
  const m = t.match(/(\d[\d.,]*)/);
  return m ? numeroVe(m[1]!) : NaN;
}

/**
 * Parsea el formato «lista limpia». Misma salida que parseInventario
 * (filas + problemas) para que la importación no distinga formatos.
 */
export function parseListaLimpia(paginas: InvItem[][]): ParseInventarioResult {
  const filas: FilaInventario[] = [];
  const problemas: string[] = [];
  const porCodigo = new Map<string, FilaInventario>();
  let limites: number[] | null = null;
  let ultimo = -1;

  const celda = (items: InvItem[]): string => items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();

  for (const items of paginas) {
    const filasPagina = filasDeItems(items);
    const esCabecera = new Set<number>();

    // 1) Detección de cabecera (multi-renglón): fila ancla = la que trae
    //    «Código» y «Descripción»; ventana ±10 px para las etiquetas
    //    partidas («Precio USD sin» arriba, «impuesto» abajo).
    for (let fi = 0; fi < filasPagina.length; fi++) {
      const fila = filasPagina[fi]!;
      if (!fila.some((i) => /^C[oó]digo$/i.test(i.s) && i.s.length <= 20)) continue;
      if (!fila.some((i) => /^Descripci[oó]n$/i.test(i.s) && i.s.length <= 20)) continue;
      const yAncla = fila[0]!.y;
      const zona: InvItem[] = [...fila];
      filasPagina.forEach((f, idx) => {
        if (idx !== fi && Math.abs(f[0]!.y - yAncla) <= 10) {
          zona.push(...f);
          esCabecera.add(idx);
        }
      });
      const xs: Array<{ inicio: number; fin: number } | undefined> = ANCLAS_LISTA.map(() => undefined);
      for (const it of zona) {
        ANCLAS_LISTA.forEach((ancla, i) => {
          if (xs[i] === undefined && ancla.re.test(it.s) && it.s.length <= ancla.maxLen) {
            xs[i] = { inicio: it.x, fin: it.x + (it.w > 0 ? it.w : it.s.length * 5.5) };
          }
        });
      }
      if (xs.some((v) => v === undefined)) continue;
      limites = [];
      for (let i = 0; i < xs.length - 1; i++) {
        limites.push((xs[i]!.fin + xs[i + 1]!.inicio) / 2);
      }
      limites.push(Number.POSITIVE_INFINITY);
      esCabecera.add(fi);
    }
    if (!limites) continue;

    // 2) Filas de datos.
    for (let fi = 0; fi < filasPagina.length; fi++) {
      if (esCabecera.has(fi)) continue;
      const fila = filasPagina[fi]!;
      const celdas: InvItem[][] = Array.from({ length: ANCLAS_LISTA.length }, () => []);
      for (const it of fila) {
        let col = ANCLAS_LISTA.length - 1;
        for (let i = 0; i < limites.length; i++) {
          if (it.x < limites[i]!) {
            col = i;
            break;
          }
        }
        celdas[col]!.push(it);
      }

      const codigo = celda(celdas[0]!).replace(/\s+/g, '').toUpperCase();
      const desc = celda(celdas[1]!);
      if (!codigo) {
        // Renglón envuelto de descripción (sin código a la izquierda).
        if (ultimo >= 0 && desc && !desc.startsWith('Precios en USD')) {
          const actual = filas[ultimo]!;
          if (actual.descripcion.length < MAX_NOMBRE) {
            actual.descripcion = `${actual.descripcion} ${desc}`.slice(0, MAX_NOMBRE).replace(/\s+/g, ' ').trim();
          }
        }
        continue;
      }
      // Membrete/nota/nº de página se descartan en silencio (igual que el
      // POS): códigos imposibles (> 40 chars) o con aspecto de texto.
      if (codigo.length > MAX_CODIGO || !RE_CODIGO_LISTA.test(codigo)) continue;

      const existencia = primerNumero(celda(celdas[2]!));
      // El precio que manda: el SIN impuesto (col 3); el «con impuesto»
      // (col 4) se ignora por decisión del dueño.
      const precioSin = primerNumero(celda(celdas[3]!));
      if (!Number.isFinite(existencia) || !Number.isFinite(precioSin)) {
        problemas.push(`${codigo}: existencia o precio sin impuesto ilegibles, se omitió.`);
        ultimo = -1;
        continue;
      }
      if (desc.length < 3) {
        problemas.push(`${codigo}: sin descripción legible, se omitió.`);
        ultimo = -1;
        continue;
      }

      // Opción A del dueño: los códigos repetidos NO se pierden — quedan
      // con sufijo secuencial (-2, -3…) hasta uno libre, con aviso.
      let codigoFinal = codigo.slice(0, MAX_CODIGO);
      if (porCodigo.has(codigoFinal)) {
        let n = 2;
        codigoFinal = `${codigo.slice(0, MAX_CODIGO - 2)}-2`;
        while (porCodigo.has(codigoFinal)) {
          n += 1;
          codigoFinal = `${codigo.slice(0, MAX_CODIGO - 1 - String(n).length)}-${n}`;
        }
        problemas.push(`${codigo}: código repetido en la lista, esta fila quedó con el código ${codigoFinal}.`);
      }

      const nueva: FilaInventario = {
        codigo: codigoFinal,
        descripcion: desc.slice(0, MAX_NOMBRE),
        existencia: Math.max(0, Math.round(existencia)),
        costo: Math.round(precioSin * 100) / 100,
      };
      filas.push(nueva);
      porCodigo.set(codigoFinal, nueva);
      ultimo = filas.length - 1;
    }
  }
  return { filas, problemas };
}

/* ── 5.92 · Detección automática de formato ── */

export type FormatoInventario = 'pos' | 'lista-limpia';

export interface ParseInventarioConFormato extends ParseInventarioResult {
  /** Formato detectado: «pos» = reporte del POS · «lista-limpia» = doble precio. */
  formato: FormatoInventario;
}

/**
 * Prueba primero el reporte del POS (cabecera exacta de 7 columnas) y si
 * no reconoce nada, el formato «lista limpia». Los formatos no se confunden
 * entre sí: cada cabecera es excluyente de la otra.
 */
export function parseInventarioAuto(paginas: InvItem[][]): ParseInventarioConFormato {
  const pos = parseInventario(paginas);
  if (pos.filas.length) return { ...pos, formato: 'pos' };
  const lista = parseListaLimpia(paginas);
  if (lista.filas.length) return { ...lista, formato: 'lista-limpia' };
  // Ninguno reconoció filas: se devuelve el del POS con sus problemas
  // (es el formato original y sus diagnósticos son más informativos).
  return { ...pos, formato: 'pos' };
}
