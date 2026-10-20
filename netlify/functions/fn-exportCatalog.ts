/**
 * SPOT 24 · POST /.netlify/functions/fn-exportCatalog
 * Copia de seguridad del catálogo (5.89): devuelve el JSON de la copia
 * (catálogo ACTUAL o una copia guardada si llega snapshotId) para que el
 * panel lo descargue como archivo. Admin/gerencia.
 */
import { coreExportCatalog } from '../../functions/src/backups';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreExportCatalog, req);
