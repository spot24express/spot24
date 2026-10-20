/**
 * SPOT 24 · Tests de las copias de seguridad del catálogo — lado SERVIDOR (5.89).
 * Los helpers PUROS de functions/src/backups.ts se prueban sin Firestore:
 *  · validateBackupFile: lista blanca + coerción del archivo de copia (lo que
 *    el panel sube o lo que se lee de la nube JAMÁS se confía tal cual).
 *  · chunkJson/joinChunks: troceo por BYTES UTF-8 (los acentos ocupan 2 bytes;
 *    el corte retrocede hasta el inicio de un carácter) respetando el límite
 *    de 1 MiB por documento de Firestore con margen.
 *  · planRotacion: 30 copias por modo (auto y manual rotan por separado).
 *  · normalizeTs: createdAt/updatedAt llegan como número, Timestamp o {seconds}.
 * Los cores con Firestore (assemble/restore) no se tocan aquí: dependen del
 * emulador (patrón de esta suite: lógica pura en node, flujo con emulador).
 */
import { describe, expect, it } from 'vitest';
import {
  validateBackupFile, chunkJson, joinChunks, planRotacion, normalizeTs,
  BACKUP_FORMAT, BACKUP_VERSION, CHUNK_BYTES,
  type BackupFile,
} from '../backups';

function copiaValida(): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    app: 'spot24',
    exportedAt: '2026-10-19T10:00:00.000Z',
    catalog: {
      categories: [
        { id: 'cat1', name: 'Lubricantes', tagline: 'Los mejores', imageUrl: 'https://i.ibb.co/c.jpg', active: true, parentId: '', createdAt: 1, updatedAt: 2 },
      ],
      products: [
        {
          id: 'p1', slug: 'aceite-10w40', code: 'a1040', name: 'Aceite 10W40', brand: 'ACME',
          description: 'Sin acentos Control\u0007 char', categoryId: 'cat1', basePriceUsd: 5.5,
          images: ['https://i.ibb.co/x.jpg', 'javascript:alert(1)', '/img/products/cat1.svg'],
          searchTerms: ['ACEITE', '  ', 'x'], stockTotal: 7, variantCount: 2, active: true,
          createdAt: 1, updatedAt: 2,
          variants: [
            { id: 'p1-v1', name: '4 L', sku: 'a1040-4l', priceUsd: 5.5, stock: 4, active: true },
            { id: 'p1-v2', name: '1 L', sku: '', priceUsd: -3, stock: -5, active: false },
          ],
        },
      ],
    },
  };
}

describe('validateBackupFile (lista blanca y coerción del archivo)', () => {
  it('acepta una copia válida, normaliza y coerce SIN reventar', () => {
    const r = validateBackupFile(copiaValida());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.file.catalog.products[0]!;
    expect(p.code).toBe('A1040'); // código a mayúsculas
    expect(p.description).not.toContain('\u0007'); // caracteres de control fuera
    expect(p.images).toEqual(['https://i.ibb.co/x.jpg', '/img/products/cat1.svg']); // javascript: fuera
    expect(p.searchTerms).toEqual(['aceite', 'x']); // minúsculas + basura vacía fuera (sin filtro de longitud: eso es del alta)
    const v2 = p.variants[1]!;
    expect(v2.priceUsd).toBe(0); // negativo → 0
    expect(v2.stock).toBe(0); // negativo → 0
    expect(v2.sku).toBe('');
    expect(r.file.catalog.categories[0]!.tagline).toBe('Los mejores');
  });

  it('rechaza lo que no es el formato SPOT 24 o tiene versión distinta', () => {
    expect(validateBackupFile(null).ok).toBe(false);
    expect(validateBackupFile('hola').ok).toBe(false);
    const mal = { ...copiaValida(), format: 'otro' };
    const r1 = validateBackupFile(mal);
    if (r1.ok === false) expect(r1.motivo).toContain('no es una copia de SPOT 24');
    expect(r1.ok).toBe(false);
    const vieja = { ...copiaValida(), version: 0 };
    expect(validateBackupFile(vieja).ok).toBe(false);
  });

  it('rechaza catálogo incompleto (sin arrays) o dañado', () => {
    expect(validateBackupFile({ format: BACKUP_FORMAT, version: BACKUP_VERSION }).ok).toBe(false);
    const sinArrays = { ...copiaValida(), catalog: { categories: 'no', products: [] } };
    expect(validateBackupFile(sinArrays).ok).toBe(false);
    const productoRoto = copiaValida();
    productoRoto.catalog.products[0]!.name = '';
    const r = validateBackupFile(productoRoto);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('sin identificador, nombre o categoría');
  });

  it('rechaza productos o categorías repetidos por id', () => {
    const dup = copiaValida();
    dup.catalog.products.push({ ...dup.catalog.products[0]! });
    const r = validateBackupFile(dup);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('productos repetidos');
    const dupCat = copiaValida();
    dupCat.catalog.categories.push({ ...dupCat.catalog.categories[0]! });
    expect(validateBackupFile(dupCat).ok).toBe(false);
  });

  it('rechaza productos que apuntan a categorías que NO vienen en la copia', () => {
    const huerfano = copiaValida();
    huerfano.catalog.products[0]!.categoryId = 'cat-fantasma';
    const r = validateBackupFile(huerfano);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toContain('categorías que no vienen en la copia');
  });

  it('rechaza variantes sin id y catálogos por encima de los topes', () => {
    const sinId = copiaValida();
    sinId.catalog.products[0]!.variants[0]!.id = '';
    const r1 = validateBackupFile(sinId);
    expect(r1.ok).toBe(false);
    if (r1.ok === false) expect(r1.motivo).toContain('variante sin identificador');

    const copia = copiaValida();
    const productos = Array.from({ length: 1001 }, (_, i) => ({
      ...copia.catalog.products[0]!,
      id: `p${i}`,
    }));
    const r2 = validateBackupFile({ ...copia, catalog: { categories: copia.catalog.categories, products: productos } });
    expect(r2.ok).toBe(false);
    if (r2.ok === false) expect(r2.motivo).toContain('(tope 1000)');
  });
});

