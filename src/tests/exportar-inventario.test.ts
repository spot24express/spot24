/**
 * Ronda 5.105 · Exportar inventario a PDF (panel → Productos → «Exportar PDF»).
 * Libra pura: src/features/admin/lib/exportarInventario.ts (sin Firebase).
 * Cubre: filtro por selección de categorías (exacta y por rama), estado
 * activo/inactivo, orden de grupos y de filas (árbol del admin + A-Z),
 * subtotales por categoría, formatos (USD, nombre de archivo) y un SMOKE
 * del generador jsPDF en Node (carta horizontal, ≥1 página).
 */
import { describe, expect, it } from 'vitest';
import type { Product } from '../features/catalog/types';
import type { CategoryDef } from '../shared/constants/categories';
import {
  acortarUrl, alternarRama, crearDocumentoPdf, nombreArchivoInventario,
  prepararInventario, ramaCompleta, usd,
} from '../features/admin/lib/exportarInventario';

const categorias: CategoryDef[] = [
  { id: 'rep', code: '01', name: 'Repuestos', tagline: '' },
  { id: 'bat', code: '', name: 'Baterias', tagline: '', parentId: 'rep' },
  { id: 'acc', code: '', name: 'Accesorios Importados', tagline: '', parentId: 'rep' },
  { id: 'var', code: '02', name: 'Varios', tagline: '' },
  { id: 'lik', code: '03', name: 'Licores', tagline: '' },
];

let n = 0;
function prod(partial: Partial<Product>): Product {
  n += 1;
  return {
    id: `p${n}`,
    slug: `p${n}`,
    name: `PIEZA ${n}`,
    brand: '',
    description: '',
    categoryId: 'acc',
    basePriceUsd: 10,
    images: [],
    searchTerms: [],
    stockTotal: 5,
    variantCount: 1,
    active: true,
    createdAt: 1729600000000,
    updatedAt: 1729600000000,
    ...partial,
  };
}

describe('usd (formato de precio del PDF)', () => {
  it('miles con coma y SIEMPRE 2 decimales', () => {
    expect(usd(1234.5)).toBe('$1,234.50');
    expect(usd(0)).toBe('$0.00');
    expect(usd(97.957 + 0.003)).toBe('$97.96');
    expect(usd(-2)).toBe('-$2.00');
  });
});

describe('acortarUrl (una URL no tiene espacios: no puede envolverse)', () => {
  it('no toca las cortas y recorta las largas con «…» (sin desbordar la tabla)', () => {
    expect(acortarUrl('https://i.ibb.co/abc/x.png')).toBe('https://i.ibb.co/abc/x.png');
    const larga = 'https://i.ibb.co/673pYssc/Sin-t-tulo-para-fotos-con-nombre-muy-largo.png';
    const cortada = acortarUrl(larga, 44);
    expect(cortada.length).toBeLessThanOrEqual(44);
    expect(cortada.endsWith('…')).toBe(true);
    expect(larga.startsWith(cortada.slice(0, -1))).toBe(true); // prefijo real
  });
});

describe('nombreArchivoInventario', () => {
  it('usa la fecha LOCAL con mes y día a 2 dígitos', () => {
    expect(nombreArchivoInventario(new Date(2026, 9, 26))).toBe('inventario-spot24-2026-10-26.pdf');
    expect(nombreArchivoInventario(new Date(2026, 0, 3))).toBe('inventario-spot24-2026-01-03.pdf');
  });
});

describe('alternarRama / ramaCompleta (árbol de selección del diálogo)', () => {
  const marcadas = new Set(['rep', 'bat', 'acc', 'var']);

  it('rama completa → pulsar la principal la desmarca ENTERA (subs incluidas)', () => {
    expect(ramaCompleta(categorias, marcadas, 'rep')).toBe(true);
    const trasPulsar = alternarRama(categorias, marcadas, 'rep');
    expect([...trasPulsar].sort()).toEqual(['var']);
    expect(ramaCompleta(categorias, trasPulsar, 'rep')).toBe(false);
  });

  it('rama incompleta (falta una sub) → pulsar la principal marca TODO', () => {
    const sinBat = new Set(['rep', 'acc', 'var']);
    expect(ramaCompleta(categorias, sinBat, 'rep')).toBe(false);
    const trasPulsar = alternarRama(categorias, sinBat, 'rep');
    expect(ramaCompleta(categorias, trasPulsar, 'rep')).toBe(true);
    expect(trasPulsar.has('bat')).toBe(true);
  });

  it('no toca otras ramas', () => {
    const soloVar = new Set(['var']);
    const trasPulsar = alternarRama(categorias, soloVar, 'rep');
    expect(trasPulsar.has('var')).toBe(true);
    expect(trasPulsar.has('rep')).toBe(true); // la pulsada se marca completa
    expect(trasPulsar.has('lik')).toBe(false);
  });
});

