/**
 * Módulo admin · Copias de seguridad del catálogo (5.89, a pedido del dueño).
 * ────────────────────────────────────────────────────────────────────
 * · Descargar copia → fn-exportCatalog devuelve el JSON y el navegador lo
 *   guarda como archivo (la copia vive en el teléfono/PC del dueño: gasta 0
 *   de Firebase).
 * · Copias en la nube → snapshots DENTRO de Firestore (colección
 *   catalogBackups): sin Cloud Storage, que el plan gratis (Spark) ya no
 *   incluye. Automáticas diarias a las 6:00 a.m. (cron de Netlify) + las que
 *   el dueño guarde a mano; rotación de las últimas 30 por tipo en el
 *   servidor.
 * · Restaurar → SOLO admin: archivo subido o copia de la nube; reemplaza el
 *   catálogo completo (el servidor guarda siempre una copia previa: volver
 *   atrás siempre es posible).
 * Los tipos son espejo de functions/src/backups.ts (mismo contrato JSON).
 */
import { callFunction } from '@/shared/lib/backend';

/* ── Contratos (espejo del backend) ── */

export interface BackupVariante {
  id: string;
  name: string;
  sku: string;
  priceUsd: number;
  stock: number;
  active: boolean;
}

export interface BackupProducto {
  id: string;
  slug: string;
  code: string;
  name: string;
  brand: string;
  description: string;
  categoryId: string;
  basePriceUsd: number;
  images: string[];
  searchTerms: string[];
  stockTotal: number;
  variantCount: number;
  active: boolean;
  createdAt: number;
  updatedAt: number;
  variants: BackupVariante[];
}

export interface BackupCategoria {
  id: string;
  name: string;
  tagline: string;
  imageUrl: string;
  active: boolean;
  parentId: string;
  createdAt: number;
  updatedAt: number;
}

export interface BackupFile {
  format: string;
  version: number;
  app: string;
  exportedAt: string;
  catalog: { categories: BackupCategoria[]; products: BackupProducto[] };
}

export interface CatalogBackupMeta {
  id: string;
  createdAt: number;
  mode: 'auto' | 'manual';
  counts: { categorias: number; productos: number; variantes: number };
  bytes: number;
  chunks: number;
  note: string;
}

/** Versión de formato que este panel entiende (debe coincidir con el backend). */
export const BACKUP_FORMAT = 'spot24-catalog-backup';
export const BACKUP_VERSION = 1;
/** Tope defensivo igual al del backend: el panel avisa ANTES de subir. */
export const MAX_PRODUCTOS_COPIA = 1000;

/* ── Acciones de servidor ── */

/** Descarga (en memoria) la copia del catálogo ACTUAL o de una copia guardada. */
export function adminExportCatalog(snapshotId?: string): Promise<{ file: BackupFile; bytes: number }> {
  return callFunction<{ file: BackupFile; bytes: number }>(
    'fn-exportCatalog',
    snapshotId ? { snapshotId } : {},
  );
}

/** Lista las copias guardadas en la nube (más nueva primero). */
export function adminListCatalogBackups(): Promise<CatalogBackupMeta[]> {
  return callFunction<{ copias: CatalogBackupMeta[] }>('fn-listCatalogBackups', {})
    .then((r) => r.copias);
}

/** Guarda UNA copia del estado actual en la nube (modo manual). */
export function adminSaveCatalogBackup(): Promise<CatalogBackupMeta> {
  return callFunction<{ copia: CatalogBackupMeta }>('fn-saveCatalogBackup', {})
    .then((r) => r.copia);
}

export interface RestoreResult {
  restaurado: boolean;
  categorias: number;
  productos: number;
  variantes: number;
  productosEliminados: number;
  variantesEliminadas: number;
  categoriasEliminadas: number;
  copiaPrevia: string;
}

