/**
 * Tests del parser del reporte «REPORTE DE INVENTARIO DISPONIBLE» (5.87).
 * El fixture son items REALES del PDF del POS del dueño (pdfjs-dist):
 * membrete + cabecera + 3 productos con su fórmula-basura + el bloque del
 * 0613, cuya descripción viene ENVUELTA en dos renglones («…350» + «M»). *
 * 5.87b añade la prueba EXTREMO-A-EXTREMO de la EXTRACCIÓN: un PDF mínimo
 * REAL (generado aquí, con las coordenadas exactas del reporte) pasa por
 * extraerItemsPdf (pdfjs) → parseInventario, y la REGRESIÓN del bundle
 * esbuild de Netlify (el worker de pdfjs no se localizaba dentro del bundle
 * → 400 «No se pudo leer el PDF» en local y en producción).
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { build as esbuildBuild } from 'esbuild';
import { describe, expect, it, vi } from 'vitest';
import {
  filasDeItems, numeroVe, parseInventario, parseInventarioAuto, parseListaLimpia,
  type InvItem,
} from '../../functions/src/lib/inventarioPdf';
import {
  cargarWorkerPdfjs, extraerItemsPdf, mensajePaqueteAusente,
} from '../../functions/src/lib/extraerPdf';
import muestraReal from './fixtures/inventario-items.sample.json';
import listaLimpiaReal from './fixtures/lista-limpia-items.sample.json';

const paginas = muestraReal as unknown as InvItem[][];

describe('numeroVe (números del reporte, convención VE/US)', () => {
  it('decimales con punto', () => {
    expect(numeroVe('61.19')).toBe(61.19);
    expect(numeroVe('0.00')).toBe(0);
    expect(numeroVe('23.00')).toBe(23);
  });
  it('miles con coma US y con punto VE', () => {
    expect(numeroVe('1,234.56')).toBe(1234.56);
    expect(numeroVe('1.234,56')).toBe(1234.56);
    expect(numeroVe('12,345.00')).toBe(12345);
  });
  it('basura no numérica → NaN', () => {
    expect(numeroVe('abc')).toBeNaN();
    expect(numeroVe('[IIF(<TipoCosto>')).toBeNaN();
    expect(numeroVe('')).toBeNaN();
  });
});

describe('filasDeItems (agrupación por Y del layout)', () => {
  it('reúne los items de un mismo renglón y los ordena por X', () => {
    const filas = filasDeItems([
      { s: '0.00', x: 236.7, y: 657.3, w: 12 },
      { s: 'X', x: 300, y: 659, w: 8 }, // misma fila (±3 px)
      { s: '021400059245', x: 31.7, y: 657.3, w: 43 },
      { s: 'otra', x: 100, y: 640, w: 10 },
    ]);
    expect(filas).toHaveLength(2);
    expect(filas[0]!.map((i) => i.s)).toEqual(['021400059245', '0.00', 'X']);
  });
});

describe('parseInventario con el PDF real del dueño (fixture)', () => {
  const { filas, problemas } = parseInventario(paginas);

  it('reconoce los 5 productos del fixture sin problemas', () => {
    expect(problemas).toEqual([]);
    expect(filas.map((f) => f.codigo)).toEqual([
      '021400059245', '021400059252', '021400086319', '021400086630', '0613',
    ]);
  });

  it('mapea Descripcion → nombre, Existencia → stock, Costo → precio', () => {
    const p1 = filas[0]!;
    expect(p1.descripcion).toBe('CAJA SHELL HELIX HX5 MINERAL 15W/40 SN');
    expect(p1.existencia).toBe(0);
    expect(p1.costo).toBe(61.19);
    const p3 = filas[2]!;
    expect(p3.costo).toBe(65.41);
  });

  it('anexa la descripción envuelta del 0613 («…350» + «M»)', () => {
    const refresco = filas[4]!;
    expect(refresco.descripcion).toBe('REFRESCO GOLDEN NARANJA RETORNABLE 350 M');
    expect(refresco.existencia).toBe(4);
    expect(refresco.costo).toBe(0.4);
  });

  it('ignora el membrete, «Completa : N» y la fórmula-basura [IIF…]', () => {
    expect(filas.every((f) => /^[0-9]/.test(f.codigo))).toBe(true);
    expect(filas.every((f) => !f.descripcion.includes('IIF'))).toBe(true);
    expect(filas.every((f) => !f.descripcion.includes('Completa'))).toBe(true);
  });
});

describe('parseInventario · casos límite (items sintéticos con coordenadas reales)', () => {
  // Coordenadas reales de las columnas (cabecera del reporte del dueño).
  const cabecera: InvItem[] = [
    { s: 'Codigo', x: 31.7, y: 673.7, w: 23 },
    { s: 'Descripcion', x: 78.8, y: 673.7, w: 38 },
    { s: 'Existencia', x: 215.7, y: 673.7, w: 33 },
    { s: 'Pedidos', x: 269.2, y: 673.7, w: 26 },
    { s: 'Disponible', x: 298.9, y: 673.7, w: 35 },
    { s: 'Costo', x: 355.3, y: 673.7, w: 19 },
    { s: 'Costo Total', x: 379, y: 673.7, w: 37 },
  ];
  const producto = (y: number, codigo: string, desc: string, exist: string, costo: string): InvItem[] => [
    { s: codigo, x: 31.7, y, w: 43 },
    { s: desc, x: 78.8, y, w: 125 },
    { s: exist, x: 236.7, y, w: 12 },
    { s: '0.00', x: 283.4, y, w: 12 },
    { s: '0.00', x: 322, y, w: 12 },
    { s: costo, x: 358.4, y, w: 25 },
    { s: '0.00', x: 404.3, y, w: 12 },
  ];

  it('la cabecera repetida de la página 2 re-ata las columnas y sigue parseando', () => {
    const pag2: InvItem[] = [
      ...cabecera.map((i) => ({ ...i, y: 800 })),
      ...producto(786, '097012312016', 'CAJA ACEITE AMSOIL SINTETICO 5W-30 OE', '0.00', '199.68'),
    ];
    const { filas, problemas } = parseInventario([pag2]);
    expect(problemas).toEqual([]);
    expect(filas).toEqual([
      { codigo: '097012312016', descripcion: 'CAJA ACEITE AMSOIL SINTETICO 5W-30 OE', existencia: 0, costo: 199.68 },
    ]);
  });

  it('un código repetido en el reporte: gana la última aparición', () => {
    const { filas, problemas } = parseInventario([
      [...cabecera, ...producto(657, '0518', 'CAJA PEPSI RETORNABLE 350 ML', '23.00', '9.48')],
      producto(640, '0518', 'CAJA PEPSI RETORNABLE 350 ML', '30.00', '9.48'),
    ]);
    expect(problemas).toEqual([]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.existencia).toBe(30);
  });

  it('fila ilegible (sin costo en su columna) → problema y se omite', () => {
    const sinCosto = producto(657, '0613', 'REFRESCO GOLDEN NARANJA', '4.00', '').filter((i) => i.s !== '');
    const { filas, problemas } = parseInventario([[...cabecera, ...sinCosto]]);
    expect(filas).toHaveLength(0);
    expect(problemas).toEqual(['0613: existencia o costo ilegibles, se omitió.']);
  });

  it('membrete y basura con aspecto de código se descartan en silencio', () => {
    const ruido: InvItem[] = [
      { s: 'AUTO SERVICIO MONTANA FRESCA 2026, C.A', x: 31.6, y: 800, w: 224 },
      { s: 'REPORTE DE INVENTARIO DISPONIBLE', x: 31.2, y: 765, w: 189 },
      { s: '1', x: 31.7, y: 300, w: 5 }, // número de página
      { s: 'Completa : 4', x: 119, y: 259, w: 36 },
    ];
    const { filas, problemas } = parseInventario([[...cabecera, ...ruido]]);
    expect(filas).toEqual([]);
    expect(problemas).toEqual([]);
  });

  it('códigos alfanuméricos reales no se pegan a la descripción (columnas, no texto plano)', () => {
    const { filas } = parseInventario([
      [...cabecera, ...producto(657, '10500060A', 'LINTERNA ARB LED RECARGABLE 3', '0.00', '75.00')],
    ]);
    expect(filas[0]!.codigo).toBe('10500060A');
    expect(filas[0]!.descripcion).toBe('LINTERNA ARB LED RECARGABLE 3');
  });
});

/* ── 5.87b · Extracción REAL: PDF mínimo → pdfjs → parser ── */

