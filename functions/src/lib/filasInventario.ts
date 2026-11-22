/**
 * SPOT 24 · Fila del reporte del ERP + número «a la venezolana».
 *
 * 5.161 · Estas dos piezas vivían en lib/inventarioPdf (el import por PDF).
 * El lector del Excel (lib/listaPreciosXlsx.ts, ronda 5.151) llena la MISMA
 * estructura de fila, así que el tipo y el parser de números se mudaron aquí
 * para que el Excel no dependa del código del PDF (borrado en esta ronda,
 * cierre de la pendiente 5.154).
 */

export interface FilaInventario {
  /** Código del POS (mayúsculas); único tras deduplicar. */
  codigo: string;
  /** Descripción completa (incluye los renglones envueltos). */
  descripcion: string;
  /** Existencia redondeada a unidades. */
  existencia: number;
  /** Costo en USD (2 decimales) — el dueño lo usa como precio. */
  costo: number;
  /** 5.138 · «Precio REF c/Imp» (USD CON impuesto): el precio FINAL de la
   *  tienda con el modelo de IVA incluido (5.120). El lector XLSX del
   *  «REPORTE LISTA DE PRECIOS» lo llena siempre (5.152). */
  precioConImp?: number;
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
