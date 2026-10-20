/**
 * SPOT 24 · POST /.netlify/functions/fn-saveCatalogBackup
 * Copias de seguridad del catálogo (5.89): guarda UNA copia del estado actual
 * en la nube (modo manual). Es la red de seguridad del dueño antes de cambios
 * grandes (p. ej. antes de importar inventario). Admin/gerencia.
 */
import { coreSaveCatalogBackup } from '../../functions/src/backups';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreSaveCatalogBackup, req);
