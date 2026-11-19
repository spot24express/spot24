/**
 * Tests del lector del «REPORTE LISTA DE PRECIOS» en EXCEL (5.151).
 * El fixture se construye AQUÍ con SheetJS replicando la estructura REAL del
 * archivo del dueño (ListadePreciosGabriel.xlsx · 17/11/2026):
 *  · grupos de celdas fusionadas con ancla en la 1ª columna,
 *  · números en TEXTO convención VE («95.648,70», «2,00»),
 *  · códigos como TEXTO con cero inicial («021400059245»),
 *  · 2 filas de detalle por depósito tras cada producto,
 *  · filas-trampa del ERP «COMPRAS GRAVABLES» / «COMPRAS EXENTAS»,
 *  · pie «No. de Registros» / «Pag.62»,
 *  · UN SEGUNDO bloque de encabezado con anclas distintas (multi-bloque).
 */
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { mapaDeEncabezado, numeroDeCelda, parseListaPreciosXlsx, textoPlano } from '../lib/listaPreciosXlsx';

/* ── construcción del fixture con el layout real (31 columnas) ── */

const ENC = (): string[] => {
  const r: string[] = [];
  const grupo = (etiqueta: string, n: number) => { for (let i = 0; i < n; i++) r.push(etiqueta); };
  grupo('Codigo', 3);
  r.push('');
  grupo('Descripcion', 8);
  r.push('');
  grupo('Existencia', 4);
  r.push('');
  grupo('Precio', 3);
  r.push('');
  grupo('Precio c/Imp', 2);
  r.push('');
  grupo('Precio REF', 4);
  r.push('');
  grupo('Precio REF c/Imp', 3);
  return r;
};

/** Fila de producto en el layout real: A-C código, E-L desc, M-P stock, AC-AE precio c/Imp. */
const PRODUCTO = (codigo: string, desc: string, stock: string | number, refCi: string): (string | number)[] => {
  const r: (string | number)[] = new Array(31).fill('');
  r[0] = r[1] = r[2] = codigo;
  for (let i = 4; i <= 11; i++) r[i] = desc;
  for (let i = 12; i <= 15; i++) r[i] = stock;
  for (let i = 28; i <= 30; i++) r[i] = refCi;
  return r;
};

const DEPOSITO = (): string[] => {
  const r: string[] = new Array(31).fill('');
  for (let i = 0; i <= 6; i++) r[i] = 'Deposito';
  r[7] = 'Existencia'; r[8] = 'Existencia'; r[9] = 'Ex.Det.'; r[10] = 'Ex.Det.';
  return r;
};

const NOMBRE_DEPOSITO = (): string[] => {
  const r: string[] = new Array(31).fill('');
  for (let i = 0; i <= 6; i++) r[i] = 'DEPOSITO PRINCIPAL';
  r[7] = '2'; r[8] = '0'; r[9] = '0';
  return r;
};

/** Hoja completa: portada + encabezado + productos + trampa + 2º bloque + pie. */
function hojaFixture(): unknown[][] {
  return [
    ['AUTO SERVICIO MONTANA FRESCA 2026, C.A'],
    ['Fecha : 17/11/2026'],
    ['Hora : 12:16:48 p. m.'],
    ['REPORTE LISTA DE PRECIOS'],
    ['Nivel Producto:'],
    ['Familia :'],
    ['Marca:'],
    ['Clase:'],
    ['Estatus :Todas'],
    ['Ordenado Por : Código'],
    ['Tipo de Precio : Precio 1'],
    ENC(),
    PRODUCTO('D22-850', 'BATERIA DUNCAN 850', '2,00', '125,81'),
    DEPOSITO(),
    NOMBRE_DEPOSITO(),
    PRODUCTO('021400059245', 'SHELL HELIX HX5 MINERAL 15W/40 SN', '11,00', '15,00'),
    DEPOSITO(),
    NOMBRE_DEPOSITO(),
    // existencia numérica cruda (celda numérica, no texto) + miles VE
    PRODUCTO('ZD001', 'PASTILLAS DE FRENO QS', 6, '1.250,00'),
    DEPOSITO(),
    NOMBRE_DEPOSITO(),
    // filas-trampa del ERP (decisión del dueño: NO son productos)
    PRODUCTO('997', 'COMPRAS GRAVABLES', '0,00', '0,00'),
    PRODUCTO('998', 'COMPRAS EXENTAS', '0,00', '0,00'),
    // código repetido (gana la ÚLTIMA aparición, igual que los parsers PDF)
    PRODUCTO('REP01', 'PRODUCTO REPETIDO V1', '5,00', '10,00'),
    PRODUCTO('REP01', 'PRODUCTO REPETIDO V2', '7,00', '12,50'),
    // segundo bloque con ANCLAS DISTINTAS (el dueño: el 2007 traía 5 bloques)
    ['Nivel Depósito :'],
    (() => {
      const r: string[] = [];
      for (let i = 0; i < 5; i++) r.push('Codigo');
      r.push('');
      for (let i = 0; i < 4; i++) r.push('Descripcion');
      r.push('');
      for (let i = 0; i < 2; i++) r.push('Existencia');
      r.push('');
      for (let i = 0; i < 4; i++) r.push('Precio REF c/Imp');
      return r;
    })(),
    (() => {
      const r: (string | number)[] = new Array(31).fill('');
      r[0] = r[1] = r[2] = r[3] = r[4] = 'BLOQ2';
      for (let i = 6; i <= 9; i++) r[i] = 'ACEITE BLOQUE 2';
      r[11] = '3,00'; r[12] = '3,00';
      r[15] = '45,50'; r[16] = '45,50'; r[17] = '45,50'; r[18] = '45,50';
      return r;
    })(),
    ['No. de Registros:  985'],
    ['Pag.62'],
  ];
}