/** Restaura SOLO admin: desde copia en la nube (snapshotId) o archivo (snapshot). */
export function adminRestoreCatalog(
  fuente: { snapshotId: string } | { snapshot: BackupFile },
): Promise<RestoreResult> {
  return callFunction<RestoreResult>('fn-restoreCatalog', fuente);
}

/* ── Helpers puros (testeables en node, sin DOM ni red) ── */

export interface ResumenCopia {
  categorias: number;
  productos: number;
  variantes: number;
  fecha: string;
}

/**
 * Valida el texto de un archivo de copia subido por el dueño y devuelve su
 * resumen (para la doble confirmación). Espejo CLIENTE de validateBackupFile
 * del backend: mismo formato, mismo rechazo claro. El servidor revalida todo
 * de nuevo — esto es solo la primera barrera para no subir basura.
 */
export function parseBackupFile(texto: string):
  | { ok: true; file: BackupFile; resumen: ResumenCopia }
  | { ok: false; motivo: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(texto);
  } catch {
    return { ok: false, motivo: 'El archivo no es un JSON legible. ¿Se descargó completo?' };
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, motivo: 'El archivo está vacío o dañado.' };
  }
  const f = raw as Record<string, unknown>;
  if (f['format'] !== BACKUP_FORMAT) {
    return { ok: false, motivo: 'Este archivo no es una copia de SPOT 24.' };
  }
  if (f['version'] !== BACKUP_VERSION) {
    return { ok: false, motivo: 'La copia es de otra versión de la app. Actualiza el panel.' };
  }
  const cat = f['catalog'];
  if (!cat || typeof cat !== 'object') {
    return { ok: false, motivo: 'La copia está incompleta: no trae el catálogo.' };
  }
  const categorias = (cat as Record<string, unknown>)['categories'];
  const products = (cat as Record<string, unknown>)['products'];
  if (!Array.isArray(categorias) || !Array.isArray(products)) {
    return { ok: false, motivo: 'La copia está incompleta: faltan las categorías o los productos.' };
  }
  if (products.length > MAX_PRODUCTOS_COPIA) {
    return { ok: false, motivo: `La copia trae ${products.length} productos (tope ${MAX_PRODUCTOS_COPIA}).` };
  }
  const variantes = products.reduce((a: number, p) => {
    const vars = (p as Record<string, unknown> | null)?.['variants'];
    return a + (Array.isArray(vars) ? vars.length : 0);
  }, 0);
  return {
    ok: true,
    file: raw as unknown as BackupFile,
    resumen: {
      categorias: categorias.length,
      productos: products.length,
      variantes,
      fecha: typeof f['exportedAt'] === 'string' ? f['exportedAt'] : '',
    },
  };
}

/** Nombre de archivo de la copia: spot24-catalogo-2026-10-19_0600.json (hora local). */
export function copiaFilename(exportedAt: string): string {
  const d = exportedAt ? new Date(exportedAt) : new Date();
  const fecha = Number.isNaN(d.getTime()) ? new Date() : d;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `spot24-catalogo-${fecha.getFullYear()}-${p2(fecha.getMonth() + 1)}-${p2(fecha.getDate())}_${p2(fecha.getHours())}${p2(fecha.getMinutes())}.json`;
}

/** Fecha corta para la lista del panel: 19/10/2026 6:00 a.m. (hora local). */
export function fechaCorta(ms: number): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  const p2 = (n: number) => String(n).padStart(2, '0');
  const hora = d.getHours() % 12 || 12;
  const sufijo = d.getHours() < 12 ? 'a.m.' : 'p.m.';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${hora}:${p2(d.getMinutes())} ${sufijo}`;
}

/** Tamaño legible para la lista: 214 KB / 1,3 MB. */
export function bytesLegibles(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/**
 * Descarga el archivo en el navegador del dueño (la ÚNICA parte con DOM:
 * las pruebas cubren el JSON y el nombre, esto solo lo dispara).
 */
export function descargarCopiaArchivo(file: BackupFile): void {
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = copiaFilename(file.exportedAt);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
