/**
 * SPOT 24 · POST /.netlify/functions/fn-listCatalogBackups
 * Copias de seguridad del catálogo (5.89): lista las copias guardadas en la
 * nube (solo metas: fecha, modo, conteos, bytes — jamás el contenido).
 * Admin/gerencia.
 */
import { coreListCatalogBackups } from '../../functions/src/backups';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreListCatalogBackups, req);
