/**
 * SPOT 24 · Ronda 5.105 · Exportar el inventario a PDF desde el panel.
 * El dueño pidió: nombre, marca, código, categoría/subcategoría, estado,
 * precio (SOLO USD), stock, descripción y ENLACE de foto — completo y por
 * categorías (todas o las que necesite). Tamaño CARTA (letter) horizontal.
 *
 * Dos mitades:
 * · PURA (testeada en src/tests/exportar-inventario.test.ts): preparar las
 *   filas filtradas/ordenadas/agrupadas con subtotales, el árbol de
 *   selección (alternarRama) y el nombre del archivo. Sin jsPDF.
 * · GENERADOR (crearDocumentoPdf): jsPDF + jspdf-autotable importados en
 *   DIFERIDO (chunk aparte: la tienda no paga ese peso) y devuelve el doc
 *   para que la UI llame .save(). Texto puro: funciona igual en Node,
 *   por eso hay smoke test de páginas. El PDF SIEMPRE sale con los datos
 *   que el panel acaba de leer (guardar → exportar = dato nuevo).
 * Sin backend: usa la lista ya cargada por adminListProducts (0 lecturas).
 */
import type { Product } from '@/features/catalog/types';
import type { CategoryDef } from '@/shared/constants/categories';
/** Solo TIPO (se borra al compilar): no arrastra el chunk de jsPDF a la tienda. */
import type { jsPDF } from 'jspdf';

/** Una fila de la tabla del PDF (una por producto — «tabla limpia»). */
export interface FilaInventario {
  codigo: string;
  nombre: string;
  marca: string;
  /** «Repuestos / Accesorios Importados» (padre / sub) o solo la principal. */
  categoria: string;
  estado: 'Activo' | 'Inactivo';
  precioUsd: number;
  stock: number;
  descripcion: string;
  /** Portada (images[0]) o '' si no tiene. */
  foto: string;
}

/** Subtotal por categoría principal (al cierre de cada grupo). */
export interface SubtotalCategoria {
  categoria: string;
  productos: number;
  stock: number;
  valorUsd: number;
}

export interface InventarioListo {
  filas: FilaInventario[];
  subtotales: SubtotalCategoria[];
  /** Nombres de categorías incluidas, para el encabezado del PDF. */
  categoriasIncluidas: string[];
  soloActivos: boolean;
  totalProductos: number;
  stockTotal: number;
  valorUsdTotal: number;
}

