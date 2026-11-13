/**
 * SPOT 24 · Tests del MODO PRECIOS (5.138/5.141, a pedido del dueño): con la
 * «REPORTE LISTA DE PRECIOS» del ERP, a cada código que YA EXISTE en la
 * tienda se le fija el precio de la columna «Precio REF c/Imp» (USD con
 * impuesto = precio final desde el modelo de IVA incluido 5.120) CON SUS
 * DECIMALES (5.141: 125.81 → 125.81; la 5.138 lo truncaba a 125). Los
 * códigos que solo están en el PDF no se tocan ni se crean, y un precio 0
 * o ilegible NO se aplica (un precio 0 sería un producto gratis).
 *
 * El fixture usa las coordenadas REALES del PDF del dueño (pdfjs):
 * cabecera completa de 6 etiquetas en la página 1 (y=660.4), cabecera CORTA
 * de 4 en las páginas siguientes (y=758.4), números alineados a la derecha
 * (x=360/415/484/544) y descripciones con números propios («WHISKYE DEWARS
 * 8 AÑOS 0.75», «BLAZER 262.305.3») que NO deben confundirse con el precio.
 */
import { describe, expect, it } from 'vitest';
import {
  parseListaPrecios, parseInventarioAuto, numeroVe,
  type InvItem,
} from '../lib/inventarioPdf';
import {
  precioDecimalesDe, existenciaEnteraDe, planPrecios, modoDe, ensayoDe,
} from '../importInventory';

const it_ = (s: string, x: number, y: number, w: number): InvItem => ({ s, x, y, w });

/** Cabecera COMPLETA de la página 1 (coordenadas reales del PDF del dueño). */
const CABECERA_COMPLETA: InvItem[] = [
  it_('Codigo', 31.7, 660.4, 22.8),
  it_('Descripcion', 80.2, 660.4, 38.4),
  it_('Precio', 372.1, 660.4, 20.6),
  it_('Precio c/Imp', 404.5, 660.4, 42.1),
  it_('Precio REF', 464.9, 660.4, 34.4),
  it_('Precio REF c/Imp', 507.7, 660.4, 55.9),
];

/** Cabecera CORTA de las páginas 2+ (sin las etiquetas REF). */
const CABECERA_CORTA: InvItem[] = [
  it_('Codigo', 31.2, 758.4, 22.8),
  it_('Descripcion', 79.6, 758.4, 38.4),
  it_('Precio', 372.1, 758.4, 20.6),
  it_('Precio c/Imp', 404.5, 758.4, 42.1),
];

