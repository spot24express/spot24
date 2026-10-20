/**
 * SPOT 24 · POST /.netlify/functions/fn-restoreCatalog
 * Copias de seguridad del catálogo (5.89): RESTAURA una copia REEMPLAZANDO el
 * catálogo completo. Fuente: { snapshotId } (copia en la nube) o { snapshot }
 * (archivo subido por el panel). SOLO admin: el core lo exige. Guarda siempre
 * una copia previa del estado actual antes de tocar nada (red de seguridad).
 */
import { coreRestoreCatalog } from '../../functions/src/backups';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreRestoreCatalog, req);