/**
 * PDF 1.4 de UNA página, texto sin comprimir con Helvetica (fuente base: no
 * hace falta incrustar nada) que reproduce el layout del reporte del dueño
 * con las COORDENADAS EXACTAS de sus columnas (mismas X de cabecera y de
 * celdas que el PDF real: 31.7 / 78.8 / 215.7 / 269.2 / 298.9 / 355.3 / 379
 * y filas en 31.7 / 78.8 / 236.7 / 283.4 / 322 / 358.4 / 404.3).
 * Miembro del repo como función (no como binario): es determinista y se lee
 * solo. All-ASCII → la longitud en chars ES la longitud en bytes.
 */
function pdfMinimoInventario(): Buffer {
  const t = (x: number, y: number, texto: string): string =>
    `BT /F1 8 Tf ${x} ${y} Td (${texto}) Tj ET`;
  const contenido = [
    t(31.6, 800.1, 'AUTO SERVICIO MONTANA FRESCA 2026, C.A'),
    t(31.2, 765.7, 'REPORTE DE INVENTARIO DISPONIBLE'),
    // Cabecera de columnas (idéntica al reporte real)
    t(31.7, 673.7, 'Codigo'),
    t(78.8, 673.7, 'Descripcion'),
    t(215.7, 673.7, 'Existencia'),
    t(269.2, 673.7, 'Pedidos'),
    // Disponible/Costo/Costo Total van más a la derecha que en el PDF real:
    // pdfjs FUSIONA dos runs con hueco pequeño (pintó «PedidosDisponible» y
    // «Costo Costo Total» como UN item y la cabecera dejaba de anclar las
    // columnas). Con hueco ≥ 12 pt cada etiqueta es un item separado; los
    // valores de las filas (en las X reales del reporte) siguen cayendo en
    // su columna correcta.
    t(312, 673.7, 'Disponible'),
    t(365, 673.7, 'Costo'),
    t(400, 673.7, 'Costo Total'),
    // Producto 1 (y=657.3, como el 021400059245 real)
    t(31.7, 657.3, '021400059245'),
    t(78.8, 657.3, 'CAJA SHELL HELIX HX5 MINERAL 15W/40 SN'),
    t(236.7, 657.3, '12.00'),
    t(283.4, 657.3, '2.00'),
    t(322, 657.3, '10.00'),
    t(358.4, 657.3, '61.19'),
    t(404.3, 657.3, '734.28'),
    // Rengón de totales del POS (x=119, cae en Descripcion → se ignora)
    t(119, 644.4, 'Completa : 0'),
    // Producto 2 (y=634.6)
    t(31.7, 634.6, '25099349'),
    t(78.8, 634.6, 'FILTRO DE AIRE KYOTO MI L-300'),
    t(236.7, 634.6, '3.00'),
    t(283.4, 634.6, '0.00'),
    t(322, 634.6, '3.00'),
    t(358.4, 634.6, '7.25'),
    t(404.3, 634.6, '21.75'),
  ].join('\n');
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${contenido.length} >>\nstream\n${contenido}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objetos.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'latin1');
}