/** Página 1 real: membrete + cabecera + primeras filas + pie. */
const PAGINA_1: InvItem[] = [
  it_('AUTO SERVICIO MONTANA FRESCA 2026, C.A', 31.6, 800.1, 223.6),
  it_('Fecha : 12/11/2026', 482.6, 800.1, 72.5),
  it_('Dirección: AV CASANOVA GODOY LOCAL NRO S/N ZONA INDUSTRIAL SAN', 31.6, 788.7, 263.4),
  it_('JACINTO MARACAY ARAGUA', 31.6, 778.2, 101.6),
  it_('REPORTE LISTA DE PRECIOS', 31.2, 765.7, 135.4),
  it_('Ordenado Por : Código', 35.3, 673.1, 37.2),
  ...CABECERA_COMPLETA,
  // D22-850 (número grande a la izquierda, REF c/Imp = 125.81).
  it_('D22-850', 33.3, 641.5, 24.2),
  it_('BATERIA DUNCAN 850', 99.1, 641.5, 71.7),
  it_('98,096.65', 360.3, 641.5, 32.4),
  it_('113,792.11', 411.1, 641.5, 36.5),
  it_('108.46', 480.2, 641.5, 22.3),
  it_('125.81', 540.2, 641.5, 22.3),
  // SHELL HX5 → 15.00
  it_('021400059245', 31.7, 624.5, 42.6),
  it_('SHELL HELIX HX5 MINERAL 15W/40 SN', 99.1, 624.5, 124.2),
  it_('11,695.44', 360.3, 624.5, 32.4),
  it_('13,566.75', 415.1, 624.5, 32.4),
  it_('12.93', 484.3, 624.5, 18.2),
  it_('15.00', 544.3, 624.5, 18.2),
  // 0715 → 0.75 (quedaría en 0 sin decimales)
  it_('0715', 31.7, 114.2, 14.2),
  it_('REFRESCO GOLDEN MANZANA RETORNABLE 350 M', 99.1, 114.2, 164.4),
  it_('584.82', 370.5, 114.2, 22.3),
  it_('678.43', 425.3, 114.2, 22.3),
  it_('0.65', 488.3, 114.2, 14.2),
  it_('0.75', 548.4, 114.2, 14.2),
  // CR45TS: la descripción trae «262.305.3» (número propio, NO el precio).
  it_('CR45TS', 31.7, 97.2, 22.3),
  it_('BUJIA BL15 ACDELCO BLAZER 262.305.3', 99.1, 97.2, 140),
  it_('1,754.36', 370.5, 97.2, 22.3),
  it_('2,035.10', 425.3, 97.2, 22.3),
  it_('1.94', 488.3, 97.2, 14.2),
  it_('2.25', 548.4, 97.2, 14.2),
  // DEWARS: la descripción trae «0.75» (tamaño de botella, NO el precio).
  it_('5000277001101', 31.7, 80.2, 42.6),
  it_('WHISKYE DEWARS 8 AÑOS 0.75', 99.1, 80.2, 100),
  it_('13,254.90', 360.3, 80.2, 32.4),
  it_('15,375.65', 415.1, 80.2, 32.4),
  it_('14.66', 484.3, 80.2, 18.2),
  it_('17.00', 544.3, 80.2, 18.2),
  // Código con apóstrofe que genera el POS.
  it_("23300'21030", 31.7, 63.2, 42.6),
  it_('FILTRO GAS TMM TOY. COROLLA 09-14/YARIS', 99.1, 63.2, 130),
  it_('3,668.45', 360.3, 63.2, 32.4),
  it_('4,255.44', 415.1, 63.2, 32.4),
  it_('4.06', 484.3, 63.2, 18.2),
  it_('4.71', 544.3, 63.2, 18.2),
  it_('Pag.1', 538, 31.8, 20),
];

describe('numeroVe (valores de la lista de precios)', () => {
  it('miles US con coma, decimales con punto y ceros', () => {
    expect(numeroVe('1,154.41')).toBe(1154.41);
    expect(numeroVe('98,096.65')).toBe(98096.65);
    expect(numeroVe('15.00')).toBe(15);
    expect(numeroVe('0.75')).toBe(0.75);
  });
});

