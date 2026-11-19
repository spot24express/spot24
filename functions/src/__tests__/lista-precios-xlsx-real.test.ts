/**
 * VALIDACIÓN CONTRA EL ARCHIVO REAL del dueño (5.151): el lector del
 * «REPORTE LISTA DE PRECIOS» en Excel corre contra ListadePreciosGabriel.xlsx
 * (17/11/2026 · 2.981 filas · 985 registros del ERP) y se compara con el
 * ensayo previo hecho fuera del repo (parser Python sobre el mismo archivo):
 *  · 985 registros según el propio ERP (pie «No. de Registros: 985»)
 *    − 2 filas-trampa descartadas (997 «COMPRAS GRAVABLES», 998 «COMPRAS
 *    EXENTAS», decisión del dueño: «realmente no son productos»)
 *    = 983 productos reales leídos.
 *  · Ceros iniciales intactos (41 códigos), precios «Precio REF c/Imp» con
 *    decimales, 0 filas sin precio legible, 1 bloque de encabezado,
 *    ~300 ms de lectura.
 *
 * DÓNDE BUSCA EL ARCHIVO (en este orden, primera coincidencia gana):
 *  1. Variable de entorno EXCEL_LISTA_PRECIOS (ruta COMPLETA al .xlsx),
 *     p. ej. en PowerShell:
 *       $env:EXCEL_LISTA_PRECIOS = 'C:\Users\Erick\Downloads\ListadePreciosGabriel.xlsx'
 *  2. Copia del .xlsx en la RAÍZ del repo (C:\Users\Erick\spot24\).
 *  3. Copia en raíz/upload/, en functions/ o en upload/ junto a la carpeta
 *     del repo (disposición usada durante el desarrollo).
 *
 * Si el archivo no está en esta máquina (otra PC, CI de GitHub), la suite
 * se SALTA sola (skip): NUNCA falla por ausencia del archivo.
 *
 * SEMÁNTICA VITEST (lección de la 5.151): la factory de `describe.skip` SÍ
 * se ejecuta — Vitest la corre para REGISTRAR los tests que va a saltar
 * (solo se saltan los callbacks de `it`). Por eso toda la E/S (existsSync,
 * readFileSync) y el parse viven AQUÍ, a nivel de módulo, y dentro del
 * describe el parse es PEREZOSO: si el archivo no está, cada `it` nace con
 * `skip: true` y `cargar()` jamás llega a llamarse.
 *
 * OJO con apuntar a un export MÁS NUEVO del ERP: las cifras exactas de esta
 * suite (existencias de D22-850, 75920913, 021400059245, ZD976) son las del
 * export del 17/11/2026 — son el «contrato» del fixture. Con un export más
 * nuevo las existencias cambian y la suite puede fallar SIN que sea un bug
 * del lector: para validar un export nuevo, usa el ENSAYO del panel.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseListaPreciosXlsx } from '../lib/listaPreciosXlsx';

const NOMBRE = 'ListadePreciosGabriel.xlsx';
const CANDIDATAS = [
  process.env['EXCEL_LISTA_PRECIOS'],
  resolve(process.cwd(), '..', NOMBRE), // raíz del repo (cwd al testear: functions/)
  resolve(process.cwd(), '..', 'upload', NOMBRE), // raíz/upload/
  resolve(process.cwd(), NOMBRE), // functions/
  resolve(process.cwd(), '..', '..', 'upload', NOMBRE), // upload/ junto al repo (sandbox de desarrollo)
];

const RUTA = CANDIDATAS.find((p): p is string => !!p && existsSync(p));

let bytes: Uint8Array | undefined;
if (RUTA) {
  try {
    bytes = new Uint8Array(readFileSync(RUTA));
  } catch {
    bytes = undefined; // existeSync mintió o el archivo se volvió ilegible: skip, no crash.
  }
}

type Parseo = ReturnType<typeof parseListaPreciosXlsx>;
let res: Parseo | undefined;
let ms = 0;
/** Parse perezoso (una sola vez): solo lo invocan tests NO saltados. */
function cargar(): Parseo {
  if (res === undefined) {
    const t0 = Date.now();
    res = parseListaPreciosXlsx(bytes as Uint8Array);
    ms = Date.now() - t0;
  }
  return res;
}

const SALTA = bytes === undefined;

describe('archivo real ListadePreciosGabriel.xlsx (validación 5.151)', () => {
  it('983 productos reales (985 del ERP − 2 filas-trampa del ERP)', { skip: SALTA }, () => {
    const r = cargar();
    expect(r.filas.length).toBe(983);
    expect(r.descartadasResumen).toBe(2);
    expect(r.problemas).toHaveLength(2);
    expect(r.problemas.every((p) => p.includes('COMPRAS GRAVABLES') || p.includes('COMPRAS EXENTAS'))).toBe(true);
    expect(new Set(r.filas.map((f) => f.codigo)).size).toBe(983);
    expect(r.bloquesEncabezado).toBe(1);
  });
  it('precios y existencias coinciden con el ensayo previo (muestra verificada)', { skip: SALTA }, () => {
    const r = cargar();
    const porCodigo = new Map(r.filas.map((f) => [f.codigo, f]));
    expect(porCodigo.get('D22-850')).toMatchObject({ existencia: 2, precioConImp: 125.81, descripcion: 'BATERIA DUNCAN 850' });
    expect(porCodigo.get('021400059245')).toMatchObject({ existencia: 11, precioConImp: 15 });
    expect(porCodigo.get('75920913')).toMatchObject({ existencia: 8, precioConImp: 1.25 });
    expect(porCodigo.get('ZD976')).toMatchObject({ existencia: 1, precioConImp: 44.13 });
  });
  it('los ceros iniciales se conservan como TEXTO (41 códigos) y TODO trae precio', { skip: SALTA }, () => {
    const r = cargar();
    expect(r.filas.filter((f) => f.codigo.startsWith('0')).length).toBe(41);
    expect(r.filas.filter((f) => f.precioConImp === undefined)).toHaveLength(0);
    expect(r.filas.filter((f) => !Number.isFinite(f.existencia))).toHaveLength(0);
  });
  it('la lectura es rápida (el ERP de ~3.000 filas entra en bien menos de 5 s)', { skip: SALTA }, () => {
    cargar();
    expect(ms).toBeLessThan(5000);
  });
});