describe('extraerItemsPdf · PDF mínimo real → pdfjs → parser (5.87b)', () => {
  it('el worker queda registrado en globalThis con la forma que pdf.mjs consulta (5.87c)', async () => {
    // El contrato exacto (pdf.mjs, #mainThreadWorkerMessageHandler):
    // globalThis.pdfjsWorker?.WorkerMessageHandler. Si esto se vuelve
    // undefined, el fake worker busca el archivo en disco y muere con
    // «Setting up fake worker failed» (el 400 de 5.87b).
    await cargarWorkerPdfjs();
    const g = globalThis as unknown as { pdfjsWorker?: { WorkerMessageHandler?: unknown } };
    expect(typeof g.pdfjsWorker?.WorkerMessageHandler).toBe('function');
  });

  it('extrae y parsea un PDF REAL de una página con las columnas del dueño', async () => {
    const base64 = pdfMinimoInventario().toString('base64');
    const { filas, problemas } = parseInventario(await extraerItemsPdf(base64));
    expect(problemas).toEqual([]);
    expect(filas).toEqual([
      { codigo: '021400059245', descripcion: 'CAJA SHELL HELIX HX5 MINERAL 15W/40 SN', existencia: 12, costo: 61.19 },
      { codigo: '25099349', descripcion: 'FILTRO DE AIRE KYOTO MI L-300', existencia: 3, costo: 7.25 },
    ]);
  });

  it('PDF truncado (<100 bytes) → error accionable, no 500', async () => {
    const base64 = Buffer.from('%PDF-1.4 truncado a proposito').toString('base64');
    await expect(extraerItemsPdf(base64)).rejects.toThrow('vacío o incompleto');
  });

  it(
    '5.87c · PDF basura (cabecera real, cuerpo roto) → motivo TÉCNICO en el mensaje y en el log',
    async () => {
      // Antes: «No se pudo leer el PDF: ¿es el reporte de inventario de tu
      // sistema?» SIN la causa — el dueño recibió el mismo texto dos rondas
      // sin poder saber qué pasaba. Ahora la excepción real de pdfjs viaja
      // recortada en el mensaje (y console.error la deja en la terminal de
      // netlify dev, donde los 400 no imprimen stack).
      const base64 = Buffer.from('%PDF-1.4\n' + 'x'.repeat(400), 'latin1').toString('base64');
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(extraerItemsPdf(base64)).rejects.toThrow(
          /corrupto o incompleto \(InvalidPDFException: Invalid PDF structure/,
        );
        expect(errSpy).toHaveBeenCalledWith(
          expect.stringContaining('pdfjs no pudo leer el PDF'),
          expect.anything(),
        );
      } finally {
        errSpy.mockRestore();
      }
    },
  );

  it(
    'REGRESIÓN 5.87b: pdfjs (con su worker) funciona DENTRO del bundle esbuild de Netlify',
    { timeout: 30_000 },
    async () => {
      // Reproduce EXACTAMENTE el bundling de producción (node_bundler esbuild,
      // externals firebase-*): sin el registro del worker en globalThis
      // (lib/extraerPdf), este test muere con «Setting up fake worker failed:
      // Cannot find module …/pdf.worker.mjs» y fn-importInventory respondía
      // 400 «No se pudo leer el PDF» EN LOCAL Y EN PRODUCCIÓN.
      const aqui = path.dirname(fileURLToPath(import.meta.url));
      const cacheDir = path.resolve(aqui, '../../node_modules/.cache/spot24-tests');
      mkdirSync(cacheDir, { recursive: true });
      const outfile = path.join(cacheDir, 'extraerPdf-587b.cjs');
      await esbuildBuild({
        entryPoints: [path.resolve(aqui, '../../functions/src/lib/extraerPdf.ts')],
        bundle: true,
        platform: 'node',
        format: 'cjs',
        outfile,
        external: ['firebase-admin', 'firebase-functions'],
        logLevel: 'silent',
      });
      const requerir = createRequire(import.meta.url);
      const bundle = requerir(outfile) as {
        extraerItemsPdf: typeof extraerItemsPdf;
      };
      const base64 = pdfMinimoInventario().toString('base64');
      const { filas } = parseInventario(await bundle.extraerItemsPdf(base64));
      expect(filas).toHaveLength(2);
      expect(filas[0]!.codigo).toBe('021400059245');
    },
  );

  it(
    '5.87d · pdfjs-dist ausente (ERR_MODULE_NOT_FOUND) → mensaje con la ORDEN de arreglo',
    () => {
      // El fallo REAL del dueño (400 en su PC, dos rondas): netlify dev
      // deja los paquetes npm como imports externos y Node resuelve desde
      // la RAÍZ del proyecto; con pdfjs-dist solo en functions/node_modules
      // el import muere con ERR_MODULE_NOT_FOUND y el catch debe dar la
      // orden exacta (npm install en la raíz + reiniciar), no el genérico
      // «¿es el reporte de tu sistema?» que despistó dos rondas.
      // (mensajePaqueteAusente es pura: vitest no intercepta de forma
      // fiable el import dinámico de un módulo ya cargado, probado.)
      const err = Object.assign(
        new Error(
          "Cannot find package 'pdfjs-dist' imported from "
          + 'C:\\Users\\Erick\\spot24\\.netlify\\functions-serve\\fn-importInventory',
        ),
        { code: 'ERR_MODULE_NOT_FOUND' },
      );
      const msg = mensajePaqueteAusente(err);
      expect(msg).toContain('Falta el paquete del lector de PDF');
      expect(msg).toContain("Cannot find package 'pdfjs-dist'"); // el motivo técnico viaja dentro
      expect(msg).toContain('npm install');
      expect(msg).toContain('NO dentro de functions/');
      expect(msg).toContain('reinicia netlify dev');
      // Sin code pero con el texto característico de Node también dispara.
      expect(mensajePaqueteAusente(new Error("Cannot find package 'x'")))
        .toMatch(/npm install/);
      // Un error cualquiera NO es de paquete: null (siguen Password/InvalidPDF/genérico).
      expect(mensajePaqueteAusente(new Error('otro fallo cualquiera'))).toBeNull();
    },
  );
});