describe('parseListaPrecios (formato «REPORTE LISTA DE PRECIOS»)', () => {
  const res = parseListaPrecios([PAGINA_1]);
  const porCodigo = new Map(res.filas.map((f) => [f.codigo, f]));

  it('lee las filas de datos con el precio de «Precio REF c/Imp»', () => {
    expect(res.filas).toHaveLength(6);
    expect(porCodigo.get('D22-850')?.precioConImp).toBe(125.81);
    expect(porCodigo.get('021400059245')?.precioConImp).toBe(15);
    expect(porCodigo.get('0715')?.precioConImp).toBe(0.75);
    expect(porCodigo.get('CR45TS')?.precioConImp).toBe(2.25);
    expect(porCodigo.get('5000277001101')?.precioConImp).toBe(17);
    expect(porCodigo.get("23300'21030")?.precioConImp).toBe(4.71);
  });

  it('el código con apóstrofe se conserva tal cual (el POS lo genera)', () => {
    expect(porCodigo.has("23300'21030")).toBe(true);
  });

  it('las descripciones conservan sus números propios (0.75 L, 262.305.3)', () => {
    expect(porCodigo.get('CR45TS')?.descripcion).toContain('262.305.3');
    expect(porCodigo.get('5000277001101')?.descripcion).toContain('0.75');
    // …y ese número de la descripción JAMÁS se usa como precio.
    expect(porCodigo.get('5000277001101')?.precioConImp).toBe(17);
  });

  it('el membrete, «Pag.N» y los códigos imposibles no generan filas', () => {
    const codigos = res.filas.map((f) => f.codigo);
    expect(codigos).not.toContain('AUTOSERVICIOMONTANAFRESCA2026,C.A');
    expect(codigos).not.toContain('REPORTELISTADEPRECIOS');
    expect(codigos).not.toContain('PAG.1');
    expect(codigos).not.toContain('JACINTOMARACAYARAGUA');
    expect(res.problemas).toHaveLength(0);
  });

  it('la versión vieja con «S/D» suelto no produce filas ni problemas', () => {
    const paginaConSD = [
      ...CABECERA_COMPLETA,
      it_('D22-850', 33.3, 641.5, 24.2),
      it_('BATERIA DUNCAN 850', 99.1, 641.5, 71.7),
      it_('95,648.70', 360.3, 641.5, 32.4),
      it_('110,952.49', 411.1, 641.5, 36.5),
      it_('108.46', 480.2, 641.5, 22.3),
      it_('125.81', 540.2, 641.5, 22.3),
      it_('S/D', 31.7, 638, 14),
    ];
    const r = parseListaPrecios([paginaConSD]);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]!.codigo).toBe('D22-850');
    expect(r.problemas).toHaveLength(0);
  });

  it('fila sin «Precio REF c/Imp» legible → problema con el código', () => {
    const pagina = [
      ...CABECERA_COMPLETA,
      it_('XXTEST1', 33.3, 641.5, 24.2),
      it_('PRODUCTO SIN CUARTA COLUMNA', 99.1, 641.5, 120),
      it_('98,096.65', 360.3, 641.5, 32.4),
      it_('113,792.11', 411.1, 641.5, 36.5),
      it_('108.46', 480.2, 641.5, 22.3),
    ];
    const r = parseListaPrecios([pagina]);
    expect(r.filas).toHaveLength(0);
    expect(r.problemas[0]).toContain('XXTEST1');
    expect(r.problemas[0]).toContain('Precio REF c/Imp');
  });

  it('las páginas 2+ (cabecera CORTA) se leen con los límites de la página 1', () => {
    const pagina2: InvItem[] = [
      it_('REPORTE LISTA DE PRECIOS', 31.2, 800.1, 135.4),
      ...CABECERA_CORTA,
      it_('097012312016', 31.7, 737.9, 42.6),
      it_('ACEITE AMSOIL SINTETICO 5W-30 OE', 99.1, 737.9, 119.5),
      it_('19,492.44', 360.3, 737.9, 32.4),
      it_('22,611.25', 415.1, 737.9, 32.4),
      it_('21.55', 484.3, 737.9, 18.2),
      it_('25.00', 544.3, 737.9, 18.2),
    ];
    const conPagina1 = parseListaPrecios([PAGINA_1, pagina2]);
    expect(conPagina1.filas.find((f) => f.codigo === '097012312016')?.precioConImp).toBe(25);
    // Y también SOLO con la página 2 (sin cabecera completa): las 2 columnas
    // REF se derivan con los huecos fijos del formato (medidos en el PDF real).
    const soloPagina2 = parseListaPrecios([pagina2]);
    expect(soloPagina2.filas.find((f) => f.codigo === '097012312016')?.precioConImp).toBe(25);
  });

  it('parseInventarioAuto la detecta como «lista-precios»', () => {
    expect(parseInventarioAuto([PAGINA_1]).formato).toBe('lista-precios');
  });

  it('no confunde la lista de precios con los otros dos formatos', () => {
    // El POS exige Existencia/Pedidos/Disponible/Costo/Costo Total y la lista
    // limpia exige «Precio USD sin/con impuesto»: ninguno está aquí.
    expect(parseInventarioAuto([PAGINA_1]).filas.length).toBeGreaterThan(0);
  });
});