function xlsxDe(hoja: unknown[][]): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet(hoja);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Page 1');
  return new Uint8Array(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer);
}

describe('textoPlano / numeroDeCelda (celdas del Excel)', () => {
  it('los números enteros van a texto sin romperse (997 → "997")', () => {
    expect(textoPlano(997)).toBe('997');
    expect(textoPlano(0)).toBe('0');
  });
  it('el texto se limpia de saltos y espacios', () => {
    expect(textoPlano('  SHELL\nHELIX  ')).toBe('SHELL HELIX');
  });
  it('la convención VE por texto: coma decimal y punto de miles', () => {
    expect(numeroDeCelda('95.648,70')).toBe(95648.7);
    expect(numeroDeCelda('2,00')).toBe(2);
    expect(numeroDeCelda('1.250,00')).toBe(1250);
  });
  it('las celdas numéricas crudas pasan tal cual', () => {
    expect(numeroDeCelda(6)).toBe(6);
    expect(numeroDeCelda(1250.5)).toBe(1250.5);
  });
  it('la basura → NaN (y el parser la descarta, jamás inventa)', () => {
    expect(numeroDeCelda('N/A')).toBeNaN();
    expect(numeroDeCelda('')).toBeNaN();
  });
});

describe('mapaDeEncabezado (grupos de celdas fusionadas)', () => {
  it('toma la ANCLA (1ª columna) de cada grupo real', () => {
    const mapa = mapaDeEncabezado(ENC());
    expect(mapa['Codigo']).toBe(0);
    expect(mapa['Descripcion']).toBe(4);
    expect(mapa['Existencia']).toBe(13);
    expect(mapa['Precio REF c/Imp']).toBe(30);
  });
  it('con anclas distintas recalcula (bloque 2 del fixture)', () => {
    const bloque2 = [
      'Codigo', 'Codigo', 'Codigo', 'Codigo', 'Codigo', '',
      'Descripcion', 'Descripcion', 'Descripcion', 'Descripcion', '',
      'Existencia', 'Existencia', '',
      'Precio REF c/Imp', 'Precio REF c/Imp', 'Precio REF c/Imp', 'Precio REF c/Imp',
    ];
    const mapa = mapaDeEncabezado(bloque2);
    expect(mapa['Codigo']).toBe(0);
    expect(mapa['Descripcion']).toBe(6);
    expect(mapa['Existencia']).toBe(11);
    expect(mapa['Precio REF c/Imp']).toBe(14);
  });
});

describe('parseListaPreciosXlsx (fixture con la estructura real del ERP)', () => {
  const res = parseListaPreciosXlsx(xlsxDe(hojaFixture()));
  const porCodigo = new Map(res.filas.map((f) => [f.codigo, f]));

  it('lee TODOS los productos y filtra la basura', () => {
    // D22-850, 021400059245, ZD001, REP01 (única, tras dedupe), BLOQ2
    expect(res.filas.map((f) => f.codigo)).toEqual(['D22-850', '021400059245', 'ZD001', 'REP01', 'BLOQ2']);
  });
  it('el precio sale de «Precio REF c/Imp» CON sus decimales', () => {
    expect(porCodigo.get('D22-850')).toMatchObject({ existencia: 2, costo: 125.81, precioConImp: 125.81 });
    expect(porCodigo.get('021400059245')).toMatchObject({ existencia: 11, precioConImp: 15 });
    expect(porCodigo.get('ZD001')).toMatchObject({ existencia: 6, precioConImp: 1250 });
  });
  it('los códigos van como TEXTO: el cero inicial jamás se pierde', () => {
    expect(porCodigo.get('021400059245')?.codigo).toBe('021400059245');
  });
  it('las celdas numéricas crudas también se leen', () => {
    expect(porCodigo.get('ZD001')?.existencia).toBe(6);
  });
  it('las filas-trampa del ERP se DESCARTAN (decisión del dueño) y quedan contadas', () => {
    expect(res.descartadasResumen).toBe(2);
    expect(porCodigo.get('997')).toBeUndefined();
    expect(porCodigo.get('998')).toBeUndefined();
    expect(res.problemas.some((p) => p.includes('COMPRAS GRAVABLES'))).toBe(true);
    expect(res.problemas.some((p) => p.includes('COMPRAS EXENTAS'))).toBe(true);
  });
  it('los códigos repetidos: gana la ÚLTIMA aparición + problema', () => {
    expect(porCodigo.get('REP01')).toMatchObject({ existencia: 7, precioConImp: 12.5 });
    expect(res.problemas.some((p) => p.includes('Código repetido'))).toBe(true);
  });
  it('procesa los DOS bloques de encabezado con sus anclas', () => {
    expect(res.bloquesEncabezado).toBe(2);
    expect(porCodigo.get('BLOQ2')).toMatchObject({ existencia: 3, precioConImp: 45.5 });
  });
  it('la basura (portada, depósitos, pies) se cuenta y se ignora', () => {
    // portada 10 + depósitos 8 + pie 2 = 20
    expect(res.filasBasura).toBe(20);
  });
  it('un archivo sin encabezado reconocible no inventa productos', () => {
    const vacio = parseListaPreciosXlsx(xlsxDe([['Hola mundo'], ['Otra fila']]));
    expect(vacio.filas).toHaveLength(0);
    expect(vacio.bloquesEncabezado).toBe(0);
  });
});