/* ── 5.92 · Formato «lista limpia» y detección automática ── */

const paginasLista = listaLimpiaReal as unknown as InvItem[][];

describe('parseInventarioAuto con el PDF real de la lista limpia del dueño (5.92)', () => {
  const auto = parseInventarioAuto(paginasLista);

  it('detecta el formato lista-limpia y extrae las 72 filas del PDF real', () => {
    expect(auto.formato).toBe('lista-limpia');
    expect(auto.filas).toHaveLength(72);
  });

  it('usa el precio SIN impuesto (decisión del dueño)', () => {
    const porCodigo = new Map(auto.filas.map((f) => [f.codigo, f]));
    expect(porCodigo.get('10500060A')!.costo).toBe(90); // con impuesto sería 104.40
    expect(porCodigo.get('10500060A')!.existencia).toBe(4);
    expect(porCodigo.get('LLAVERO2K')!.costo).toBe(2.4);
    expect(porCodigo.get('WTWK2-11-')!.costo).toBe(313.2);
    expect(porCodigo.get('CE0716')!.descripcion).toBe('CEPILLO 28" HELLA SOFT WIPER MARCO METAL');
  });

  it('crea TAMBIÉN la fila en cero (existencia 0 y precio 0, pedido del dueño)', () => {
    const enCero = auto.filas.find((f) => f.codigo === '339700493');
    expect(enCero).toBeDefined();
    expect(enCero!.existencia).toBe(0);
    expect(enCero!.costo).toBe(0);
  });

  it('códigos repetidos de la lista → sufijo secuencial, sin perder filas (Opción A)', () => {
    const codigos = auto.filas.map((f) => f.codigo);
    // FORROSINT ×7 en la lista → FORROSINT, FORROSINT-2 … FORROSINT-7.
    expect(codigos.filter((c) => c === 'FORROSINT')).toHaveLength(1);
    for (let n = 2; n <= 7; n++) {
      expect(codigos).toContain(`FORROSINT-${n}`);
    }
    // WT4RUNNE ×2 → WT4RUNNE y WT4RUNNE-2.
    expect(codigos).toContain('WT4RUNNE');
    expect(codigos).toContain('WT4RUNNE-2');
    // Cada sufijo conserva SU descripción (son productos distintos).
    const porCodigo = new Map(auto.filas.map((f) => [f.codigo, f]));
    expect(porCodigo.get('FORROSINT')!.descripcion).toContain('NEG/NAR');
    expect(porCodigo.get('FORROSINT-4')!.descripcion).toContain('CHEVROLET');
    expect(porCodigo.get('FORROSINT-6')!.descripcion).toContain('MOMO NEG/NEG');
    expect(porCodigo.get('WT4RUNNE-2')!.descripcion).toContain('4RUNNER');
  });

  it('los únicos avisos son los 7 renombrados (membrete descartado en silencio)', () => {
    expect(auto.problemas).toHaveLength(7);
    auto.problemas.forEach((p) => expect(p).toMatch(/código repetido en la lista, esta fila quedó con el código/));
  });
});