describe('precioDecimalesDe (5.141 · CON los decimales, pedido del dueño)', () => {
  it('conserva los decimales: 125.81 → 125.81', () => {
    expect(precioDecimalesDe(125.81)).toBe(125.81);
    expect(precioDecimalesDe(15)).toBe(15);
    expect(precioDecimalesDe(17.0)).toBe(17);
    expect(precioDecimalesDe(1154.41)).toBe(1154.41);
    expect(precioDecimalesDe(2.99)).toBe(2.99);
  });
  it('los menores de $1 YA se aplican (desde la 5.141 no se pierden)', () => {
    expect(precioDecimalesDe(0.75)).toBe(0.75);
    expect(precioDecimalesDe(0.13)).toBe(0.13);
  });
  it('redondea a 2 decimales (nunca más de 2 centavos)', () => {
    expect(precioDecimalesDe(10.999)).toBe(11);
    expect(precioDecimalesDe(10.994)).toBe(10.99);
  });
  it('basura → 0 (jamás NaN ni negativos)', () => {
    expect(precioDecimalesDe(Number.NaN)).toBe(0);
    expect(precioDecimalesDe(-5)).toBe(0);
    expect(precioDecimalesDe(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('existenciaEnteraDe (5.137 · stock sin decimales)', () => {
  it('trunca: 12.9 → 12 (no redondea a 13)', () => {
    expect(existenciaEnteraDe(12.9)).toBe(12);
    expect(existenciaEnteraDe(3)).toBe(3);
    expect(existenciaEnteraDe(0.5)).toBe(0);
    expect(existenciaEnteraDe(Number.NaN)).toBe(0);
  });
});

describe('modoDe / ensayoDe (5.137 · parámetros del body)', () => {
  it('sin modo → completo (comportamiento de siempre); con modo → el pedido', () => {
    expect(modoDe(undefined)).toBe('completo');
    expect(modoDe({})).toBe('completo');
    expect(modoDe({ modo: 'otro' })).toBe('completo');
    expect(modoDe({ modo: 'stock' })).toBe('stock');
    expect(modoDe({ modo: 'precios' })).toBe('precios');
  });
  it('ensayo solo con ensayo: true exacto', () => {
    expect(ensayoDe(undefined)).toBe(false);
    expect(ensayoDe({ ensayo: false })).toBe(false);
    expect(ensayoDe({ ensayo: 'true' })).toBe(false);
    expect(ensayoDe({ ensayo: true })).toBe(true);
  });
});

describe('planPrecios (clasificación pura del modo precios)', () => {
  const filaDe = (codigo: string, precioConImp: number | undefined): import('../lib/inventarioPdf').FilaInventario => ({
    codigo,
    descripcion: `PRODUCTO ${codigo}`,
    existencia: 0,
    costo: 0,
    ...(precioConImp !== undefined ? { precioConImp } : {}),
  });

  const existentes = new Map([
    ['D22-850', { pid: 'p1', nombre: 'BATERIA DUNCAN 850', precioActual: 110, vid: 'p1-v1' }],
    ['IGUAL1', { pid: 'p2', nombre: 'YA TIENE ESE PRECIO', precioActual: 20, vid: 'p2-v1' }],
    ['BARATO1', { pid: 'p3', nombre: 'POR DEBAJO DE 1', precioActual: 0.9, vid: 'p3-v1' }],
    ['CERO1', { pid: 'p4', nombre: 'PRECIO CERO EN EL PDF', precioActual: 5, vid: 'p4-v1' }],
  ]);

  const plan = planPrecios(
    [
      filaDe('D22-850', 125.81),   // cambia 110 → 125.81 (5.141: CON decimales)
      filaDe('IGUAL1', 20),        // ya era 20: sin cambio
      filaDe('BARATO1', 0.75),     // menor de $1: SÍ se aplica (5.141), 0.9 → 0.75
      filaDe('CERO1', 0),          // precio 0 en el PDF: blindaje, no se toca
      filaDe('NUEVO1', 15),        // no está en la tienda: sin match
      filaDe('SINPRECIO', undefined), // fila del parser sin precio (defensa)
    ],
    existentes,
  );

  it('el cambio lleva antes → después CON decimales y la referencia de variante', () => {
    expect(plan.cambios).toHaveLength(2);
    expect(plan.cambios[0]).toMatchObject({
      codigo: 'D22-850', antes: 110, despues: 125.81, pid: 'p1', vid: 'p1-v1',
    });
    expect(plan.cambios[1]).toMatchObject({
      codigo: 'BARATO1', antes: 0.9, despues: 0.75, pid: 'p3', vid: 'p3-v1',
    });
  });
  it('los códigos que no están en la tienda caen en sinMatch (no se crean nada)', () => {
    expect(plan.sinMatch).toEqual(['NUEVO1', 'SINPRECIO']);
  });
  it('precio 0 o ilegible queda fuera (blindaje) y se lista', () => {
    expect(plan.sinPrecio).toEqual(['CERO1']);
    expect(plan.cambios.find((c) => c.codigo === 'CERO1')).toBeUndefined();
  });
  it('el precio idéntico no genera escritura (sinCambio)', () => {
    expect(plan.sinCambio).toEqual(['IGUAL1']);
  });
});