describe('prepararInventario', () => {
  const productos = [
    prod({ name: 'ZORRERA', categoryId: 'acc', stockTotal: 3, basePriceUsd: 20 }),
    prod({ name: 'ALICATE', categoryId: 'acc', stockTotal: 1, basePriceUsd: 22, code: 'A-1' }),
    prod({ name: 'BATERIA 12V', categoryId: 'bat', stockTotal: 2, basePriceUsd: 50, brand: 'ACDelco' }),
    prod({ name: 'SANGRIA CAJA', categoryId: 'lik', stockTotal: 4, basePriceUsd: 9.5, active: false }),
    prod({ name: 'MALTIN BULTO', categoryId: 'var', stockTotal: 6, basePriceUsd: 14 }),
    prod({ name: 'FANTASMA', categoryId: 'cat-eliminada', stockTotal: 1, basePriceUsd: 5 }),
  ];

  it('selecciona SOLO las categorías marcadas (exactas) y respeta el estado', () => {
    const r = prepararInventario(productos, categorias, new Set(['acc']), false);
    expect(r.filas.map((f) => f.nombre)).toEqual(['ALICATE', 'ZORRERA']); // A-Z
    expect(r.filas.every((f) => f.estado === 'Activo')).toBe(true);
    expect(r.soloActivos).toBe(true);
  });

  it('incluirInactivos los trae con su estado (columna Estado del dueño)', () => {
    const r = prepararInventario(productos, categorias, new Set(['lik']), true);
    expect(r.filas).toHaveLength(1);
    expect(r.filas[0]).toMatchObject({
      nombre: 'SANGRIA CAJA', estado: 'Inactivo', precioUsd: 9.5, stock: 4,
    });
    expect(r.soloActivos).toBe(false);
  });

  it('etiqueta padre / sub; principal sola; categoría eliminada → «Sin categoría»', () => {
    const r = prepararInventario(productos, categorias, new Set(['acc', 'bat', 'cat-eliminada']), true);
    const porNombre = new Map(r.filas.map((f) => [f.nombre, f.categoria]));
    expect(porNombre.get('BATERIA 12V')).toBe('Repuestos / Baterias');
    expect(porNombre.get('ALICATE')).toBe('Repuestos / Accesorios Importados');
    expect(porNombre.get('FANTASMA')).toBe('Sin categoría');
  });

  it('grupos en el ORDEN DEL ÁRBOL (Repuestos → Varios → Licores → Sin categoría) con subtotal al cierre', () => {
    // «todas» + un categoryId huérfano (categoría borrada tras cargar la
    // lista): el producto entra si su id sigue marcado, y el preparador lo
    // manda al grupo defensivo «Sin categoría» al final.
    const todas = new Set([...categorias.map((c) => c.id), 'cat-eliminada']);
    const r = prepararInventario(productos, categorias, todas, true);
    const grupos = r.subtotales.map((s) => s.categoria);
    expect(grupos).toEqual(['Repuestos', 'Varios', 'Licores', 'Sin categoría']);
    const rep = r.subtotales[0]!;
    expect(rep).toMatchObject({ productos: 3, stock: 6, valorUsd: 20 * 3 + 22 * 1 + 50 * 2 });
    expect(r.totalProductos).toBe(6);
    expect(r.categoriasIncluidas).toEqual([
      'Licores',
      'Repuestos / Accesorios Importados',
      'Repuestos / Baterias',
      'Sin categoría',
      'Varios',
    ]);
  });

  it('campos de la fila del dueño: código «—» si no tiene, marca, portada y descripción', () => {
    const r = prepararInventario(
      [prod({
        name: 'TERMO', code: '', brand: 'Stanley', description: 'Mantiene el frío 24 h',
        images: ['https://fotos.example/termo.jpg'], categoryId: 'var', stockTotal: 2, basePriceUsd: 13.336,
      })],
      categorias, new Set(['var']), true,
    );
    expect(r.filas[0]).toMatchObject({
      codigo: '—', nombre: 'TERMO', marca: 'Stanley',
      categoria: 'Varios', estado: 'Activo', precioUsd: 13.336, stock: 2,
      descripcion: 'Mantiene el frío 24 h',
      foto: 'https://fotos.example/termo.jpg',
    });
  });

  it('selección vacía → cero filas (la UI avisa y no genera PDF)', () => {
    const r = prepararInventario(productos, categorias, new Set(), true);
    expect(r.filas).toHaveLength(0);
    expect(r.subtotales).toHaveLength(0);
    expect(r.valorUsdTotal).toBe(0);
  });
});

describe('crearDocumentoPdf (smoke en Node: carta horizontal, texto puro)', () => {
  it('genera un PDF real con encabezado y filas, ≥ 1 página', async () => {
    const datos = prepararInventario(
      [
        prod({ name: 'ALICATE 5 EN 1', code: 'A-1', brand: 'Irimo', stockTotal: 1, basePriceUsd: 22.02, description: 'Pinza múltiple con cortador de cable' }),
        prod({ name: 'BULTO MALTIN POLAR', categoryId: 'var', stockTotal: 6, basePriceUsd: 14 }),
      ],
      categorias,
      new Set(['acc', 'var']),
      true,
    );
    const doc = (await crearDocumentoPdf(datos)) as {
      getNumberOfPages: () => number;
      output: (t: 'arraybuffer') => ArrayBuffer;
    };
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  }, 30_000);
});
