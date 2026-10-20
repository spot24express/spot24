/**
 * SPOT 24 · Tests de las copias de seguridad del catálogo — lado PANEL (5.89).
 * Todo lo que aquí se prueba es PURO (sin red, sin Firestore, sin DOM):
 * parseBackupFile valida el archivo subido antes de llegar al servidor,
 * copiaFilename/fechaCorta/bytesLegibles son la presentación de la lista.
 * El backend revalida TODO de nuevo (validateBackupFile en functions/):
 * estas pruebas cubren la primera barrera y la UX de la doble confirmación.
 */
import { describe, expect, it } from 'vitest';
import {
  parseBackupFile, copiaFilename, fechaCorta, bytesLegibles,
  BACKUP_FORMAT, BACKUP_VERSION, type BackupFile,
} from '../features/admin/services/backups.service';

function copiaValida(): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'spot24',
    exportedAt: '2026-10-19T10:00:00.000Z',
    catalog: {
      categories: [
        { id: 'cat1', name: 'Lubricantes', tagline: '', imageUrl: '', active: true, parentId: '', createdAt: 1, updatedAt: 2 },
        { id: 'cat2', name: 'Filtros', tagline: '', imageUrl: '', active: false, parentId: 'cat1', createdAt: 1, updatedAt: 2 },
      ],
      products: [
        {
          id: 'p1', slug: 'aceite-10w40', code: 'A1040', name: 'Aceite 10W40', brand: 'ACME',
          description: '', categoryId: 'cat1', basePriceUsd: 5.5, images: ['https://i.ibb.co/x.jpg'],
          searchTerms: ['aceite'], stockTotal: 7, variantCount: 2, active: true,
          createdAt: 1, updatedAt: 2,
          variants: [
            { id: 'p1-v1', name: '4 L', sku: 'A1040-4L', priceUsd: 5.5, stock: 4, active: true },
            { id: 'p1-v2', name: '1 L', sku: 'A1040-1L', priceUsd: 2.25, stock: 3, active: true },
          ],
        },
        {
          id: 'p2', slug: 'filtro-oil', code: 'F001', name: 'Filtro de aceite', brand: '',
          description: '', categoryId: 'cat2', basePriceUsd: 3, images: [], searchTerms: [],
          stockTotal: 1, variantCount: 1, active: true, createdAt: 1, updatedAt: 2,
          variants: [{ id: 'p2-v1', name: 'Estándar', sku: 'F001', priceUsd: 3, stock: 1, active: true }],
        },
      ],
    },
  };
}

describe('parseBackupFile (archivo subido por el dueño)', () => {
  it('acepta una copia válida y devuelve el resumen para la confirmación', () => {
    const r = parseBackupFile(JSON.stringify(copiaValida()));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.resumen.categorias).toBe(2);
    expect(r.resumen.productos).toBe(2);
    expect(r.resumen.variantes).toBe(3);
    expect(r.resumen.fecha).toBe('2026-10-19T10:00:00.000Z');
    expect(r.file.catalog.products[0]?.variants).toHaveLength(2);
  });

  it('ida y vuelta: el JSON que descarga el panel vuelve a validar igual', () => {
    const texto = JSON.stringify(copiaValida());
    const r = parseBackupFile(texto);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.file.catalog.products[1]?.code).toBe('F001');
  });

  it('rechaza JSON corrupto con un motivo claro', () => {
    const r = parseBackupFile('{"format": "spot24-catalog-backup", "catalog": ');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('JSON');
  });

  it('rechaza un archivo que NO es una copia de SPOT 24', () => {
    const r = parseBackupFile(JSON.stringify({ format: 'otra-app', catalog: {} }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('no es una copia de SPOT 24');
  });

  it('rechaza versión de formato distinta', () => {
    const copia = { ...copiaValida(), version: 999 };
    const r = parseBackupFile(JSON.stringify(copia));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('versión');
  });

  it('rechaza si faltan categorías o productos', () => {
    const sinProductos = { ...copiaValida(), catalog: { categories: [] } };
    const r = parseBackupFile(JSON.stringify(sinProductos));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('incompleta');
  });

  it('rechaza copias por encima del tope defensivo de productos (1000)', () => {
    const copia = copiaValida();
    const productos = Array.from({ length: 1001 }, (_, i) => ({
      ...copia.catalog.products[0],
      id: `p${i}`,
      variants: [],
    }));
    const r = parseBackupFile(JSON.stringify({ ...copia, catalog: { categories: copia.catalog.categories, products: productos } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('1001');
  });
});

describe('copiaFilename (nombre del archivo descargado)', () => {
  it('usa la fecha LOCAL: 19/10/2026 6:05 de la mañana → _0605.json', () => {
    const local = new Date(2026, 9, 19, 6, 5);
    expect(copiaFilename(local.toISOString())).toBe('spot24-catalogo-2026-10-19_0605.json');
  });

  it('completa con ceros: hora y minuto de un dígito', () => {
    const local = new Date(2026, 0, 3, 9, 7);
    expect(copiaFilename(local.toISOString())).toBe('spot24-catalogo-2026-01-03_0907.json');
  });

  it('con fecha inválida no explota: usa el momento actual con el patrón correcto', () => {
    expect(copiaFilename('no-es-una-fecha')).toMatch(/^spot24-catalogo-\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
  });
});

describe('fechaCorta y bytesLegibles (lista del panel)', () => {
  it('fechaCorta: dd/mm/aaaa h:mm a.m./p.m. en hora local', () => {
    expect(fechaCorta(new Date(2026, 9, 19, 6, 5).getTime())).toBe('19/10/2026 6:05 a.m.');
    expect(fechaCorta(new Date(2026, 9, 19, 14, 30).getTime())).toBe('19/10/2026 2:30 p.m.');
  });

  it('fechaCorta: mediodía es p.m. y las 0:15 son 12:15 a.m.', () => {
    expect(fechaCorta(new Date(2026, 9, 19, 12, 0).getTime())).toBe('19/10/2026 12:00 p.m.');
    expect(fechaCorta(new Date(2026, 9, 19, 0, 15).getTime())).toBe('19/10/2026 12:15 a.m.');
  });

  it('fechaCorta: fecha inválida → —', () => {
    expect(fechaCorta(Number.NaN)).toBe('—');
  });

  it('bytesLegibles: KB para copias pequeñas, MB con coma decimal para grandes', () => {
    expect(bytesLegibles(0)).toBe('—');
    expect(bytesLegibles(214 * 1024)).toBe('214 KB');
    expect(bytesLegibles(1.3 * 1024 * 1024)).toBe('1,3 MB');
  });
});