describe('parseInventarioAuto · regresión del formato POS (5.92 no lo rompe)', () => {
  it('el reporte del POS sigue detectándose como «pos» con las mismas filas', () => {
    const auto = parseInventarioAuto(paginas);
    expect(auto.formato).toBe('pos');
    expect(auto.filas.map((f) => f.codigo)).toEqual([
      '021400059245', '021400059252', '021400086319', '021400086630', '0613',
    ]);
  });

  it('la lista limpia NO se parsea como POS y el POS NO como lista limpia', () => {
    // Cabeceras excluyentes: el fixture del POS no trae «Precio USD sin» y
    // el de la lista no trae «Costo Total» — cada uno solo matchea el suyo.
    expect(parseInventario(paginasLista).filas).toHaveLength(0);
    expect(parseListaLimpia(paginas).filas).toHaveLength(0);
  });
});

describe('parseListaLimpia · casos límite (sintéticos con el layout real)', () => {
  // Coordenadas REALES de la lista limpia (fixture del PDF del dueño):
  // cabecera partida en dos renglones y precios alineados a la derecha.
  const cabeceraLista: InvItem[] = [
    { s: 'Código', x: 47.9, y: 484.6, w: 38 },
    { s: 'Descripción', x: 155.6, y: 484.6, w: 65 },
    { s: 'Existencia (unidades)', x: 532.6, y: 484.6, w: 106 },
    { s: 'Precio USD sin', x: 651.6, y: 489.1, w: 71 },
    { s: 'Precio USD con', x: 736.7, y: 489.1, w: 65 },
  ];
  const productoLista = (
    y: number, codigo: string, desc: string, exist: string, sin: string, con: string,
  ): InvItem[] => [
    { s: codigo, x: 47.9, y, w: 43 },
    { s: desc, x: 155.6, y, w: 125 },
    { s: exist, x: 532.6, y, w: 24 },
    { s: sin, x: 696.1, y, w: 26 },
    { s: con, x: 775.6, y, w: 26 },
  ];

  it('sufijo secuencial que SALTA códigos ya ocupados por filas reales', () => {
    // La lista trae FORROSINT, luego un producto real FORROSINT-2 y LUEGO
    // otro FORROSINT repetido: el repetido no puede pisar FORROSINT-2
    // (producto distinto ya importado) → gana FORROSINT-3.
    const { filas, problemas } = parseListaLimpia([
      [
        ...cabeceraLista,
        ...productoLista(461.7, 'FORROSINT', 'FORRO VOLANTE SINTETICO NEG/NAR', '2 und.', '$6.47', '$7.50'),
        ...productoLista(441.7, 'FORROSINT-2', 'FORRO SINTETICO GM CHEVROLET', '1 und.', '$5.60', '$6.50'),
        ...productoLista(421.7, 'FORROSINT', 'FORRO VOLANTE SINTETICO GM MOMO', '4 und.', '$10.34', '$12.00'),
      ],
    ]);
    expect(filas.map((f) => f.codigo)).toEqual(['FORROSINT', 'FORROSINT-2', 'FORROSINT-3']);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain('quedó con el código FORROSINT-3');
  });

  it('renglón envuelto de descripción se anexa al producto anterior', () => {
    const { filas, problemas } = parseListaLimpia([
      [
        ...cabeceraLista,
        ...productoLista(461.7, 'VF2080', 'FILTRO CABINA K&N; TUNDRA', '1 und.', '$58.50', '$67.86'),
        { s: 'LC250-300 / FOR', x: 155.6, y: 441.7, w: 60 }, // continuación de la descripción
      ],
    ]);
    expect(problemas).toEqual([]);
    expect(filas).toHaveLength(1);
    expect(filas[0]!.descripcion).toBe('FILTRO CABINA K&N; TUNDRA LC250-300 / FOR');
  });

  it('fila ilegible (sin precio sin impuesto) → problema y se omite', () => {
    const sinPrecio = productoLista(461.7, 'HC0101', 'CLAXON HAMMER PLATA 12V', '3 und.', '', '$12.00')
      .filter((i) => i.s !== '');
    const { filas, problemas } = parseListaLimpia([[...cabeceraLista, ...sinPrecio]]);
    expect(filas).toHaveLength(0);
    expect(problemas).toEqual(['HC0101: existencia o precio sin impuesto ilegibles, se omitió.']);
  });

  it('membrete, nota y «Página N» se descartan en silencio', () => {
    const ruido: InvItem[] = [
      { s: 'Auto Servicio Montaña Fresca — precios revisados 21/10/2026', x: 36.9, y: 19.8, w: 219.4 },
      { s: 'Precios en USD del reporte original. Existencias en unidades', x: 42.9, y: 522.4, w: 480 },
      { s: 'Página 1', x: 774.7, y: 19.8, w: 30.3 },
      { s: 'ACCESORIOS — LISTA LIMPIA', x: 306.7, y: 538.4, w: 228.5 },
    ];
    const { filas, problemas } = parseListaLimpia([
      [...ruido, ...cabeceraLista, ...productoLista(461.7, '317', 'PULITURA INSTANTANEA TURBO TX PIS', '12 und.', '$8.62', '$10.00')],
    ]);
    expect(problemas).toEqual([]);
    expect(filas).toEqual([
      { codigo: '317', descripcion: 'PULITURA INSTANTANEA TURBO TX PIS', existencia: 12, costo: 8.62 },
    ]);
  });
});