/** $1,234.56 — convención US para USD, determinista en cualquier runtime. */
export function usd(n: number): string {
  const neg = n < 0;
  const fijo = Math.abs(Math.round((n + Number.EPSILON) * 100)).toString();
  const entero = fijo.slice(0, -2) || '0';
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}$${miles}.${fijo.slice(-2).padStart(2, '0')}`;
}

/** inventario-spot24-2026-10-26.pdf (fecha LOCAL de generación). */
export function nombreArchivoInventario(fecha: Date): string {
  const d = String(fecha.getDate()).padStart(2, '0');
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  return `inventario-spot24-${fecha.getFullYear()}-${m}-${d}.pdf`;
}

/** Comparador A-Z estable y sin depender de ICU: sin acentos, minúsculas. */
function az(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/**
 * Recorta el TEXTO mostrado de una URL a `max` caracteres (con «…»). El
 * ENLACE sigue siendo la URL completa: en el PDF la celda entera es la zona
 * clickeable. Necesario porque una URL no tiene espacios y no puede
 * envolverse — sin esto, una URL larga desborda la columna y rompe la tabla
 * (detectado con la muestra real de 789 productos: «10 units could not fit»).
 */
export function acortarUrl(s: string, max = 44): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Ids que quedan marcados al PULSAR la casilla de una categoría principal:
 * si falta POR LO MENOS uno de la rama (principal + subs) se marca TODA la
 * rama; si ya está completa, se desmarca completa. (Comportamiento de árbol
 * estándar; las casillas de subs siguen siendo libres.)
 */
export function alternarRama(
  categorias: CategoryDef[],
  marcados: ReadonlySet<string>,
  principalId: string,
): Set<string> {
  const rama = [principalId,
    ...categorias.filter((c) => c.parentId === principalId).map((c) => c.id)];
  const completa = rama.every((id) => marcados.has(id));
  const out = new Set(marcados);
  for (const id of rama) {
    if (completa) out.delete(id);
    else out.add(id);
  }
  return out;
}

/** true si la rama (principal + subs) está COMPLETA en el conjunto. */
export function ramaCompleta(
  categorias: CategoryDef[],
  marcados: ReadonlySet<string>,
  principalId: string,
): boolean {
  return [principalId,
    ...categorias.filter((c) => c.parentId === principalId).map((c) => c.id)]
    .every((id) => marcados.has(id));
}

/**
 * Prepara TODO lo que el PDF necesita, en el orden en que se imprime:
 * grupos por categoría PRINCIPAL (el orden del árbol del admin; dentro,
 * subs A-Z y productos A-Z), subtotal al cierre de cada grupo y totales
 * generales. Filtra por selección exacta de categoryId (la UI marca ramas
 * con alternarRama) y por estado.
 */
export function prepararInventario(
  productos: Product[],
  categorias: CategoryDef[],
  seleccion: ReadonlySet<string>,
  incluirInactivos: boolean,
): InventarioListo {
  const porId = new Map(categorias.map((c) => [c.id, c]));
  const ordenPrincipal = new Map<string, number>(); // id principal → posición del árbol
  categorias.forEach((c, i) => {
    if (!c.parentId && !ordenPrincipal.has(c.id)) ordenPrincipal.set(c.id, i);
  });

  const etiqueta = (p: Product): string => {
    const c = porId.get(p.categoryId);
    if (!c) return 'Sin categoría';
    return c.parentId
      ? `${porId.get(c.parentId)?.name ?? 'Sin categoría'} / ${c.name}`
      : c.name;
  };
  const principalDe = (p: Product): string => {
    const c = porId.get(p.categoryId);
    if (!c) return '?'; // grupo «Sin categoría» siempre al final
    return c.parentId ?? c.id;
  };

  const seleccionados = productos.filter((p) => {
    if (!seleccion.has(p.categoryId)) return false;
    return incluirInactivos || p.active;
  });

  // Orden de grupos: el del árbol del admin (creación); «?» (sin categoría) al final.
  const grupos = [...new Set(seleccionados.map(principalDe))].sort((a, b) => {
    const ia = ordenPrincipal.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = ordenPrincipal.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib;
  });

  const filas: FilaInventario[] = [];
  const subtotales: SubtotalCategoria[] = [];
  for (const g of grupos) {
    const delGrupo = seleccionados
      .filter((p) => principalDe(p) === g)
      .sort((a, b) => {
        // dentro del grupo: sub (nombre) y luego producto (nombre), A-Z
        const ca = az(etiqueta(a));
        const cb = az(etiqueta(b));
        if (ca !== cb) return ca < cb ? -1 : 1;
        const na = az(a.name);
        const nb = az(b.name);
        if (na !== nb) return na < nb ? -1 : 1;
        return a.id < b.id ? -1 : 1; // desempate estable
      });
    let stockGrupo = 0;
    let valorGrupo = 0;
    for (const p of delGrupo) {
      filas.push({
        codigo: p.code || '—',
        nombre: p.name,
        marca: p.brand || '—',
        categoria: etiqueta(p),
        estado: p.active ? 'Activo' : 'Inactivo',
        precioUsd: p.basePriceUsd,
        stock: p.stockTotal,
        descripcion: p.description || '',
        foto: p.images[0] ?? '',
      });
      stockGrupo += p.stockTotal;
      valorGrupo += p.basePriceUsd * p.stockTotal;
    }
    subtotales.push({
      categoria: g === '?' ? 'Sin categoría' : porId.get(g)?.name ?? 'Sin categoría',
      productos: delGrupo.length,
      stock: stockGrupo,
      valorUsd: Math.round(valorGrupo * 100) / 100,
    });
  }

  const stockTotal = filas.reduce((a, f) => a + f.stock, 0);
  const valorUsdTotal =
    Math.round(subtotales.reduce((a, s) => a + s.valorUsd, 0) * 100) / 100;
  const categoriasIncluidas = [...new Set(filas.map((f) => f.categoria))].sort();

  return {
    filas,
    subtotales,
    categoriasIncluidas,
    soloActivos: !incluirInactivos,
    totalProductos: filas.length,
    stockTotal,
    valorUsdTotal,
  };
}

/* ── Generador (jsPDF en diferido — chunk aparte) ── */

const TOTAL_PAGINAS = '{total_paginas_spot24}';

/** Columnas del cuerpo del PDF (orden fijo; se dibujan con autotable). */
function filaTabla(f: FilaInventario): string[] {
  return [
    f.codigo,
    f.nombre,
    f.marca,
    f.categoria,
    f.estado,
    usd(f.precioUsd),
    String(f.stock),
    f.descripcion,
    f.foto ? acortarUrl(f.foto, 44) : '—',
  ];
}

/**
 * Arma el PDF CARTA horizontal listo para .save(). jsPDF y autotable se
 * importan aquí adentro: mientras el dueño no exporte, ese chunk no baja.
 */
export async function crearDocumentoPdf(datos: InventarioListo): Promise<jsPDF> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth(); // 792 pt

  // ── Encabezado (página 1): título + momento + filtros + totales ──
  const f = new Date();
  const dd = String(f.getDate()).padStart(2, '0');
  const mm = String(f.getMonth() + 1).padStart(2, '0');
  const hh = String(f.getHours()).padStart(2, '0');
  const mi = String(f.getMinutes()).padStart(2, '0');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text('INVENTARIO SPOT 24', 32, 40);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90);
  doc.text(
    `Generado el ${dd}/${mm}/${f.getFullYear()} a las ${hh}:${mi}`
      + ` · Estado: ${datos.soloActivos ? 'solo activos' : 'todos (activos e inactivos)'}`
      + ` · ${datos.totalProductos} productos · stock ${datos.stockTotal}`
      + ` · valor ${usd(datos.valorUsdTotal)}`,
    32, 55,
  );
  const cats = datos.categoriasIncluidas;
  const listaCats = cats.length <= 4
    ? cats.join(' · ')
    : `${cats.slice(0, 4).join(' · ')} y ${cats.length - 4} más`;
  doc.text(`Categorías: ${listaCats || '—'}`, 32, 68);
  doc.setTextColor(0);

  // ── Cuerpo: filas de producto + fila de SUBTOTAL al cierre de cada grupo ──
  // Mapa «categoría principal» → su subtotal (mismo orden que los grupos).
  const subtotalDe = new Map(datos.subtotales.map((s) => [s.categoria, s]));
  const indiceUltimoPorGrupo = new Map<string, number>();
  datos.filas.forEach((fila, i) => {
    const grupo = fila.categoria.split(' / ')[0] ?? fila.categoria;
    indiceUltimoPorGrupo.set(grupo, i);
  });

  const cuerpo: string[][] = [];
  const esSubtotal: boolean[] = []; // índice = índice de fila del cuerpo
  const estadoDeFila: Array<'Activo' | 'Inactivo' | null> = [];
  const urlDeFila: string[] = []; // enlace clickeable de la columna Foto

  datos.filas.forEach((fila, i) => {
    cuerpo.push(filaTabla(fila));
    esSubtotal.push(false);
    estadoDeFila.push(fila.estado);
    urlDeFila.push(fila.foto);
    const grupo = fila.categoria.split(' / ')[0] ?? fila.categoria;
    if (indiceUltimoPorGrupo.get(grupo) === i) {
      const s = subtotalDe.get(grupo);
      if (s) {
        cuerpo.push([
          '', `Subtotal ${grupo} — ${s.productos} producto(s)`, '', '',
          '', usd(s.valorUsd), String(s.stock), 'valor del inventario', '',
        ]);
        esSubtotal.push(true);
        estadoDeFila.push(null);
        urlDeFila.push('');
      }
    }
  });

  autoTable(doc, {
    startY: 80,
    margin: { left: 32, right: 32, top: 40, bottom: 36 },
    // Una fila NUNCA se corta entre páginas: el producto pasa entero a la
    // siguiente (la muestra real cortaba «CO-PILOTO MERU, PRADO» a la mitad).
    rowPageBreak: 'avoid',
    head: [[
      'Código', 'Nombre', 'Marca', 'Categoría / Sub', 'Estado',
      'Precio USD', 'Stock', 'Descripción', 'Foto (enlace)',
    ]],
    body: cuerpo,
    styles: {
      font: 'helvetica', fontSize: 7, cellPadding: 3.5,
      overflow: 'linebreak', lineColor: [225, 225, 225], lineWidth: 0.5,
      textColor: [25, 25, 25], valign: 'top',
    },
    headStyles: {
      fillColor: [20, 20, 20], textColor: [255, 255, 255],
      fontStyle: 'bold', fontSize: 7.5,
    },
    columnStyles: {
      // Total 728 pt = carta horizontal (792) − márgenes (2×32). La suma NO
      // debe pasar de ahí: autotable avisaría «could not fit page».
      // 5.105-A · Código 82 pt: los códigos reales llegan a 15 caracteres
      // (p. ej. COLCHONINFLAMED ≈ 74 pt a 7 pt helvetica); con 55 pt se
      // doblaban a dos líneas dentro de la celda (CARIPHONE1 / 7PRO). Se
      // compensa con Marca (los valores reales son cortos) y Descripción
      // (casi siempre vacía en este catálogo).
      0: { cellWidth: 82 },
      1: { cellWidth: 100, fontStyle: 'bold' },
      2: { cellWidth: 40 },
      3: { cellWidth: 90 },
      4: { cellWidth: 40 },
      5: { cellWidth: 50, halign: 'right' },
      6: { cellWidth: 30, halign: 'right' },
      7: { cellWidth: 145 },
      8: { cellWidth: 151, textColor: [17, 88, 168], fontSize: 6.5 },
    },
    didParseCell(hook) {
      if (hook.section !== 'body') return;
      const i = hook.row.index;
      // Estado con color (verde/rojo); subtotal destacado en gris y negrita.
      if (hook.column.index === 4 && estadoDeFila[i] === 'Activo') {
        hook.cell.styles.textColor = [21, 128, 61];
      }
      if (hook.column.index === 4 && estadoDeFila[i] === 'Inactivo') {
        hook.cell.styles.textColor = [220, 38, 38];
      }
      if (esSubtotal[i]) {
        hook.cell.styles.fontStyle = 'bold';
        hook.cell.styles.fillColor = [240, 240, 240];
      }
    },
    didDrawCell(hook) {
      // Zona clickeable sobre la celda Foto (el texto ya lo pintó autotable).
      if (hook.section !== 'body' || hook.column.index !== 8) return;
      const url = urlDeFila[hook.row.index];
      if (url) {
        const { x, y, width, height } = hook.cell;
        doc.link(x, y, width, height, { url });
      }
    },
    didDrawPage() {
      // Pie en TODAS las páginas. El total se resuelve con putTotalPages.
      const alto = doc.internal.pageSize.getHeight();
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(120);
      doc.text('SPOT 24 · inventario', 32, alto - 18);
      const pag = doc.getCurrentPageInfo().pageNumber;
      doc.text(`Página ${pag} de ${TOTAL_PAGINAS}`, ancho - 32, alto - 18, { align: 'right' });
      doc.setTextColor(0);
    },
  });

  doc.putTotalPages(TOTAL_PAGINAS);
  return doc;
}