describe('chunkJson / joinChunks (troceo UTF-8 para documentos de Firestore)', () => {
  it('una copia pequeña NO se trocea: un solo chunk idéntico', () => {
    const json = JSON.stringify(copiaValida());
    const parts = chunkJson(json);
    expect(parts).toHaveLength(1);
    expect(parts[0]).toBe(json);
  });

  it('una copia grande se trocea y el round-trip es EXACTO (acentos incluidos)', () => {
    const json = JSON.stringify({ texto: 'áéíóúñÁÉÍÓÚÑ'.repeat(120_000) }); // ≈ 1,7 MB
    const parts = chunkJson(json);
    expect(parts.length).toBeGreaterThan(1);
    // Cada trozo cabe en el límite de bytes UTF-8 (último puede ser menor).
    for (const parte of parts) {
      expect(Buffer.byteLength(parte, 'utf8')).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expect(joinChunks(parts)).toBe(json);
  });

  it('el corte NUNCA parte un carácter multibyte (á/ñ en la frontera)', () => {
    // Llena hasta dejar 1 byte antes del límite y mete un carácter de 2 bytes:
    // el corte retrocede en vez de partirlo.
    const json = 'a'.repeat(CHUNK_BYTES - 1) + 'ñ' + 'b'.repeat(CHUNK_BYTES);
    const parts = chunkJson(json);
    expect(parts.length).toBeGreaterThanOrEqual(2);
    for (const parte of parts) {
      expect(Buffer.byteLength(parte, 'utf8')).toBeLessThanOrEqual(CHUNK_BYTES);
    }
    expect(joinChunks(parts)).toBe(json);
  });
});

describe('planRotacion (30 copias por tipo)', () => {
  function metas(n: number, mode: string): Array<{ id: string; mode: string }> {
    return Array.from({ length: n }, (_, i) => ({ id: `${mode}-${i}`, mode }));
  }

  it('con 35 automáticas borra las 5 más viejas y no toca las manuales', () => {
    // Orden desc (más nueva primero), como entrega la consulta del backend.
    // metas(35,'auto') genera auto-0…auto-34; reverse deja auto-34 primero →
    // se conservan auto-34…auto-5 y se borran auto-4…auto-0 (las más viejas).
    const borrar = planRotacion([...metas(35, 'auto').reverse(), ...metas(5, 'manual').reverse()]);
    expect(borrar).toEqual(['auto-4', 'auto-3', 'auto-2', 'auto-1', 'auto-0']);
  });

  it('con exactamente 30/30 no borra nada; 31 manuales borra solo la 31ª', () => {
    expect(planRotacion([...metas(30, 'auto'), ...metas(30, 'manual')])).toEqual([]);
    // metas(31) ascendente: manual-0…manual-30 → se conserva manual-0…manual-29
    // y la 31ª (manual-30) es la que sale.
    const borrar = planRotacion([...metas(31, 'manual')]);
    expect(borrar).toEqual(['manual-30']);
  });

  it('ignora metas sin id o con modo desconocido (tratadas como manual)', () => {
    const borrar = planRotacion([
      { id: '', mode: 'auto' },
      { mode: 'auto' },
      { id: 'raro-1', mode: 'desconocido' },
    ]);
    expect(borrar).toEqual([]);
  });
});

describe('normalizeTs (createdAt/updatedAt de cualquier origen)', () => {
  it('número, Timestamp con toMillis, {seconds} y basura', () => {
    expect(normalizeTs(1_700_000_000_123)).toBe(1_700_000_000_123);
    expect(normalizeTs({ toMillis: () => 4_242 })).toBe(4_242);
    expect(normalizeTs({ seconds: 3 })).toBe(3_000);
    expect(normalizeTs(undefined)).toBe(0);
    expect(normalizeTs('no')).toBe(0);
    expect(normalizeTs(-5)).toBe(0);
  });
});
